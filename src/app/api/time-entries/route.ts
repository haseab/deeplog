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

    return new Response(
      JSON.stringify({
        timeEntries: enrichedEntries,
        projects: projects,
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
