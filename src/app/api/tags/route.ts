import { type NextRequest } from "next/server";
import { setupSessionApi, createErrorResponse } from "../time-entries/session-utils";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return createErrorResponse("Tag name is required", 400);
    }

    // Create tag via Toggl API
    const response = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/tags`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ name }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to create tag. Status: ${response.status}, Error:`, errorText);
      return createErrorResponse("Failed to create tag", response.status);
    }

    const tag = await response.json();

    return new Response(JSON.stringify(tag), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating tag:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to create tag",
      500
    );
  }
}
