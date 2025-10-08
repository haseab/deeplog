import { type NextRequest } from "next/server";
import {
  createErrorResponse,
  setupSessionApi,
  transformAnalyticsData,
} from "./session-utils";

type Project = {
  id: number;
  name: string;
  color: string;
  active?: boolean;
};

type Tag = {
  id: number;
  name: string;
};

export async function GET(request: NextRequest) {
  try {
    const { sessionToken, workspaceId, organizationId, userId } =
      await setupSessionApi(request);

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "100");

    if (!startDate || !endDate) {
      return createErrorResponse("start_date and end_date are required", 400);
    }

    // Fetch projects using regular API
    const projectsResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects?page=1&per_page=200&active=true&only_me=true&sort_field=client_name&pinned=false`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!projectsResponse.ok) {
      if (projectsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      console.error("Failed to fetch projects:", await projectsResponse.text());
      return createErrorResponse("Failed to fetch projects from Toggl");
    }

    // Fetch all tags with pagination
    let tags: Tag[] = [];
    let currentPage = 1;
    const perPage = 200; // Max per page for tags API
    let hasMoreTags = true;

    while (hasMoreTags) {
      const tagsResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/tags?page=${currentPage}&per_page=${perPage}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (tagsResponse.ok) {
        const pageTags: Tag[] = await tagsResponse.json();
        tags = [...tags, ...pageTags];

        // If we got fewer tags than per_page, we've reached the end
        hasMoreTags = pageTags.length === perPage;
        currentPage++;
      } else if (tagsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      } else {
        console.error("Failed to fetch tags:", await tagsResponse.text());
        hasMoreTags = false;
      }
    }

    const projects: Project[] = await projectsResponse.json();
    const activeProjects = projects.filter(
      (project) => project.active !== false
    );

    // Fetch time entries using Analytics API - single call, no pagination needed!
    const analyticsResponse = await fetch(
      `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json&include_dicts=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          period: {
            from: startDate.split("T")[0], // Extract date part only
            to: endDate.split("T")[0], // Extract date part only
          },
          filters: [
            {
              property: "workspace_id",
              operator: "=",
              value: parseInt(workspaceId.toString()),
            },
            {
              property: "user_id",
              operator: "=",
              value: parseInt(userId.toString()),
            },
          ],
          attributes: [
            { property: "time_entry_id" },
            { property: "description" },
            { property: "start_date" },
            { property: "start_time" },
            { property: "stop_time" },
            { property: "duration" },
            { property: "project_id" },
            { property: "tag_ids" },
          ],
          limit: 5000, // Analytics API can handle large limits
          offset: 0,
        }),
      }
    );

    if (!analyticsResponse.ok) {
      if (analyticsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      console.error(
        "Failed to fetch time entries from Analytics API:",
        await analyticsResponse.text()
      );
      return createErrorResponse("Failed to fetch time entries from Toggl");
    }

    const analyticsData = await analyticsResponse.json();
    let enrichedEntries = transformAnalyticsData(analyticsData);

    // Fetch current running task
    const currentTaskResponse = await fetch(
      "https://track.toggl.com/api/v9/me/time_entries/current",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (currentTaskResponse.ok) {
      const currentTask = await currentTaskResponse.json();

      // If there's a running task, handle it properly
      if (currentTask && currentTask.id) {
        // REMOVE any matching entry from Analytics API (it's stale/cached)
        enrichedEntries = enrichedEntries.filter(e => e.id !== currentTask.id);

        // Find project info for the current task
        const project = currentTask.project_id
          ? activeProjects.find((p) => p.id === currentTask.project_id)
          : null;

        // Create the running entry with v9 API data (source of truth)
        const runningEntry = {
          id: currentTask.id,
          description: currentTask.description || "",
          project_id: currentTask.project_id,
          project_name: project?.name || "",
          project_color: project?.color || "#6b7280",
          start: currentTask.start,
          stop: null, // Running tasks have no stop time
          duration: -1, // Always use -1 for running tasks
          tags: currentTask.tags || [],
          tag_ids: currentTask.tag_ids || [],
        };

        // Always add the v9 current entry
        enrichedEntries.unshift(runningEntry);
      }
    }

    // Sort entries by start time (most recent first)
    enrichedEntries.sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );

    // Apply pagination on the frontend side (since we get all data at once)
    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = enrichedEntries.slice(startIndex, endIndex);

    return new Response(
      JSON.stringify({
        timeEntries: paginatedEntries,
        projects: activeProjects,
        tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
        pagination: {
          page,
          limit,
          total: enrichedEntries.length,
          hasMore: endIndex < enrichedEntries.length,
        },
        syncStatus: "synced", // Add sync status for UI
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching time entries:", error);

    if (error instanceof Error) {
      if (error.message === "Toggl session token is required") {
        return createErrorResponse(error.message, 400);
      }
      if (
        error.message.includes("session expired") ||
        error.message.includes("reauthenticate")
      ) {
        return createErrorResponse(error.message, 401);
      }
      if (error.message === "No workspaces found") {
        return createErrorResponse(error.message, 404);
      }
      if (error.message.includes("Failed to fetch workspaces")) {
        return createErrorResponse(error.message);
      }
    }

    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);
    const body = await request.json();
    const { description, start, project_name, tag_ids } = body;

    // First, get the current running time entry
    const currentEntryResponse = await fetch(
      "https://track.toggl.com/api/v9/me/time_entries/current",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!currentEntryResponse.ok) {
      if (currentEntryResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      const errorText = await currentEntryResponse.text();
      console.error(
        "Get current entry error:",
        currentEntryResponse.status,
        errorText
      );
      throw new Error("Failed to fetch current time entry from Toggl");
    }

    const currentEntry = await currentEntryResponse.json();

    // If there's a current entry, stop it using the dedicated stop endpoint
    if (currentEntry) {
      const stopResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${currentEntry.id}/stop`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (!stopResponse.ok) {
        if (stopResponse.status === 401) {
          return createErrorResponse(
            "Session expired - please reauthenticate",
            401
          );
        }
        const errorText = await stopResponse.text();
        console.error("Stop entry error:", stopResponse.status, errorText);
        throw new Error("Failed to stop current time entry");
      }
    }

    // If project_name is provided, find the project_id
    let project_id: number | undefined;
    if (project_name && project_name !== "No Project") {
      const projectsResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects?page=1&per_page=200&active=true&only_me=true&sort_field=client_name&pinned=false`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (projectsResponse.ok) {
        const projects: Project[] = await projectsResponse.json();
        const matchedProject = projects.find((p) => p.name === project_name);
        if (matchedProject) {
          project_id = matchedProject.id;
        }
      }
    }

    // Create new time entry data for Toggl API
    const timeEntryData: {
      description: string;
      start: string;
      wid: string | number;
      duration: number;
      created_with: string;
      project_id?: number;
      tag_ids?: number[];
    } = {
      description: description || "",
      start: start,
      wid: workspaceId, // Use 'wid' instead of 'workspace_id'
      duration: -1, // Negative duration indicates running timer
      created_with: "deeplog",
    };

    // Add project_id if found
    if (project_id) {
      timeEntryData.project_id = project_id;
    }

    // Add tag_ids if provided
    if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
      timeEntryData.tag_ids = tag_ids;
    }

    // Create the new time entry using Toggl API
    const createResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(timeEntryData),
      }
    );

    if (!createResponse.ok) {
      if (createResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      const errorText = await createResponse.text();
      console.error("Create API error:", createResponse.status, errorText);
      throw new Error("Failed to create time entry in Toggl");
    }

    const createdEntry = await createResponse.json();

    return new Response(JSON.stringify(createdEntry), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating time entry:", error);

    if (error instanceof Error) {
      if (error.message === "Toggl session token is required") {
        return createErrorResponse(error.message, 400);
      }
      if (
        error.message.includes("session expired") ||
        error.message.includes("reauthenticate")
      ) {
        return createErrorResponse(error.message, 401);
      }
      if (error.message === "No workspaces found") {
        return createErrorResponse(error.message, 404);
      }
      if (error.message.includes("Failed to fetch workspaces")) {
        return createErrorResponse(error.message);
      }
    }

    return createErrorResponse("Failed to create time entry");
  }
}
