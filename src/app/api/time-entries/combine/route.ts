import { type NextRequest } from "next/server";
import { createErrorResponse, setupSessionApi } from "../session-utils";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);
    const body = await request.json();
    const { currentEntryId, olderEntryId } = body;

    if (!currentEntryId || !olderEntryId) {
      return createErrorResponse("currentEntryId and olderEntryId are required", 400);
    }

    console.log(`[Combine API] Combining entries:`, {
      currentEntryId: currentEntryId + " (will be deleted)",
      olderEntryId: olderEntryId + " (will be extended)",
    });

    // Fetch both entries
    const [currentEntryResponse, olderEntryResponse] = await Promise.all([
      fetch(`https://track.toggl.com/api/v9/me/time_entries/${currentEntryId}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }),
      fetch(`https://track.toggl.com/api/v9/me/time_entries/${olderEntryId}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }),
    ]);

    if (!currentEntryResponse.ok) {
      if (currentEntryResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error("Failed to fetch current entry");
    }

    if (!olderEntryResponse.ok) {
      if (olderEntryResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error("Failed to fetch older entry");
    }

    const currentEntry = await currentEntryResponse.json();
    const olderEntry = await olderEntryResponse.json();

    console.log(`[Combine API] Fetched entries:`, {
      currentEntry: {
        id: currentEntry.id,
        start: currentEntry.start,
        stop: currentEntry.stop,
      },
      olderEntry: {
        id: olderEntry.id,
        start: olderEntry.start,
        stop: olderEntry.stop,
      },
    });

    // Determine if current entry is running
    const isCurrentEntryRunning = !currentEntry.stop || currentEntry.duration === -1;

    console.log(`[Combine API] Current entry is ${isCurrentEntryRunning ? "running" : "stopped"}`);

    // Delete the current entry first
    const deleteResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${currentEntryId}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error(`[Combine API] Failed to delete current entry:`, {
        status: deleteResponse.status,
        statusText: deleteResponse.statusText,
        error: errorText,
      });

      if (deleteResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error(`Failed to delete current entry: ${errorText}`);
    }

    console.log(`[Combine API] Successfully deleted current entry ${currentEntryId}`);

    // Update the older entry
    const updateBody: Record<string, string | number | boolean | number[] | undefined> = {
      description: olderEntry.description,
      start: olderEntry.start,
      billable: olderEntry.billable,
      wid: workspaceId,
      created_with: olderEntry.created_with || "deeplog",
    };

    if (isCurrentEntryRunning) {
      // Make older entry a running timer
      updateBody.duration = -1;
      // Don't include stop field for running timers
      console.log(`[Combine API] Making older entry a running timer`);
    } else {
      // Extend older entry to current entry's stop time
      updateBody.stop = currentEntry.stop;
      console.log(`[Combine API] Extending older entry to ${currentEntry.stop}`);
    }

    // Only include project_id if it exists and is valid
    if (olderEntry.project_id) {
      updateBody.project_id = olderEntry.project_id;
    }

    // Only include tag_ids if they exist
    if (olderEntry.tag_ids && olderEntry.tag_ids.length > 0) {
      updateBody.tag_ids = olderEntry.tag_ids;
    }

    console.log(`[Combine API] Updating older entry ${olderEntryId}:`, updateBody);

    const updateResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${olderEntryId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(updateBody),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`[Combine API] Failed to update older entry:`, {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        error: errorText,
      });

      if (updateResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error(`Failed to update older entry: ${errorText}`);
    }

    const updatedEntry = await updateResponse.json();
    console.log(`[Combine API] Successfully updated older entry:`, updatedEntry);

    return new Response(
      JSON.stringify({
        updatedEntry,
        deletedEntryId: currentEntryId,
        message: isCurrentEntryRunning
          ? "Combined entries - older entry is now running"
          : "Combined entries successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error combining time entries:", error);

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
    }

    return createErrorResponse(
      error instanceof Error ? error.message : "Failed to combine time entries"
    );
  }
}
