/**
 * Seed Account Script
 *
 * This script seeds a Toggl account with predefined projects and sample time entries.
 * Run with: npm run seed <TOGGL_SESSION_TOKEN>
 */

const PREDEFINED_PROJECTS = [
  "Work & Professional",
  "Deep Focus",
  "Learning & Development",
  "Creative & Planning",
  "Physical Health",
  "Mental Wellness",
  "Personal Care",
  "Household & Maintenance",
  "Meals & Nutrition",
  "Transportation",
  "Health & Medical",
  "Social & Relationships",
  "Entertainment & Leisure",
  "Communication",
  "Personal Projects",
  "Financial",
  "Administrative",
  "Intermissions & Breaks",
  "Social Media & Digital",
  "Miscellaneous",
];

// Color palette for projects
const PROJECT_COLORS = [
  "#0b83d9", // Blue
  "#9e5bd9", // Purple
  "#d94182", // Pink
  "#e36a00", // Orange
  "#bf7000", // Brown
  "#2da608", // Green
  "#06a893", // Teal
  "#c7af14", // Yellow
  "#525266", // Gray
  "#5c1158", // Dark Purple
];

// Sample time entries in X-Y-Z format
const SAMPLE_TIME_ENTRIES = [
  { description: "Building - New User Onboarding - deeplog", project: "Work & Professional", durationMinutes: 45 },
  { description: "Testing - Adding Projects/Tags - deeplog", project: "Work & Professional", durationMinutes: 35 },
  { description: "Reviewing - Code Changes - Pull Request", project: "Work & Professional", durationMinutes: 25 },
  { description: "Planning - Sprint Goals - Q1 Objectives", project: "Creative & Planning", durationMinutes: 60 },
  { description: "Learning - TypeScript Patterns - Advanced Techniques", project: "Learning & Development", durationMinutes: 90 },
  { description: "Reading - Documentation - API Integration", project: "Learning & Development", durationMinutes: 40 },
  { description: "Writing - Blog Post - Time Management Tips", project: "Communication", durationMinutes: 50 },
  { description: "Researching - Productivity Tools - Comparison", project: "Deep Focus", durationMinutes: 30 },
  { description: "Fixing - Authentication Bug - Login Flow", project: "Work & Professional", durationMinutes: 55 },
  { description: "Designing - Dashboard Layout - User Interface", project: "Creative & Planning", durationMinutes: 70 },
  { description: "Walking - Morning Exercise - Neighborhood", project: "Physical Health", durationMinutes: 20 },
  { description: "Meditating - Mindfulness Practice - Breathwork", project: "Mental Wellness", durationMinutes: 15 },
  { description: "Cooking - Lunch Preparation - Meal Prep", project: "Meals & Nutrition", durationMinutes: 30 },
  { description: "Scrolling - Twitter Feed - Tech News", project: "Social Media & Digital", durationMinutes: 12 },
  { description: "Chatting - Team Standup - Daily Sync", project: "Communication", durationMinutes: 15 },
];

async function getWorkspaceId(sessionToken: string): Promise<number> {
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

  return workspaces[0].id;
}

async function createProject(
  sessionToken: string,
  workspaceId: number,
  projectName: string,
  color: string
): Promise<{ id: number; name: string }> {
  const requestBody = {
    name: projectName,
    color: color,
    is_private: true,
    active: true,
    wid: workspaceId,
    start_date: new Date().toISOString().split("T")[0],
  };

  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/projects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create project "${projectName}": ${response.status} - ${errorText}`
    );
  }

  const project = await response.json();
  console.log(`✓ Created project: ${project.name} (ID: ${project.id})`);
  return project;
}

async function createTimeEntry(
  sessionToken: string,
  workspaceId: number,
  description: string,
  projectId: number | undefined,
  startTime: Date,
  durationSeconds: number
): Promise<void> {
  const stopTime = new Date(startTime.getTime() + durationSeconds * 1000);

  const requestBody = {
    description,
    start: startTime.toISOString(),
    stop: stopTime.toISOString(),
    duration: durationSeconds,
    wid: workspaceId,
    created_with: "deeplog-seed",
    ...(projectId && { project_id: projectId }),
  };

  const response = await fetch(
    `https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create time entry "${description}": ${response.status} - ${errorText}`
    );
  }

  const entry = await response.json();
  console.log(`✓ Created time entry: ${entry.description} (${Math.round(durationSeconds / 60)}m)`);
}

async function seedAccount(sessionToken: string): Promise<void> {
  console.log("🌱 Starting account seeding...\n");

  try {
    // Get workspace ID
    console.log("Fetching workspace...");
    const workspaceId = await getWorkspaceId(sessionToken);
    console.log(`✓ Using workspace ID: ${workspaceId}\n`);

    // Create all predefined projects
    console.log(`Creating ${PREDEFINED_PROJECTS.length} projects...\n`);

    const projectMap = new Map<string, number>();

    for (let i = 0; i < PREDEFINED_PROJECTS.length; i++) {
      const projectName = PREDEFINED_PROJECTS[i];
      const color = PROJECT_COLORS[i % PROJECT_COLORS.length];

      const project = await createProject(sessionToken, workspaceId, projectName, color);
      projectMap.set(projectName, project.id);

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`\n✅ Successfully seeded ${PREDEFINED_PROJECTS.length} projects!\n`);

    // Create sample time entries
    console.log(`Creating ${SAMPLE_TIME_ENTRIES.length} sample time entries...\n`);

    // Create entries over the past 7 days
    const now = new Date();
    let currentTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    currentTime.setHours(9, 0, 0, 0); // Start at 9 AM

    for (const entry of SAMPLE_TIME_ENTRIES) {
      const projectId = projectMap.get(entry.project);
      const durationSeconds = entry.durationMinutes * 60;

      await createTimeEntry(
        sessionToken,
        workspaceId,
        entry.description,
        projectId,
        currentTime,
        durationSeconds
      );

      // Move to next time slot (add duration + random break between 5-30 minutes)
      const breakMinutes = Math.floor(Math.random() * 25) + 5;
      currentTime = new Date(currentTime.getTime() + (durationSeconds + breakMinutes * 60) * 1000);

      // If we've gone past 10 PM, jump to next day at 9 AM
      if (currentTime.getHours() >= 22) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(9, 0, 0, 0);
      }

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`\n✅ Successfully seeded ${SAMPLE_TIME_ENTRIES.length} time entries!`);
    console.log(`\n🎉 Account seeding complete!`);
  } catch (error) {
    console.error("\n❌ Error seeding account:", error);
    process.exit(1);
  }
}

// Main execution
const sessionToken = process.argv[2];

if (!sessionToken) {
  console.error("❌ Error: Toggl session token is required");
  console.log("\nUsage: npm run seed <TOGGL_SESSION_TOKEN>");
  console.log("\nYou can find your session token in your app's local storage");
  process.exit(1);
}

seedAccount(sessionToken);
