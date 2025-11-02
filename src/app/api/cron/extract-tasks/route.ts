import { mkdir, readFile, writeFile } from "fs/promises";
import { NextRequest } from "next/server";
import { join } from "path";

// Trigger keywords to look for in transcripts
const TASK_KEYWORDS = [
  "create a task",
  "remind me",
  "todo",
  "to do",
  "task i need",
  "i need to",
  "don't forget",
  "remember to",
  "make sure to",
  "add to my list",
  "put on my list",
  "schedule",
  "deadline",
  "due",
];

interface ProcessedState {
  lastProcessedTimestamp: string;
}

const PROCESSED_STATE_FILE = join(
  process.cwd(),
  "data",
  "processed-tasks.json"
);

async function loadProcessedState(): Promise<ProcessedState> {
  try {
    const data = await readFile(PROCESSED_STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // File doesn't exist or error reading - return default state
    return {
      lastProcessedTimestamp: new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  }
}

async function saveProcessedState(state: ProcessedState): Promise<void> {
  try {
    // Ensure data directory exists
    await mkdir(join(process.cwd(), "data"), { recursive: true });
    await writeFile(PROCESSED_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error("Error saving processed state:", error);
  }
}

interface Transcript {
  id: string;
  startTime: string;
  contents?: Array<{
    type: string;
    content?: string;
    startTime?: string;
    endTime?: string;
  }>;
}

async function fetchAllTranscripts(
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<Transcript[]> {
  const allTranscripts: Transcript[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  console.log(`Fetching transcripts from ${startDate} to ${endDate}`);

  while (hasMore) {
    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
      limit: "100", // Max per request
      direction: "desc",
      includeMarkdown: "true",
      includeHeadings: "true",
      includeContents: "true",
    });

    if (cursor) {
      params.append("cursor", cursor);
    }

    const url = `https://api.limitless.ai/v1/lifelogs?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Limitless API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(
      "Limitless API response:",
      JSON.stringify(data).substring(0, 500)
    );

    // Log first transcript structure if available
    if (data.data?.lifelogs?.[0]) {
      console.log(
        "First transcript contents sample:",
        JSON.stringify(data.data.lifelogs[0].contents?.slice(0, 3), null, 2)
      );
    }

    const transcripts = Array.isArray(data.data?.lifelogs)
      ? data.data.lifelogs
      : [];

    allTranscripts.push(...transcripts);

    // Check for pagination
    cursor = data.data?.cursor || null;
    hasMore = !!cursor && transcripts.length > 0;

    console.log(
      `Fetched ${transcripts.length} transcripts, total: ${allTranscripts.length}`
    );
  }

  return allTranscripts;
}

async function processUserTasks(
  limitlessApiKey: string,
  openaiApiKey: string,
  todoistApiKey: string,
  startDate?: string,
  endDate?: string
) {
  console.log(`=== TASK EXTRACTION STARTED at ${new Date().toISOString()} ===`);

  // Load processed state
  const state = await loadProcessedState();
  console.log("Loaded state:", state);

  // Use provided dates or fall back to state tracking
  const start = startDate || state.lastProcessedTimestamp;
  const end = endDate || new Date().toISOString();

  console.log(`Date range: ${start} to ${end}`);

  // Fetch ALL transcripts in the date range
  const allTranscripts = await fetchAllTranscripts(limitlessApiKey, start, end);

  console.log(`Found ${allTranscripts.length} total transcripts`);

  if (allTranscripts.length === 0) {
    return {
      totalTranscripts: 0,
      potentialTasks: 0,
      createdTasks: 0,
      tasks: [],
    };
  }

  // Extract relevant contexts around keyword matches
  interface SegmentWithTimestamp {
    content: string;
    timestamp: string;
    startTime?: string;
    endTime?: string;
  }

  const relevantContexts: string[] = [];
  const usedSegmentIndices = new Set<string>(); // Track which segments we've already included

  for (const transcript of allTranscripts) {
    const allContents = transcript.contents || [];

    // Get all blockquote segments with timestamps
    const segments: SegmentWithTimestamp[] = allContents
      .filter((c) => c.type === "blockquote" && c.content?.trim())
      .map((c) => ({
        content: c.content!,
        timestamp: new Date(
          c.startTime || transcript.startTime
        ).toLocaleString(),
        startTime: c.startTime,
        endTime: c.endTime,
      }));

    // Find segments with task keywords and extract context
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const contentLower = segment.content.toLowerCase();
      const hasKeyword = TASK_KEYWORDS.some((keyword) =>
        contentLower.includes(keyword)
      );

      if (hasKeyword) {
        // Build context: previous + current + next
        const contextLines: string[] = [];
        const contextKey = `${transcript.id}-${i}`;

        // Skip if we've already included this segment in a context
        if (usedSegmentIndices.has(contextKey)) continue;

        // Add previous segment if exists
        if (i > 0) {
          usedSegmentIndices.add(`${transcript.id}-${i - 1}`);

          // Calculate silence before current segment
          if (segments[i - 1].endTime && segments[i].startTime) {
            const silenceMs =
              new Date(segments[i].startTime!).getTime() -
              new Date(segments[i - 1].endTime!).getTime();
            const silenceSeconds = Math.round(silenceMs / 1000);
            if (silenceSeconds >= 5) {
              contextLines.push(`[${silenceSeconds}s silence before]`);
            }
          }

          contextLines.push(
            `[${segments[i - 1].timestamp}] ${segments[i - 1].content}`
          );
        }

        // Add current segment
        usedSegmentIndices.add(contextKey);
        contextLines.push(`[${segment.timestamp}] ${segment.content}`);

        // Add next segment if exists
        if (i < segments.length - 1) {
          usedSegmentIndices.add(`${transcript.id}-${i + 1}`);

          // Calculate silence after current segment
          if (segment.endTime && segments[i + 1].startTime) {
            const silenceMs =
              new Date(segments[i + 1].startTime!).getTime() -
              new Date(segment.endTime!).getTime();
            const silenceSeconds = Math.round(silenceMs / 1000);
            if (silenceSeconds >= 5) {
              contextLines.push(`[${silenceSeconds}s silence after]`);
            }
          }

          contextLines.push(
            `[${segments[i + 1].timestamp}] ${segments[i + 1].content}`
          );
        }

        relevantContexts.push(contextLines.join("\n"));
      }
    }
  }

  console.log(`=== Found ${relevantContexts.length} keyword matches ===`);

  // If no task keywords found, return early
  if (relevantContexts.length === 0) {
    console.log("No task keywords found, updating state and returning");

    await saveProcessedState({ lastProcessedTimestamp: end });
    return {
      totalTranscripts: allTranscripts.length,
      potentialTasks: 0,
      createdTasks: 0,
      tasks: [],
      processedRange: {
        start,
        end,
      },
    };
  }

  // Deduplicate contexts (some might overlap if keywords are close together)
  const uniqueContexts = Array.from(new Set(relevantContexts));
  console.log(`Deduplicated to ${uniqueContexts.length} unique contexts`);

  // Combine all contexts
  const combinedContexts = uniqueContexts.join("\n\n---\n\n");

  console.log();
  console.log("=== Calling OpenAI API ===");
  console.log(`Full context:\n${combinedContexts}`);
  console.log();

  const gptResponse = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a task extraction assistant. You will receive a conversation transcript with timestamps and silence gaps. Look for key phrases where someone mentions something they need to do or something they want to remember. However each task must be distinct and actionable. For instance 'Schedule a meeting' is too broad. However 'Schedule a meeting with John' is precise. Each task should be only one sentence. Return a JSON object with a 'tasks' array containing the task strings. It is ok to return no tasks if there are no actionable tasks in the conversation. Silence gaps (5+ seconds) indicate topic changes and help identify separate tasks.",
          },
          {
            role: "user",
            content: `Here are conversation snippets with key phrases. Create a list of actionable tasks:\n\n${combinedContexts}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    }
  );

  if (!gptResponse.ok) {
    console.error("GPT API error:", await gptResponse.text());
    throw new Error("Failed to call OpenAI API");
  }

  const gptData = await gptResponse.json();
  const gptContent = gptData.choices[0]?.message?.content?.trim();

  console.log("OpenAI response:", gptContent);

  let aiTasks: string[] = [];
  try {
    const parsed = JSON.parse(gptContent || "{}");
    aiTasks = (parsed.tasks || []).filter(
      (t: string | null) => t !== null && t.trim() !== ""
    );
    console.log(`Parsed ${aiTasks.length} valid tasks from AI`);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    throw new Error("Invalid AI response format");
  }

  // Deduplicate tasks
  const uniqueTasks = new Set<string>();
  const deduplicatedTasks: string[] = [];

  for (const task of aiTasks) {
    const normalizedContent = task.toLowerCase().trim();
    if (!uniqueTasks.has(normalizedContent)) {
      uniqueTasks.add(normalizedContent);
      deduplicatedTasks.push(task);
    }
  }

  console.log(`Deduplicated to ${deduplicatedTasks.length} unique tasks`);

  // Create tasks in Todoist
  console.log("=== Creating Todoist tasks ===");
  const createdTasks = [];

  for (let i = 0; i < deduplicatedTasks.length; i++) {
    const taskContent = deduplicatedTasks[i];
    console.log(`Creating task ${i + 1}: "${taskContent}"`);

    try {
      const todoistResponse = await fetch(
        "https://api.todoist.com/rest/v2/tasks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${todoistApiKey}`,
          },
          body: JSON.stringify({
            content: taskContent,
            description: `Extracted from transcript on ${new Date(
              end
            ).toLocaleDateString()}`,
            labels: ["auto-extracted", "from-transcript"],
            due_string: "tomorrow at 9am",
          }),
        }
      );

      if (!todoistResponse.ok) {
        console.error("Todoist API error:", await todoistResponse.text());
        continue;
      }

      const todoistTask = await todoistResponse.json();
      createdTasks.push({
        task: taskContent,
        todoistId: todoistTask.id,
      });

      console.log(`✓ Created task in Todoist (ID: ${todoistTask.id})`);
    } catch (error) {
      console.error("Error creating Todoist task:", error);
    }
  }

  // Update processed state with current end timestamp
  await saveProcessedState({ lastProcessedTimestamp: end });

  console.log(`=== TASK EXTRACTION COMPLETE ===`);
  console.log(`Created ${createdTasks.length} tasks in Todoist`);

  return {
    totalTranscripts: allTranscripts.length,
    potentialTasks: aiTasks.length,
    createdTasks: createdTasks.length,
    tasks: createdTasks,
    processedRange: {
      start,
      end,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verify authorization (simple secret token for security)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "your-secret-here";

    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get credentials from environment
    const limitlessApiKey = process.env.LIMITLESS_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const todoistApiKey = process.env.TODOIST_API_KEY;

    if (!limitlessApiKey || !openaiApiKey || !todoistApiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing required API keys in environment variables",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get optional date range from request body
    const body = await request.json().catch(() => ({}));
    const startDate = body.startDate;
    const endDate = body.endDate;

    const result = await processUserTasks(
      limitlessApiKey,
      openaiApiKey,
      todoistApiKey,
      startDate,
      endDate
    );

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Task extraction error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to extract tasks",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
