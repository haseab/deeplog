import { type NextRequest } from "next/server";
import { createErrorResponse, setupTogglApi } from "../time-entries/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return createErrorResponse("API key is required", 400);
    }

    // Create a temporary request object with the API key header
    const tempRequest = {
      headers: {
        get: (name: string) => {
          if (name === "x-toggl-api-key") {
            return apiKey;
          }
          return null;
        },
      },
    } as NextRequest;

    // Use the existing utility function to validate the API key
    const { workspaceId } = await setupTogglApi(tempRequest);

    return new Response(
      JSON.stringify({
        success: true,
        workspaceId,
        message: "API key is valid",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("API key validation error:", error);

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message === "Toggl API key is required") {
        return createErrorResponse("API key is required", 400);
      }
      if (error.message === "No workspaces found") {
        return createErrorResponse("No workspaces found for this account", 404);
      }
      if (error.message.includes("Failed to fetch workspaces")) {
        return createErrorResponse(
          "Invalid API key or unable to connect to Toggl",
          401
        );
      }
    }

    return createErrorResponse("Failed to validate API key", 500);
  }
}
