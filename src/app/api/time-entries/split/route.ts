import { type NextRequest } from "next/server";
import { createErrorResponse, setupSessionApi } from "../session-utils";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId } = await setupSessionApi(request);
    const body = await request.json();
    const { entryId, parts } = body;

    if (!entryId || !parts || parts < 2) {
      return createErrorResponse("entryId and parts (minimum 2) are required", 400);
    }

    // Get the time entry
    const getEntryResponse = await fetch(
      `https://track.toggl.com/api/v9/me/time_entries/${entryId}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!getEntryResponse.ok) {
      if (getEntryResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error("Failed to fetch time entry");
    }

    const entry = await getEntryResponse.json();

    if (!entry.start) {
      return createErrorResponse("Entry start time is undefined", 400);
    }

    if (!entry.stop) {
      return createErrorResponse("Cannot split a running time entry", 400);
    }

    const startTime = new Date(entry.start);
    const endTime = new Date(entry.stop);
    const duration = endTime.getTime() - startTime.getTime();
    const partDuration = duration / parts;

    console.log(`[Split API] Original entry:`, {
      id: entry.id,
      start: entry.start,
      stop: entry.stop,
      duration: entry.duration,
      durationMs: duration,
      parts,
      partDurationMs: partDuration,
    });

    // Update the original entry with 1/parts of the duration
    const newEndTime = new Date(startTime.getTime() + partDuration);

    // Build update body with only the fields Toggl expects
    // Don't include duration - let Toggl calculate it from start/stop times
    const updateBody: Record<string, any> = {
      description: entry.description,
      start: entry.start,
      stop: newEndTime.toISOString(),
      billable: entry.billable,
      wid: workspaceId,
      created_with: entry.created_with || "deeplog",
    };

    // Only include project_id if it exists and is valid
    if (entry.project_id) {
      updateBody.project_id = entry.project_id;
    }

    // Only include tag_ids if they exist
    if (entry.tag_ids && entry.tag_ids.length > 0) {
      updateBody.tag_ids = entry.tag_ids;
    }

    console.log(`[Split API] Updating original entry:`, {
      id: entry.id,
      start: updateBody.start,
      stop: updateBody.stop,
      project_id: updateBody.project_id,
      tag_ids: updateBody.tag_ids,
      calculatedDurationSeconds: Math.round((newEndTime.getTime() - startTime.getTime()) / 1000),
    });

    const updateResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${entryId}`,
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
      console.error(`[Split API] Failed to update original entry:`, {
        status: updateResponse.status,
        statusText: updateResponse.statusText,
        error: errorText,
      });

      if (updateResponse.status === 401) {
        return createErrorResponse("Session expired - please reauthenticate", 401);
      }
      throw new Error(`Failed to update original entry: ${errorText}`);
    }

    const updatedEntry = await updateResponse.json();
    console.log(`[Split API] Successfully updated original entry:`, updatedEntry);
    const createdEntries = [];

    // Create the remaining parts
    for (let i = 1; i < parts; i++) {
      const partStartTime = new Date(startTime.getTime() + partDuration * i);
      const partEndTime = new Date(startTime.getTime() + partDuration * (i + 1));

      // Build request body with only the fields Toggl expects
      // Don't include duration - let Toggl calculate it from start/stop times
      const requestBody: Record<string, any> = {
        description: entry.description,
        start: partStartTime.toISOString(),
        stop: partEndTime.toISOString(),
        billable: entry.billable,
        wid: workspaceId,
        created_with: "deeplog",
      };

      // Only include project_id if it exists and is valid
      if (entry.project_id) {
        requestBody.project_id = entry.project_id;
      }

      // Only include tag_ids if they exist
      if (entry.tag_ids && entry.tag_ids.length > 0) {
        requestBody.tag_ids = entry.tag_ids;
      }

      console.log(`[Split API] Creating part ${i + 1}/${parts}:`, {
        ...requestBody,
        calculatedDurationSeconds: Math.round((partEndTime.getTime() - partStartTime.getTime()) / 1000),
      });

      const createResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`[Split API] Failed to create part ${i + 1}:`, {
          status: createResponse.status,
          statusText: createResponse.statusText,
          error: errorText,
          requestBody,
        });

        if (createResponse.status === 401) {
          return createErrorResponse("Session expired - please reauthenticate", 401);
        }
        throw new Error(`Failed to create part ${i + 1}: ${errorText}`);
      }

      const createdEntry = await createResponse.json();
      console.log(`[Split API] Successfully created part ${i + 1}:`, createdEntry);
      createdEntries.push(createdEntry);
    }

    return new Response(
      JSON.stringify({
        updatedEntry,
        createdEntries,
        message: `Split into ${parts} equal parts`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error splitting time entry:", error);

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
      error instanceof Error ? error.message : "Failed to split time entry"
    );
  }
}
