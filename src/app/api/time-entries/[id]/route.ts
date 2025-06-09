import { type NextRequest } from "next/server";
import { createErrorResponse, setupTogglApi } from "../utils";

type Project = {
  id: number;
  name: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { auth, workspaceId } = await setupTogglApi(request);
    const body = await request.json();
    const { description, project_name, stop } = body;

    // First, get the current time entry using the correct endpoint
    const getCurrentResponse = await fetch(
      `https://api.track.toggl.com/api/v9/me/time_entries/${id}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!getCurrentResponse.ok) {
      const errorText = await getCurrentResponse.text();
      console.error("Toggl API error:", getCurrentResponse.status, errorText);
      throw new Error("Failed to get current time entry from Toggl");
    }

    const currentEntry = await getCurrentResponse.json();

    // If project_name is provided, we need to find the project_id
    let project_id = currentEntry.project_id;
    if (project_name !== undefined) {
      if (project_name === "No Project" || project_name === "") {
        project_id = null;
      } else {
        // Fetch projects to find the matching project ID
        const projectsResponse = await fetch(
          `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/projects`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${auth}`,
            },
          }
        );
        const projects: Project[] = await projectsResponse.json();
        const project = projects.find((p) => p.name === project_name);
        project_id = project ? project.id : null;
      }
    }

    // Update the time entry using the workspace-based PUT endpoint
    const updateData = {
      ...currentEntry,
      ...(description !== undefined && { description }),
      ...(project_name !== undefined && { project_id }),
      ...(stop !== undefined && { stop }),
    };

    const updateResponse = await fetch(
      `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Update API error:", updateResponse.status, errorText);
      throw new Error("Failed to update time entry in Toggl");
    }

    const updatedEntry = await updateResponse.json();
    return new Response(JSON.stringify(updatedEntry), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Toggl API Error:", error);

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

    return createErrorResponse("Failed to update time entry");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { auth, workspaceId } = await setupTogglApi(request);

    const deleteResponse = await fetch(
      `https://api.track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error("Delete API error:", deleteResponse.status, errorText);
      throw new Error("Failed to delete time entry from Toggl");
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Toggl API Error:", error);

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

    return createErrorResponse("Failed to delete time entry");
  }
}
