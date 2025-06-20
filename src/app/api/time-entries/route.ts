import { type NextRequest } from "next/server";
import { createErrorResponse, setupTogglApi } from "./utils";

type TimeEntry = {
  id: number;
  description: string;
  project_id?: number;
  start: string;
  stop: string | null;
  duration: number;
};

type Project = {
  id: number;
  name: string;
  color: string;
};

export async function GET(request: NextRequest) {
  try {
    const { auth, workspaceId } = await setupTogglApi(request);

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "100");

    if (!startDate || !endDate) {
      return createErrorResponse("start_date and end_date are required", 400);
    }

    // Fetch projects first
    const projectsResponse = await fetch(
      `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/projects`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!projectsResponse.ok) {
      console.error("Failed to fetch projects:", await projectsResponse.text());
      return createErrorResponse("Failed to fetch projects from Toggl");
    }

    const projects: Project[] = await projectsResponse.json();

    // Fetch time entries
    const timeEntriesResponse = await fetch(
      `https://api.track.toggl.com/api/v9/me/time_entries?start_date=${startDate}&end_date=${endDate}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!timeEntriesResponse.ok) {
      console.error(
        "Failed to fetch time entries:",
        await timeEntriesResponse.text()
      );
      return createErrorResponse("Failed to fetch time entries from Toggl");
    }

    const timeEntries: TimeEntry[] = await timeEntriesResponse.json();

    // Create a map for quick project lookup
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    // Add some debug logging to see what we're getting
    // console.log("Sample time entry:", timeEntries[0]);
    // console.log("Available projects:", projects.length);

    // Enrich time entries with project information
    const enrichedEntries = timeEntries.map((entry) => {
      const project = entry.project_id
        ? projectMap.get(entry.project_id)
        : null;
      return {
        ...entry,
        project_name: project?.name || "",
        project_color: project?.color || "#6b7280", // Default gray color
      };
    });

    // Sort entries by start time (most recent first)
    enrichedEntries.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

    // Apply pagination
    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = enrichedEntries.slice(startIndex, endIndex);

    return new Response(
      JSON.stringify({
        timeEntries: paginatedEntries,
        projects: projects,
        pagination: {
          page,
          limit,
          total: enrichedEntries.length,
          hasMore: endIndex < enrichedEntries.length,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching time entries:", error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "Toggl API key is required") {
        return createErrorResponse(error.message, 400);
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
    const { auth, workspaceId } = await setupTogglApi(request);
    const body = await request.json();
    const { description, start } = body;

    // First, get the current running time entry
    const currentEntryResponse = await fetch(
      "https://api.track.toggl.com/api/v9/me/time_entries/current",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!currentEntryResponse.ok) {
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
        `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${currentEntry.id}/stop`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );

      if (!stopResponse.ok) {
        const errorText = await stopResponse.text();
        console.error("Stop entry error:", stopResponse.status, errorText);
        throw new Error("Failed to stop current time entry");
      }
    }

    // Create new time entry data for Toggl API
    const timeEntryData = {
      description: description || "",
      start: start,
      wid: workspaceId, // Use 'wid' instead of 'workspace_id'
      duration: -1, // Negative duration indicates running timer
      created_with: "DeepLog",
    };

    // Create the new time entry using Toggl API
    const createResponse = await fetch(
      `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(timeEntryData),
      }
    );

    if (!createResponse.ok) {
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

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "Toggl API key is required") {
        return createErrorResponse(error.message, 400);
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
