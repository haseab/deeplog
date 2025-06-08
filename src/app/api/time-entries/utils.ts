import { type NextRequest } from "next/server";

export type TogglApiSetup = {
  auth: string;
  workspaceId: number;
};

export async function setupTogglApi(
  request: NextRequest
): Promise<TogglApiSetup> {
  // Get credentials from headers (sent from frontend)
  const togglApiKey = request.headers.get("x-toggl-api-key");

  if (!togglApiKey) {
    throw new Error("Toggl API key is required");
  }

  const auth = Buffer.from(`${togglApiKey}:api_token`).toString("base64");

  // First, get the user's workspaces to find the default workspace
  const workspacesResponse = await fetch(
    "https://api.track.toggl.com/api/v9/workspaces",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
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
  const workspaceId = workspaces[0].id;

  return { auth, workspaceId };
}

export function createErrorResponse(message: string, status: number = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
