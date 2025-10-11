import { type NextRequest } from "next/server";
import { setupSessionApi, createErrorResponse } from "../time-entries/session-utils";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);

    const body = await request.json();
    const { name, color, is_private = true } = body;

    if (!name) {
      return createErrorResponse("Project name is required", 400);
    }

    const requestBody = {
      name,
      color: color || "#525266",
      is_private,
      active: true,
      wid: workspaceId,
      start_date: new Date().toISOString().split('T')[0],
    };

    // Create project via Toggl API
    const response = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to create project. Status: ${response.status}, Error:`, errorText);
      return createErrorResponse("Failed to create project", response.status);
    }

    const project = await response.json();

    return new Response(JSON.stringify(project), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating project:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to create project",
      500
    );
  }
}
