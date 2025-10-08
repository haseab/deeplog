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
    const {
      transcripts,
      openaiApiKey,
      todoistApiKey,
    } = body;

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!todoistApiKey) {
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
          // Get context: previous line + current line + next line
          const contextLines = [];

          if (i > 0) {
            contextLines.push(segments[i - 1].content);
          }
          contextLines.push(segment.content);
          if (i < segments.length - 1) {
            contextLines.push(segments[i + 1].content);
          }

          const context = contextLines.join(" ");

          extractedTasks.push({
            context,
            timestamp: transcript.startTime,
            transcriptId: transcript.id,
          });
        }
      }
    }

    // Process tasks with GPT-4o and create in Todoist
    const createdTasks = [];

    for (const task of extractedTasks) {
      try {
        // Call GPT-4o to generate a concise task
        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini", // Using mini for cost efficiency
            messages: [
              {
                role: "system",
                content: "You are a task extraction assistant. Given context from a conversation, extract and return ONLY a single, concise, actionable task. No explanations, no quotes, just the task itself. Maximum 100 characters."
              },
              {
                role: "user",
                content: `Extract a task from this context: "${task.context}"`
              }
            ],
            temperature: 0.3,
            max_tokens: 50,
          }),
        });

        if (!gptResponse.ok) {
          console.error("GPT API error:", await gptResponse.text());
          continue;
        }

        const gptData = await gptResponse.json();
        const taskContent = gptData.choices[0]?.message?.content?.trim();

        if (!taskContent) continue;

        // Create task in Todoist
        const todoistResponse = await fetch("https://api.todoist.com/rest/v2/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${todoistApiKey}`,
          },
          body: JSON.stringify({
            content: taskContent,
            description: `Extracted from transcript on ${new Date(task.timestamp).toLocaleDateString()}`,
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
          transcriptId: task.transcriptId,
        });

      } catch (error) {
        console.error("Error processing task:", error);
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