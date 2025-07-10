import { NextRequest, NextResponse } from "next/server";
import { setupTogglApi, createErrorResponse } from "../time-entries/utils";

export async function GET(request: NextRequest) {
  try {
    const { auth, workspaceId } = await setupTogglApi(request);

    // Fetch tags from Toggl API
    const response = await fetch(`https://api.track.toggl.com/api/v9/me/tags`, {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Toggl API Error:", response.status, response.statusText);
      return NextResponse.json(
        { error: "Failed to fetch tags from Toggl" },
        { status: response.status }
      );
    }

    const tags = await response.json();

    // Transform Toggl tags to our format
    const transformedTags = tags.map((tag: any) => ({
      id: tag.id,
      name: tag.name,
    }));

    return NextResponse.json({
      tags: transformedTags,
    });
  } catch (error) {
    console.error("Tags API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}