import { type NextRequest } from "next/server";
import { createErrorResponse, setupSessionApi } from "../session-utils";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);
    const body = await request.json();
    const { currentEntryId, olderEntryId, reverse = false } = body;

    if (!currentEntryId || !olderEntryId) {
      return createErrorResponse("currentEntryId and olderEntryId are required", 400);
    }

    // In reverse mode, keep current entry's metadata instead of older entry's
    const entryToKeepId = reverse ? currentEntryId : olderEntryId;
    const entryToDeleteId = reverse ? olderEntryId : currentEntryId;

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

    // Determine if current entry is running
    const isCurrentEntryRunning = !currentEntry.stop || currentEntry.duration === -1;

    // Delete the entry we're not keeping
    const deleteResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${entryToDeleteId}`,
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
      console.error(`[Combine API] Failed to delete entry:`, {
        status: deleteResponse.status,
        statusText: deleteResponse.statusText,
        error: errorText,
      });

      if (deleteResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error(`Failed to delete entry: ${errorText}`);
    }

    // Get the entry to keep based on reverse mode
    const entryToKeep = reverse ? currentEntry : olderEntry;
    const earliestStart = olderEntry.start; // Always use the earliest start

    // Update the entry we're keeping
    const updateBody: Record<string, string | number | boolean | number[] | undefined> = {
      description: entryToKeep.description,
      start: earliestStart,
      billable: entryToKeep.billable,
      wid: workspaceId,
      created_with: entryToKeep.created_with || "deeplog",
    };

    if (isCurrentEntryRunning) {
      // Make kept entry a running timer
      updateBody.duration = -1;
      // Don't include stop field for running timers
    } else {
      // Extend kept entry to current entry's stop time
      updateBody.stop = currentEntry.stop;
    }

    // Only include project_id if it exists and is valid
    if (entryToKeep.project_id) {
      updateBody.project_id = entryToKeep.project_id;
    }

    // Only include tag_ids if they exist
    if (entryToKeep.tag_ids && entryToKeep.tag_ids.length > 0) {
      updateBody.tag_ids = entryToKeep.tag_ids;
    }

    const updateResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${entryToKeepId}`,
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
      console.error(`[Combine API] Failed to update kept entry:`, {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        error: errorText,
      });

      if (updateResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error(`Failed to update kept entry: ${errorText}`);
    }

    const updatedEntry = await updateResponse.json();

    return new Response(
      JSON.stringify({
        updatedEntry,
        deletedEntryId: entryToDeleteId,
        message: isCurrentEntryRunning
          ? `Combined entries - ${reverse ? "current" : "older"} entry is now running`
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
