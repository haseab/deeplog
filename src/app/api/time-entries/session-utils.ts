import { type NextRequest } from "next/server";
import {
  addCalendarDays,
  isValidTimeZone,
  wallTimeToUtcCandidates,
} from "@/lib/timezone";

export type SessionApiSetup = {
  sessionToken: string;
  workspaceId: number;
  organizationId: number;
  userId: number;
  profileTimeZone: string;
};

export async function setupSessionApi(
  request: NextRequest
): Promise<SessionApiSetup> {
  // Get session token from headers (sent from frontend)
  const sessionToken = request.headers.get("x-toggl-session-token");

  if (!sessionToken) {
    throw new Error("Toggl session token is required");
  }

  // First, get user info and workspace details
  const meResponse = await fetch("https://track.toggl.com/api/v9/me", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    signal: request.signal,
  });

  if (!meResponse.ok) {
    if (meResponse.status === 401) {
      throw new Error("Session expired - please reauthenticate");
    }
    console.error("Failed to fetch user info:", await meResponse.text());
    throw new Error("Failed to authenticate with Toggl");
  }

  const userData = await meResponse.json();
  const userId = userData.id;
  const profileTimeZone = isValidTimeZone(userData.timezone)
    ? userData.timezone
    : "UTC";

  // Get workspaces
  const workspacesResponse = await fetch(
    "https://track.toggl.com/api/v9/workspaces",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      signal: request.signal,
    }
  );

  if (!workspacesResponse.ok) {
    console.error(
      "Failed to fetch workspaces:",
      await workspacesResponse.text()
    );
    throw new Error("Failed to fetch workspaces from Toggl");
  }

  const workspaces = await workspacesResponse.json();
  if (!workspaces || workspaces.length === 0) {
    throw new Error("No workspaces found");
  }

  // Use the first workspace (typically the default one)
  const workspace = workspaces[0];
  const workspaceId = workspace.id;
  const organizationId = workspace.organization_id;

  return { sessionToken, workspaceId, organizationId, userId, profileTimeZone };
}

export function createErrorResponse(message: string, status: number = 500) {
  return new Response(
    JSON.stringify({
      error: message,
      status: status,
      isSessionExpired: status === 401 && message.includes("session")
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Transform Analytics API response to match our frontend format
export function transformAnalyticsData(apiResponse: {
  dictionaries?: {
    projects?: Record<string, { name: string; color?: string }>;
    tags?: Record<string, { name: string }>;
  };
  data_table?: unknown[][];
}, profileTimeZone: string) {
  const dictionaries = apiResponse.dictionaries || {};

  // Transform projects dictionary
  const projectDict = Object.fromEntries(
    Object.entries(dictionaries.projects || {}).map(([id, proj]) => [
      id,
      { name: proj.name, color: proj.color || "#6b7280" }
    ])
  );

  // Transform tags dictionary
  const tagDict = Object.fromEntries(
    Object.entries(dictionaries.tags || {}).map(([id, tag]) => [
      id,
      tag.name
    ])
  );

  const dataTable = apiResponse.data_table || [];
  if (dataTable.length === 0) return [];

  const headers = dataTable[0] as string[];
  const rows = dataTable.slice(1);

  return rows.map((row) => {
    const entry = Object.fromEntries(headers.map((h, i) => [h, (row as unknown[])[i]])) as Record<string, unknown>;
    const projectId = entry.project_id as string | number | undefined;
    const project = projectId ? projectDict[projectId] || { name: "", color: "#6b7280" } : { name: "", color: "#6b7280" };

    // Analytics reports wall-clock fields in the Toggl profile timezone.
    // Resolve them to canonical UTC instants before returning them to clients.
    const startDate = entry.start_date as string;
    const startTime = entry.start_time as string;
    const stopTime = entry.stop_time as string | undefined;
    const tagIds = (entry.tag_ids || []) as string[];
    const duration = entry.duration as number;
    const startCandidates = wallTimeToUtcCandidates(startDate, startTime, profileTimeZone);
    if (startCandidates.length === 0) {
      console.warn("[API] Skipping Analytics entry with an invalid local start time", {
        id: entry.time_entry_id,
        startDate,
        startTime,
        profileTimeZone,
      });
      return null;
    }

    let startDateTime = startCandidates[0];
    let timezoneAmbiguous = startCandidates.length > 1;
    if (startCandidates.length > 1 && stopTime && Number.isFinite(duration)) {
      const stopDate = stopTime < startTime ? addCalendarDays(startDate, 1) : startDate;
      const stopCandidates = wallTimeToUtcCandidates(stopDate, stopTime, profileTimeZone);
      const matchingStarts = startCandidates.filter((candidate) =>
        stopCandidates.some((stopCandidate) =>
          Math.abs(stopCandidate.getTime() - candidate.getTime() - duration) < 1000
        )
      );
      if (matchingStarts.length === 1) {
        startDateTime = matchingStarts[0];
        timezoneAmbiguous = false;
      }
    }

    const actualStopDateTime = Number.isFinite(duration) && duration >= 0
      ? new Date(startDateTime.getTime() + duration).toISOString()
      : null;

    return {
      id: entry.time_entry_id as number,
      description: (entry.description as string) || "",
      project_id: projectId,
      project_name: project.name,
      project_color: project.color,
      start: startDateTime.toISOString(),
      stop: actualStopDateTime,
      // Analytics API returns duration in milliseconds, convert to seconds
      duration: Math.round(duration / 1000),
      tags: tagIds.map((tagId) => tagDict[tagId] || `Tag_${tagId}`),
      tag_ids: tagIds,
      _timezoneAmbiguous: timezoneAmbiguous,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
