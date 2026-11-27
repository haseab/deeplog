import type { NextRequest } from "next/server";
import { setupSessionApi, createErrorResponse } from "../../session-utils";
import { togglFetch } from "@/lib/toggl-fetch";
import { TogglRateLimitError } from "@/lib/toggl-rate-limit";

export async function GET(request: NextRequest) {
  try {
    const { sessionToken, userId, workspaceId, profileTimeZone } = await setupSessionApi(request);
    const account = `${userId}:${workspaceId}`;
    if (request.nextUrl.searchParams.get("account_only") === "1") return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
    const headers = { Authorization: `Bearer ${sessionToken}`, Accept: "application/json" };
    const all = async (resource: string) => {
      const results: unknown[] = [];
      for (let page = 1; ; page++) {
        const response = await togglFetch(`https://track.toggl.com/api/v9/workspaces/${workspaceId}/${resource}?page=${page}&per_page=200`, { headers, signal: request.signal });
        if (!response.ok) return createErrorResponse(response.status === 401 ? "Session expired - please reauthenticate" : "Could not load search options", response.status === 401 ? 401 : 502);
        const items = await response.json();
        if (!Array.isArray(items)) return createErrorResponse("Invalid search options", 502);
        results.push(...items);
        if (items.length < 200) return results;
      }
    };
    const projects = await all("projects");
    if (projects instanceof Response) return projects;
    const tags = await all("tags");
    if (tags instanceof Response) return tags;
    return Response.json({ projects, tags, profileTimeZone, account }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TogglRateLimitError) return error.response();
    if (error instanceof Error && error.message === "Toggl session token is required") return createErrorResponse(error.message, 400);
    if (error instanceof Error && error.message.includes("reauthenticate")) return createErrorResponse(error.message, 401);
    return createErrorResponse("Could not load search options", 502);
  }
}
