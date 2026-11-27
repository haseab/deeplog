import { TogglRateLimitError } from "@/lib/toggl-rate-limit";
import { togglFetch } from "@/lib/toggl-fetch";
import { type NextRequest } from "next/server";
import { entrySearchFilters, isDescriptionMatch, descriptionMatch, validDescriptionConditions, type DescriptionCondition } from "@/lib/entry-search";
import { calendarRangeToUtc } from "@/lib/timezone";
import {
  createErrorResponse,
  setupSessionApi,
  transformAnalyticsData,
} from "../session-utils";

// Use Track Analytics filters before pagination, including list-valued tags.
// Dates are inclusive calendar dates in the authenticated Toggl profile timezone.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim();
  const projects = params.get("projects")?.split(",") ?? [];
  const tags = params.get("tags")?.split(",") ?? [];
  const match = params.get("match") ?? "phrase";
  const combine = params.get("combine") ?? "and";
  let conditions: DescriptionCondition[] = [];
  if (params.has("conditions")) {
    try {
      const parsed = JSON.parse(params.get("conditions")!);
      if (!validDescriptionConditions(parsed)) return createErrorResponse("Invalid description rules", 400);
      conditions = parsed;
    } catch { return createErrorResponse("Invalid description rules", 400); }
  }
  const validId = (id: string) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  if (projects.some(id => id !== "none" && !validId(id)) || tags.some(id => !validId(id)) || !isDescriptionMatch(match) || !["and", "or"].includes(combine)) {
    return createErrorResponse("Invalid search filters", 400);
  }
  const fromDate = params.get("from_date");
  const toDate = params.get("to_date");
  const pageText = params.get("page") ?? "0";
  const limitText = params.get("limit") ?? "100";
  const page = Number(pageText);
  const limit = Number(limitText);

  if (params.has("q") && (!query || query.length > 3000)) return createErrorResponse("q must contain 1 to 3000 characters", 400);
  if (descriptionMatch(match).needsText && match !== "phrase" && !query) return createErrorResponse("This description rule needs text", 400);
  if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return createErrorResponse("from_date and to_date are required in YYYY-MM-DD format", 400);
  }
  const range = calendarRangeToUtc(fromDate, toDate, "UTC");
  if (!range || !calendarRangeToUtc(toDate, toDate, "UTC") || range.endExclusive <= range.start) {
    return createErrorResponse("Invalid date range", 400);
  }
  if (!/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page >= Number.MAX_SAFE_INTEGER || !/^\d+$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return createErrorResponse("page must be a non-negative integer and limit must be between 1 and 100", 400);
  }

  try {
    const { sessionToken, workspaceId, organizationId, userId, profileTimeZone } = await setupSessionApi(request);
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    };
    const payload = {
      modifiers: {},
      transformations: [],
      period: { from: fromDate, to: toDate },
      filters: entrySearchFilters({ text: query ?? "", match, projects, tags, conditions, combine: combine as "and" | "or", from: fromDate, to: toDate }, { workspaceId, userId }),
      attributes: ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"].map((property) => ({ property })),
      ordinations: [{ property: "start", direction: "desc", nulls: "first" }],
      // Deeplog uses zero-based pages; Track uses one-based pages.
      pagination: { per_page: limit, page: page + 1 },
    };
    const response = await togglFetch(
      `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json&include_dicts=true`,
      {
        method: "POST",
        headers,
        cache: "no-store",
        signal: request.signal,
        body: JSON.stringify(payload),
      }
    );
    if (response.status === 401) return createErrorResponse("Session expired - please reauthenticate", 401);
    if (response.status === 402) return createErrorResponse("Toggl could not run these filters on the current plan.", 402);
    if (!response.ok) return createErrorResponse("Failed to search time entries in Toggl", response.status === 429 ? 429 : 502);

    const data = await response.json();
    if (!Array.isArray(data.data_table)) return createErrorResponse("Invalid search response from Toggl", 502);
    const entries = transformAnalyticsData(data, profileTimeZone);
    const timeEntries = await Promise.all(entries.map(async (entry) => {
      if (entry._timezoneAmbiguous) {
        const canonicalResponse = await togglFetch(`https://track.toggl.com/api/v9/me/time_entries/${entry.id}`, {
          headers, cache: "no-store", signal: request.signal,
        });
        if (canonicalResponse.status === 401) throw new Error("Session expired - please reauthenticate");
        if (!canonicalResponse.ok) throw new Error("Failed to resolve search entry timezone");
        const canonical = await canonicalResponse.json();
        entry.start = new Date(canonical.start).toISOString();
        entry.stop = canonical.stop ? new Date(canonical.stop).toISOString() : null;
        entry.duration = canonical.duration;
      }
      // Keep the internal timezone marker out of the API contract.
      const { _timezoneAmbiguous, ...result } = entry;
      void _timezoneAmbiguous;
      return result;
    }));
    const rowCount = Math.max(0, data.data_table.length - 1);
    let total: number | undefined = rowCount < limit && (page === 0 || rowCount > 0) ? page * limit + rowCount : undefined;
    // Track uses a separate count aggregation. Only count a full first page;
    // short pages already establish the end, and the client retains this total.
    if (page === 0 && rowCount >= limit) {
      try {
        const countResponse = await togglFetch(
          `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json_row&include_dicts=false`,
          { method: "POST", headers, cache: "no-store", signal: request.signal,
            body: JSON.stringify({ period: payload.period, filters: payload.filters, aggregations: [{ function: "count", property: "time_entry_id" }] }) },
        );
        if (countResponse.status === 401) throw new Error("Session expired - please reauthenticate");
        if (countResponse.ok) {
          const count = (await countResponse.json()).data_json_row?.[0]?.count_time_entry_id;
          // Separate reads may observe concurrent changes. Never hide rows already returned.
          if (Number.isSafeInteger(count) && count >= rowCount) total = count;
        }
      } catch (error) {
        if (error instanceof TogglRateLimitError || request.signal.aborted || (error instanceof Error && error.message.includes("reauthenticate"))) throw error;
        // A count is optional. Keep successfully loaded entries if it is unavailable.
        // The shared transport still honors any upstream rate/quota cooldown.
      }
    }
    return Response.json({
      // Toggl already filtered this page. Do not discard matches locally after pagination.
      timeEntries,
      pagination: {
        page, limit,
        ...(total !== undefined ? { total } : {}),
        hasMore: total !== undefined ? (page + 1) * limit < total : rowCount >= limit,
      },
      profileTimeZone,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof TogglRateLimitError) return error.response();
    if (error instanceof Error) {
      if (error.message === "Toggl session token is required") return createErrorResponse(error.message, 400);
      if (error.message.includes("reauthenticate")) return createErrorResponse(error.message, 401);
      if (error.message === "No workspaces found") return createErrorResponse(error.message, 404);
    }
    return createErrorResponse("Failed to search time entries in Toggl", 502);
  }
}
