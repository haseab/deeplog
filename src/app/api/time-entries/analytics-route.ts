import { type NextRequest } from "next/server";
import {
  createErrorResponse,
  setupSessionApi,
  transformAnalyticsData,
} from "./session-utils";
import {
  isRunningTimeEntry,
  stopTimeEntryAt,
} from "@/lib/time-entry-state";
import {
  addCalendarDays,
  calendarRangeToUtc,
  formatDateInTimeZone,
  intervalsOverlap,
  isValidTimeZone,
} from "@/lib/timezone";

type Project = {
  id: number;
  name: string;
  color: string;
  active?: boolean;
};

type Tag = {
  id: number;
  name: string;
};

// A single app process may receive several start requests when multiple Undo
// toasts expire together. Keep each user's stop-then-create transaction in
// order so two requests cannot both observe the same current timer.
const startQueues = new Map<number, Promise<void>>();

async function serializeTimerStart<T>(
  userId: number,
  operation: () => Promise<T>
): Promise<T> {
  const previous = startQueues.get(userId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const queuedGate = previous.catch(() => undefined).then(() => currentGate);
  startQueues.set(userId, queuedGate);

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (startQueues.get(userId) === queuedGate) {
      startQueues.delete(userId);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { sessionToken, workspaceId, organizationId, userId, profileTimeZone } =
      await setupSessionApi(request);

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const requestedTimeZone = searchParams.get("timezone");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "100");
    const displayTimeZone = isValidTimeZone(requestedTimeZone)
      ? requestedTimeZone
      : profileTimeZone;
    const validCalendarDate = /^\d{4}-\d{2}-\d{2}$/;

    if (!fromDate || !toDate || !validCalendarDate.test(fromDate) || !validCalendarDate.test(toDate)) {
      return createErrorResponse("from_date and to_date are required in YYYY-MM-DD format", 400);
    }

    const requestedRange = calendarRangeToUtc(fromDate, toDate, displayTimeZone);
    if (!requestedRange || requestedRange.endExclusive <= requestedRange.start) {
      return createErrorResponse("Invalid date range or timezone", 400);
    }

    // Fetch projects using regular API
    const projectsResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects?page=1&per_page=200&active=true&only_me=true&sort_field=client_name&pinned=false`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        signal: request.signal,
      }
    );

    if (!projectsResponse.ok) {
      if (projectsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      console.error("Failed to fetch projects:", await projectsResponse.text());
      return createErrorResponse("Failed to fetch projects from Toggl");
    }

    // Fetch all tags with pagination
    let tags: Tag[] = [];
    let currentPage = 1;
    const perPage = 200; // Max per page for tags API
    let hasMoreTags = true;

    while (hasMoreTags) {
      const tagsResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/tags?page=${currentPage}&per_page=${perPage}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          signal: request.signal,
        }
      );

      if (tagsResponse.ok) {
        const pageTags: Tag[] = await tagsResponse.json();
        tags = [...tags, ...pageTags];

        // If we got fewer tags than per_page, we've reached the end
        hasMoreTags = pageTags.length === perPage;
        currentPage++;
      } else if (tagsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      } else {
        console.error("Failed to fetch tags:", await tagsResponse.text());
        hasMoreTags = false;
      }
    }

    const projects: Project[] = await projectsResponse.json();
    const activeProjects = projects.filter(
      (project) => project.active !== false
    );

    // Analytics periods and wall-clock response fields use the Toggl profile
    // timezone. Query one preceding calendar day so stopped entries that begin
    // before the selected range but overlap it are available for filtering.
    const analyticsFromDate = addCalendarDays(
      formatDateInTimeZone(requestedRange.start, profileTimeZone),
      -1
    );
    const analyticsToDate = formatDateInTimeZone(
      new Date(requestedRange.endExclusive.getTime() - 1),
      profileTimeZone
    );

    const analyticsPayload = {
      period: {
          from: analyticsFromDate,
          to: analyticsToDate,
      },
      filters: [
        {
          property: "workspace_id",
          operator: "=",
          value: parseInt(workspaceId.toString()),
        },
        {
          property: "user_id",
          operator: "=",
          value: parseInt(userId.toString()),
        },
      ],
      attributes: [
        { property: "time_entry_id" },
        { property: "description" },
        { property: "start_date" },
        { property: "start_time" },
        { property: "stop_time" },
        { property: "duration" },
        { property: "project_id" },
        { property: "tag_ids" },
      ],
      limit: 5000, // Analytics API can handle large limits
      offset: 0,
    };

    console.log('[API] Sending to Analytics API:', analyticsPayload);

    const analyticsResponse = await fetch(
      `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json&include_dicts=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(analyticsPayload),
        signal: request.signal,
      }
    );

    if (!analyticsResponse.ok) {
      if (analyticsResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      console.error(
        "Failed to fetch time entries from Analytics API:",
        await analyticsResponse.text()
      );
      return createErrorResponse("Failed to fetch time entries from Toggl");
    }

    const analyticsData = await analyticsResponse.json();
    let enrichedEntries = transformAnalyticsData(analyticsData, profileTimeZone);

    // A repeated fall-back wall time can represent two distinct instants. The
    // Analytics fields cannot always disambiguate it, so hydrate only those
    // rare rows from the canonical v9 endpoint instead of guessing.
    const ambiguousEntries = enrichedEntries.filter((entry) => entry._timezoneAmbiguous);
    if (ambiguousEntries.length > 0) {
      const canonicalEntries = await Promise.all(
        ambiguousEntries.map(async (entry) => {
          const response = await fetch(
            `https://track.toggl.com/api/v9/me/time_entries/${entry.id}`,
            {
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${sessionToken}`,
              },
              signal: request.signal,
            }
          );
          return response.ok ? response.json() : null;
        })
      );
      const canonicalById = new Map(
        canonicalEntries.filter(Boolean).map((entry) => [entry.id, entry])
      );
      enrichedEntries = enrichedEntries.map((entry) => {
        const canonical = canonicalById.get(entry.id);
        if (!canonical) return entry;
        return {
          ...entry,
          start: new Date(canonical.start).toISOString(),
          stop: canonical.stop ? new Date(canonical.stop).toISOString() : null,
          duration: canonical.duration,
          _timezoneAmbiguous: false,
        };
      });
    }

    enrichedEntries = enrichedEntries
      .filter((entry) => intervalsOverlap(
        entry.start,
        entry.stop,
        requestedRange.start,
        requestedRange.endExclusive
      ));

    console.log('[API] Got entries from Analytics API:', {
      count: enrichedEntries.length,
      firstEntry: enrichedEntries[0]?.start,
      lastEntry: enrichedEntries[enrichedEntries.length - 1]?.start,
    });

    // Fetch current running task
    const currentTaskResponse = await fetch(
      "https://track.toggl.com/api/v9/me/time_entries/current",
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        signal: request.signal,
      }
    );

    console.log("[API] Current time entry response:", {
      status: currentTaskResponse.status,
      statusText: currentTaskResponse.statusText,
      ok: currentTaskResponse.ok,
    });

    if (!currentTaskResponse.ok) {
      console.error("[API] Failed to fetch current time entry:", {
        status: currentTaskResponse.status,
        statusText: currentTaskResponse.statusText,
      });

      if (currentTaskResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }

      return createErrorResponse(
        `Failed to fetch current time entry from Toggl (${currentTaskResponse.status})`,
        502
      );
    }

    const currentTask = await currentTaskResponse.json();

    // Analytics can lag behind the v9 current-entry endpoint. Only the ID
    // reported by that endpoint is allowed to remain live; every other
    // running-looking Analytics row is historical and must be normalized.
    const currentTaskId = currentTask?.id ?? null;
    const currentTaskStart = currentTask?.start as string | undefined;
    enrichedEntries = enrichedEntries
      .filter((entry) => entry.id !== currentTaskId)
      .map((entry) => {
        if (!isRunningTimeEntry(entry)) return entry;

        let stopTime = entry.start;
        if (
          currentTaskStart &&
          new Date(entry.start).getTime() <=
            new Date(currentTaskStart).getTime()
        ) {
          stopTime = currentTaskStart;
        } else if (entry.duration >= 0) {
          stopTime = new Date(
            new Date(entry.start).getTime() + entry.duration * 1000
          ).toISOString();
        }

        return stopTimeEntryAt(entry, stopTime);
      });

    console.log("[API] Current time entry payload:", {
      hasCurrentTask: Boolean(currentTask?.id),
      id: currentTask?.id ?? null,
      start: currentTask?.start ?? null,
      stop: currentTask?.stop ?? null,
      duration: currentTask?.duration ?? null,
      descriptionLength:
        typeof currentTask?.description === "string"
          ? currentTask.description.length
          : 0,
    });

    // If there's a running task, handle it properly
    if (currentTask && currentTask.id) {
      const isCurrentTaskInRange = intervalsOverlap(
        currentTask.start,
        null,
        requestedRange.start,
        requestedRange.endExclusive
      );

      console.log("[API] Current time entry range check:", {
        id: currentTask.id,
        taskStart: currentTask.start,
        rangeStart: requestedRange.start.toISOString(),
        rangeEnd: requestedRange.endExclusive.toISOString(),
        isCurrentTaskInRange,
      });

      // Only include the running task if it started within the date range
      if (isCurrentTaskInRange) {
        // Find project info for the current task
        const project = currentTask.project_id
          ? activeProjects.find((p) => p.id === currentTask.project_id)
          : null;

        // Create the running entry with v9 API data (source of truth)
        const runningEntry = {
          id: currentTask.id,
          description: currentTask.description || "",
          project_id: currentTask.project_id,
          project_name: project?.name || "",
          project_color: project?.color || "#6b7280",
          start: currentTask.start,
          stop: null, // Running tasks have no stop time
          duration: -1, // Always use -1 for running tasks
          tags: currentTask.tags || [],
          tag_ids: currentTask.tag_ids || [],
          _timezoneAmbiguous: false,
        };

        // Add the v9 current entry only if it's within date range
        enrichedEntries.unshift(runningEntry);
      }
    }

    // Sort entries by start time (most recent first)
    enrichedEntries.sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );

    // Apply pagination on the frontend side (since we get all data at once)
    const startIndex = page * limit;
    const endIndex = startIndex + limit;
    const paginatedEntries = enrichedEntries.slice(startIndex, endIndex).map((entry) => {
      return { ...entry, _timezoneAmbiguous: undefined };
    });

    return new Response(
      JSON.stringify({
        timeEntries: paginatedEntries,
        projects: activeProjects,
        tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
        pagination: {
          page,
          limit,
          total: enrichedEntries.length,
          hasMore: endIndex < enrichedEntries.length,
        },
        syncStatus: "synced", // Add sync status for UI
        profileTimeZone,
        displayTimeZone,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching time entries:", error);

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
      if (error.message.includes("Failed to fetch workspaces")) {
        return createErrorResponse(error.message);
      }
    }

    return createErrorResponse("Internal server error");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, workspaceId, userId } = await setupSessionApi(request);
    const body = await request.json();
    const { description, start, project_name, tag_ids } = body;

    return await serializeTimerStart(userId, async () => {
      let stoppedEntry: Record<string, unknown> | null = null;

      // First, get the current running time entry
      const currentEntryResponse = await fetch(
      "https://track.toggl.com/api/v9/me/time_entries/current",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!currentEntryResponse.ok) {
      if (currentEntryResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      const errorText = await currentEntryResponse.text();
      console.error(
        "Get current entry error:",
        currentEntryResponse.status,
        errorText
      );
      throw new Error("Failed to fetch current time entry from Toggl");
    }

      const currentEntry = await currentEntryResponse.json();

    // If there's a current entry, stop it using the dedicated stop endpoint
      if (currentEntry?.id) {
      const stopResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${currentEntry.id}/stop`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

        if (!stopResponse.ok) {
        if (stopResponse.status === 401) {
          return createErrorResponse(
            "Session expired - please reauthenticate",
            401
          );
        }
        const errorText = await stopResponse.text();
        console.error("Stop entry error:", stopResponse.status, errorText);
        throw new Error("Failed to stop current time entry");
        }
        stoppedEntry = await stopResponse.json().catch(() => null);
      }

    // If project_name is provided, find the project_id
    let project_id: number | undefined;
    if (project_name && project_name !== "No Project") {
      const projectsResponse = await fetch(
        `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects?page=1&per_page=200&active=true&only_me=true&sort_field=client_name&pinned=false`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      if (projectsResponse.ok) {
        const projects: Project[] = await projectsResponse.json();
        const matchedProject = projects.find((p) => p.name === project_name);
        if (matchedProject) {
          project_id = matchedProject.id;
        }
      }
    }

    // Create new time entry data for Toggl API
    const timeEntryData: {
      description: string;
      start: string;
      wid: string | number;
      duration: number;
      created_with: string;
      project_id?: number;
      tag_ids?: number[];
    } = {
      description: description || "",
      start: start,
      wid: workspaceId, // Use 'wid' instead of 'workspace_id'
      duration: -1, // Negative duration indicates running timer
      created_with: "deeplog",
    };

    // Add project_id if found
    if (project_id) {
      timeEntryData.project_id = project_id;
    }

    // Add tag_ids if provided
    if (tag_ids && Array.isArray(tag_ids) && tag_ids.length > 0) {
      timeEntryData.tag_ids = tag_ids;
    }

    // Create the new time entry using Toggl API
    const createResponse = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(timeEntryData),
      }
    );

    if (!createResponse.ok) {
      if (createResponse.status === 401) {
        return createErrorResponse(
          "Session expired - please reauthenticate",
          401
        );
      }
      const errorText = await createResponse.text();
      console.error("Create API error:", createResponse.status, errorText);
      throw new Error("Failed to create time entry in Toggl");
    }

    const createdEntry = await createResponse.json();

      return new Response(JSON.stringify({ createdEntry, stoppedEntry }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
  } catch (error) {
    console.error("Error creating time entry:", error);

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
      if (error.message.includes("Failed to fetch workspaces")) {
        return createErrorResponse(error.message);
      }
    }

    return createErrorResponse("Failed to create time entry");
  }
}
