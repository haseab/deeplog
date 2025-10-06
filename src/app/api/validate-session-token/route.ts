import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken } = await request.json();

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Session token is required" },
        { status: 400 }
      );
    }

    // Validate the session token by making a test request to Toggl
    const response = await fetch("https://track.toggl.com/api/v9/me", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: "Invalid or expired session token. Please get a fresh token from Toggl." },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: "Failed to validate session token" },
        { status: 400 }
      );
    }

    const userData = await response.json();

    // Get workspaces to verify access
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
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 400 }
      );
    }

    const workspaces = await workspacesResponse.json();

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json(
        { error: "No workspaces found for this account" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      user: {
        email: userData.email,
        fullname: userData.fullname,
        id: userData.id,
      },
      workspace: {
        id: workspaces[0].id,
        name: workspaces[0].name,
        organization_id: workspaces[0].organization_id,
      },
    });
  } catch (error) {
    console.error("Session validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate session token" },
      { status: 500 }
    );
  }
}