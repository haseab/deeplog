import { NextRequest } from "next/server";

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

interface ExtractedTask {
  context: string;
  timestamp: string;
  transcriptId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcripts, password, openaiApiKey, todoistApiKey } = body;

    // Verify password hash
    if (!password) {
      return new Response(
        JSON.stringify({ error: "Password required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Hash the provided password and compare with stored hash
    const crypto = require('crypto');
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const allowedHash = process.env.EXTRACT_TASKS_PASSWORD_HASH;

    if (!allowedHash || passwordHash !== allowedHash) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use provided API keys or fall back to environment variables
    const finalOpenaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY;
    const finalTodoistApiKey = todoistApiKey || process.env.TODOIST_API_KEY;

    if (!finalOpenaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!finalTodoistApiKey) {
      return new Response(
        JSON.stringify({ error: "Todoist API key is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const extractedTasks: ExtractedTask[] = [];

    // Process each transcript
    for (const transcript of transcripts) {
      const segments = transcript.contents?.filter(
        (c: { type: string; content?: string }) => c.type === "blockquote" && c.content?.trim()
      ) || [];

      // Search for task keywords in segments
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const contentLower = segment.content.toLowerCase();

        // Check if segment contains any trigger keywords
        const hasTaskKeyword = TASK_KEYWORDS.some(keyword =>
          contentLower.includes(keyword)
        );

        if (hasTaskKeyword) {
          // Get entire consecutive transcript (without silence/gaps)
          // Start from current segment and work backwards to find the beginning
          let startIndex = i;
          while (startIndex > 0) {
            startIndex--;
          }

          // Collect all consecutive segments (entire transcript)
          const contextLines = segments.map((s: { content: string }) => s.content);
          const context = contextLines.join(" ");

          extractedTasks.push({
            context,
            timestamp: transcript.startTime,
            transcriptId: transcript.id,
          });

          // Break after finding one match in this transcript to avoid duplicates
          break;
        }
      }
    }

    // Process tasks with GPT-4o and create in Todoist
    const createdTasks = [];

    // Build the prompt with all conversations labeled
    const conversationsText = extractedTasks.map((task, index) => {
      return `Conversation ${index + 1}:\n${task.context}`;
    }).join('\n\n---\n\n');

    if (extractedTasks.length > 0) {
      try {
        // Call GPT-4o to extract tasks from all conversations
        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${finalOpenaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a task extraction assistant. Given multiple conversations, extract actionable tasks considering the full context of each conversation. Only extract genuine tasks - consider the conversation context to determine if something is truly a task or just casual discussion. Return a JSON object with a 'tasks' array containing just the task strings. Maximum 100 characters per task."
              },
              {
                role: "user",
                content: `Extract tasks from these conversations:\n\n${conversationsText}\n\nReturn JSON format: {"tasks": ["task 1", "task 2", ...]}`
              }
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: "json_object" }
          }),
        });

        if (!gptResponse.ok) {
          console.error("GPT API error:", await gptResponse.text());
        } else {
          const gptData = await gptResponse.json();
          const responseContent = gptData.choices[0]?.message?.content?.trim();

          if (responseContent) {
            // Parse the JSON response
            let tasksArray = [];
            try {
              const parsed = JSON.parse(responseContent);
              tasksArray = parsed.tasks || [];
            } catch (e) {
              console.error("Failed to parse GPT response:", e);
            }

            // Create each task in Todoist
            for (const taskContent of tasksArray) {
              if (!taskContent || typeof taskContent !== 'string') continue;

              try {
                const todoistResponse = await fetch("https://api.todoist.com/rest/v2/tasks", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${finalTodoistApiKey}`,
                  },
                  body: JSON.stringify({
                    content: taskContent,
                    description: `Extracted from transcript`,
                    labels: ["auto-extracted", "from-transcript"],
                  }),
                });

                if (!todoistResponse.ok) {
                  console.error("Todoist API error:", await todoistResponse.text());
                  continue;
                }

                const todoistTask = await todoistResponse.json();
                createdTasks.push({
                  task: taskContent,
                  todoistId: todoistTask.id,
                });
              } catch (error) {
                console.error("Error creating Todoist task:", error);
              }
            }
          }
        }

      } catch (error) {
        console.error("Error processing tasks:", error);
      }
    }

    return new Response(
      JSON.stringify({
        found: extractedTasks.length,
        created: createdTasks.length,
        tasks: createdTasks,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Task extraction error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to extract tasks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}