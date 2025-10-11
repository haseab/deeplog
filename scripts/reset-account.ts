/**
 * Reset Account Script
 *
 * This script resets a Toggl account by deleting all projects, tags, and time entries.
 * Run with: npm run reset <TOGGL_SESSION_TOKEN> --confirm
 *
 * WARNING: This is a destructive operation and cannot be undone!
 */

type Project = {
  id: number;
  name: string;
  active?: boolean;
};

type Tag = {
  id: number;
  name: string;
};

type TimeEntry = {
  id: number;
  description?: string;
  start: string;
};

async function getWorkspaceAndOrgId(sessionToken: string): Promise<{ workspaceId: number; organizationId: number }> {
  const response = await fetch("https://track.toggl.com/api/v9/workspaces", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch workspaces: ${response.status} - ${errorText}`);
  }

  const workspaces = await response.json();
  if (!workspaces || workspaces.length === 0) {
    throw new Error("No workspaces found");
  }

  return {
    workspaceId: workspaces[0].id,
    organizationId: workspaces[0].organization_id,
  };
}

async function getUserId(sessionToken: string): Promise<number> {
  const response = await fetch("https://track.toggl.com/api/v9/me", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch user info: ${response.status} - ${errorText}`);
  }

  const userData = await response.json();
  return userData.id;
}

async function fetchAllProjects(sessionToken: string, workspaceId: number): Promise<Project[]> {
  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects?page=1&per_page=200&active=both`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch projects: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function fetchAllTags(sessionToken: string, workspaceId: number): Promise<Tag[]> {
  let tags: Tag[] = [];
  let currentPage = 1;
  const perPage = 200;
  let hasMoreTags = true;

  while (hasMoreTags) {
    const response = await fetch(
      `https://track.toggl.com/api/v9/workspaces/${workspaceId}/tags?page=${currentPage}&per_page=${perPage}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch tags: ${response.status} - ${errorText}`);
    }

    const pageTags: Tag[] = await response.json();
    tags = [...tags, ...pageTags];

    hasMoreTags = pageTags.length === perPage;
    currentPage++;
  }

  return tags;
}

async function fetchAllTimeEntries(
  sessionToken: string,
  organizationId: number,
  workspaceId: number,
  userId: number
): Promise<number[]> {
  // Use Analytics API to get all time entry IDs
  // Get entries from a very wide date range (last 2 years)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 2);

  const fromDate = startDate.toISOString().split("T")[0];
  const toDate = endDate.toISOString().split("T")[0];

  const analyticsPayload = {
    period: {
      from: fromDate,
      to: toDate,
    },
    filters: [
      {
        property: "workspace_id",
        operator: "=",
        value: workspaceId,
      },
      {
        property: "user_id",
        operator: "=",
        value: userId,
      },
    ],
    attributes: [{ property: "time_entry_id" }],
    limit: 10000,
    offset: 0,
  };

  const response = await fetch(
    `https://track.toggl.com/analytics/api/organizations/${organizationId}/query?response_format=json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(analyticsPayload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch time entries: ${response.status} - ${errorText}`);
  }

  const analyticsData = await response.json();
  const dataTable = analyticsData.data_table || [];

  if (dataTable.length === 0) return [];

  // First row is headers, rest are data rows
  const rows = dataTable.slice(1);
  return rows.map((row: unknown[]) => row[0] as number);
}

async function deleteProject(sessionToken: string, workspaceId: number, projectId: number): Promise<void> {
  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects/${projectId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete project ${projectId}: ${response.status} - ${errorText}`);
  }
}

async function deleteTag(sessionToken: string, workspaceId: number, tagId: number): Promise<void> {
  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/tags/${tagId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete tag ${tagId}: ${response.status} - ${errorText}`);
  }
}

async function deleteTimeEntry(sessionToken: string, workspaceId: number, entryId: number): Promise<void> {
  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${entryId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete time entry ${entryId}: ${response.status} - ${errorText}`);
  }
}

async function stopCurrentTimer(sessionToken: string, workspaceId: number): Promise<void> {
  // Check if there's a running timer
  const response = await fetch("https://track.toggl.com/api/v9/me/time_entries/current", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
  });

  if (!response.ok) return; // No current timer or error

  const currentEntry = await response.json();
  if (!currentEntry || !currentEntry.id) return;

  // Stop the current timer
  const stopResponse = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${currentEntry.id}/stop`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );

  if (stopResponse.ok) {
    console.log("✓ Stopped running timer");
  }
}

async function confirmReset(): Promise<boolean> {
  console.log("\n⚠️  WARNING: This will permanently delete:");
  console.log("   - All projects");
  console.log("   - All tags");
  console.log("   - All time entries");
  console.log("\n❌ This action CANNOT be undone!\n");

  // In a real script, you'd use readline or prompts package
  // For now, require a special flag
  const confirmed = process.argv.includes("--confirm");

  if (!confirmed) {
    console.log("To proceed, run the command with --confirm flag:");
    console.log("npm run reset <SESSION_TOKEN> --confirm\n");
    return false;
  }

  return true;
}

async function resetAccount(sessionToken: string): Promise<void> {
  console.log("🔄 Starting account reset...\n");

  try {
    // Confirm before proceeding
    const confirmed = await confirmReset();
    if (!confirmed) {
      console.log("Reset cancelled.");
      process.exit(0);
    }

    // Get workspace, organization, and user IDs
    console.log("Fetching account information...");
    const { workspaceId, organizationId } = await getWorkspaceAndOrgId(sessionToken);
    const userId = await getUserId(sessionToken);
    console.log(`✓ Workspace ID: ${workspaceId}`);
    console.log(`✓ Organization ID: ${organizationId}`);
    console.log(`✓ User ID: ${userId}\n`);

    // Stop any running timer first
    await stopCurrentTimer(sessionToken, workspaceId);

    // Delete all time entries
    console.log("Fetching time entries...");
    const timeEntryIds = await fetchAllTimeEntries(sessionToken, organizationId, workspaceId, userId);
    console.log(`Found ${timeEntryIds.length} time entries to delete\n`);

    if (timeEntryIds.length > 0) {
      console.log("Deleting time entries...");
      for (const entryId of timeEntryIds) {
        await deleteTimeEntry(sessionToken, workspaceId, entryId);
        console.log(`✓ Deleted time entry ${entryId}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      console.log(`\n✅ Deleted ${timeEntryIds.length} time entries\n`);
    }

    // Delete all tags
    console.log("Fetching tags...");
    const tags = await fetchAllTags(sessionToken, workspaceId);
    console.log(`Found ${tags.length} tags to delete\n`);

    if (tags.length > 0) {
      console.log("Deleting tags...");
      for (const tag of tags) {
        await deleteTag(sessionToken, workspaceId, tag.id);
        console.log(`✓ Deleted tag: ${tag.name}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      console.log(`\n✅ Deleted ${tags.length} tags\n`);
    }

    // Delete all projects
    console.log("Fetching projects...");
    const projects = await fetchAllProjects(sessionToken, workspaceId);
    console.log(`Found ${projects.length} projects to delete\n`);

    if (projects.length > 0) {
      console.log("Deleting projects...");
      for (const project of projects) {
        await deleteProject(sessionToken, workspaceId, project.id);
        console.log(`✓ Deleted project: ${project.name}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      console.log(`\n✅ Deleted ${projects.length} projects\n`);
    }

    console.log("✅ Account reset complete!");
  } catch (error) {
    console.error("\n❌ Error resetting account:", error);
    process.exit(1);
  }
}

// Main execution
const sessionToken = process.argv[2];

if (!sessionToken) {
  console.error("❌ Error: Toggl session token is required");
  console.log("\nUsage: npm run reset <TOGGL_SESSION_TOKEN> --confirm");
  console.log("\nYou can find your session token in your app's local storage");
  console.log("\nWARNING: Add --confirm flag to actually perform the reset");
  process.exit(1);
}

resetAccount(sessionToken);
