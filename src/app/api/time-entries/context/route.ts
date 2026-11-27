import { NextRequest } from "next/server";
import { togglFetch } from "@/lib/toggl-fetch";
import { TogglRateLimitError } from "@/lib/toggl-rate-limit";
import { compareEntryOrder } from "@/lib/entry-search";
import { addCalendarDays, formatDateInTimeZone } from "@/lib/timezone";
import { setupSessionApi, createErrorResponse } from "../session-utils";
import { GET as searchEntries } from "../search/route";
import type { TimeEntry } from "@/types";

/** Read a small chronological neighborhood, independent of search filters. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("entry");
  const direction = request.nextUrl.searchParams.get("direction") ?? "around";
  if (!id || !/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)) || !["around", "older", "newer"].includes(direction)) return createErrorResponse("Invalid context request", 400);
  try {
    const { sessionToken, workspaceId, profileTimeZone } = await setupSessionApi(request);
    const canonical = await togglFetch(`https://track.toggl.com/api/v9/me/time_entries/${id}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${sessionToken}` }, signal: request.signal,
    });
    if (!canonical.ok) return createErrorResponse(canonical.status === 401 ? "Session expired - please reauthenticate" : "Entry is no longer available", canonical.status === 404 ? 404 : canonical.status === 401 ? 401 : 502);
    const anchor = await canonical.json();
    if (Number(anchor.workspace_id ?? anchor.wid) !== workspaceId || !Number.isFinite(Date.parse(anchor.start))) return createErrorResponse("Entry is outside the current workspace", 404);
    const day = formatDateInTimeZone(new Date(anchor.start), profileTimeZone);
    const today = formatDateInTimeZone(new Date(), profileTimeZone);
    const count = direction === "around" ? 5 : 10;
    let newer: TimeEntry[] = [], older: TimeEntry[] = [], target: TimeEntry | undefined;
    let from = day, to = day;
    for (const span of [0, 1, 7, 30, 365, 3650, 30000]) {
      from = direction === "newer" ? day : addCalendarDays(day, -span);
      if (from < "1970-01-01") from = "1970-01-01";
      to = direction === "older" ? day : addCalendarDays(day, span);
      if (to > today) to = today > day ? today : day;
      const entries = new Map<number, TimeEntry>();
      for (let page = 0; ; page++) {
        // Avoid monopolizing a credential on unusually dense calendar days.
        if (page >= 50) return createErrorResponse("This context contains too many entries to load safely. Open a narrower timeline range.", 422);
        const url = new URL("/api/time-entries/search", request.url);
        url.search = new URLSearchParams({ from_date: from, to_date: to, page: String(page), limit: "100" }).toString();
        const response = await searchEntries(new NextRequest(url, { headers: request.headers, signal: request.signal }));
        if (!response.ok) return response;
        const data = await response.json();
        for (const entry of data.timeEntries as TimeEntry[]) entries.set(entry.id, entry);
        const sorted = [...entries.values()].sort(compareEntryOrder);
        target = sorted.find(entry => entry.id === Number(id));
        newer = sorted.filter(entry => compareEntryOrder(entry, anchor) < 0);
        older = sorted.filter(entry => compareEntryOrder(entry, anchor) > 0);
        if (!data.pagination.hasMore || (direction !== "newer" && older.length > count)) break;
      }
      const enoughNewer = direction === "older" || newer.length > count || to >= today;
      const enoughOlder = direction === "newer" || older.length > count || from === "1970-01-01";
      if (enoughNewer && enoughOlder) break;
    }
    const timeEntries = direction === "newer" ? newer.slice(-count)
      : direction === "older" ? older.slice(0, count)
      : [...newer.slice(-count), ...(target ? [target] : []), ...older.slice(0, count)];
    if (direction === "around" && !target) return createErrorResponse("Entry is not available in the timeline report yet. Try again shortly.", 404);
    return Response.json({
      timeEntries, profileTimeZone,
      hasNewer: newer.length > count || (newer.length >= count && to < today),
      hasOlder: older.length > count || (older.length >= count && from > "1970-01-01"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TogglRateLimitError) return error.response();
    if (error instanceof Error && error.message === "Toggl session token is required") return createErrorResponse(error.message, 400);
    if (error instanceof Error && error.message.includes("reauthenticate")) return createErrorResponse(error.message, 401);
    return createErrorResponse("Could not load entry context", 502);
  }
}
