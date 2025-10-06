import { type NextRequest } from "next/server";

export type SessionApiSetup = {
  sessionToken: string;
  workspaceId: number;
  organizationId: number;
  userId: number;
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

  // Get workspaces
  const workspacesResponse = await fetch(
    "https://track.toggl.com/api/v9/workspaces",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
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

  return { sessionToken, workspaceId, organizationId, userId };
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
}) {
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

    // Combine start_date and times to create full ISO strings
    const startDate = entry.start_date as string;
    const startTime = entry.start_time as string;
    const stopTime = entry.stop_time as string | undefined;

    const startDateTime = `${startDate}T${startTime}`;
    const stopDateTime = stopTime ? `${startDate}T${stopTime}` : null;

    // Handle overnight entries - if stop_time is before start_time, it's the next day
    let actualStopDateTime = stopDateTime;
    if (stopDateTime && stopTime && stopTime < startTime) {
      const nextDay = new Date(startDate);
      nextDay.setDate(nextDay.getDate() + 1);
      actualStopDateTime = `${nextDay.toISOString().split('T')[0]}T${stopTime}`;
    }

    const tagIds = (entry.tag_ids || []) as string[];
    const duration = entry.duration as number;

    return {
      id: entry.time_entry_id as number,
      description: (entry.description as string) || "",
      project_id: projectId,
      project_name: project.name,
      project_color: project.color,
      start: startDateTime,
      stop: actualStopDateTime,
      // Analytics API returns duration in milliseconds, convert to seconds
      duration: Math.round(duration / 1000),
      tags: tagIds.map((tagId) => tagDict[tagId] || `Tag_${tagId}`),
      tag_ids: tagIds
    };
  });
}