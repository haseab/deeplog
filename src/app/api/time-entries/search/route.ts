import { type NextRequest } from "next/server";
import { calendarRangeToUtc } from "@/lib/timezone";
import {
  createErrorResponse,
  setupSessionApi,
  transformAnalyticsData,
} from "../session-utils";

// Mirrors Track's Detailed report description search, observed in Chrome.
// Dates are inclusive calendar dates in the authenticated Toggl profile timezone.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim();
  const fromDate = params.get("from_date");
  const toDate = params.get("to_date");
  const pageText = params.get("page") ?? "0";
  const limitText = params.get("limit") ?? "100";
  const page = Number(pageText);
  const limit = Number(limitText);

  if (!query) return createErrorResponse("q is required", 400);
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
    const response = await fetch(
      `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json&include_dicts=true`,
      {
        method: "POST",
        headers,
        cache: "no-store",
        signal: request.signal,
        body: JSON.stringify({
          modifiers: {},
          transformations: [],
          period: { from: fromDate, to: toDate },
          filters: [
            { property: "workspace_id", operator: "=", value: workspaceId },
            { property: "user_id", operator: "=", value: userId },
            { operator: "and", conditions: [{ property: "description", operator: "contains", value: query }] },
          ],
          attributes: ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"].map((property) => ({ property })),
          ordinations: [{ property: "start", direction: "desc", nulls: "first" }],
          // Deeplog uses zero-based pages; Track uses one-based pages.
          pagination: { per_page: limit, page: page + 1 },
        }),
      }
    );
    if (response.status === 401) return createErrorResponse("Session expired - please reauthenticate", 401);
    if (!response.ok) return createErrorResponse("Failed to search time entries in Toggl", response.status === 429 ? 429 : 502);

    const data = await response.json();
    if (!Array.isArray(data.data_table)) return createErrorResponse("Invalid search response from Toggl", 502);
    const entries = transformAnalyticsData(data, profileTimeZone);
    const timeEntries = await Promise.all(entries.map(async (entry) => {
      if (entry._timezoneAmbiguous) {
        const canonicalResponse = await fetch(`https://track.toggl.com/api/v9/me/time_entries/${entry.id}`, {
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
    return Response.json({
      timeEntries,
      pagination: {
        page, limit,
        // Analytics supplies no total here. A full page may require one final
        // empty request to establish that there are no more matches.
        hasMore: data.data_table.length - 1 >= limit,
      },
      profileTimeZone,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Toggl session token is required") return createErrorResponse(error.message, 400);
      if (error.message.includes("reauthenticate")) return createErrorResponse(error.message, 401);
      if (error.message === "No workspaces found") return createErrorResponse(error.message, 404);
    }
    return createErrorResponse("Failed to search time entries in Toggl", 502);
  }
}
