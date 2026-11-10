import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { buildAiSummaryBlock } from "@/lib/ai-summary";

test("interactive long entries paginate, fit current description, and protect edits and duplicates", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  process.env.OPENAI_API_KEY = "fake";
  process.env.LIMITLESS_API_KEY = "fake";
  process.env.CRON_SECRET = "fake-cron";
  process.env.TOGGL_SESSION_TOKEN = "fake";
  const start = "2026-11-01T08:00:00.000Z";
  const stop = "2026-11-02T16:00:00.000Z";
  let description = "Original notes";
  let currentDescription: string | undefined;
  let currentStop = stop;
  let gets = 0;
  let writes: Array<{ description: string }> = [];
  let inputs: string[] = [];
  let incomplete = false;
  let condenseWithEdit = false;
  let repeatedCursor = false;
  let transcriptPages = 0;
  const entry = () => ({ id: 123, workspace_id: 1, start, stop, description });
  globalThis.fetch = async (url, init) => {
    const address = String(url);
    if (address.includes("api.openai.com")) {
      const body = JSON.parse(String(init?.body));
      inputs.push(body.input);
      if (condenseWithEdit && inputs.length === 2)
        currentDescription = "Edited during compression " + "x".repeat(2700);
      return Response.json(
        incomplete
          ? {
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
            }
          : {
              status: "completed",
              output_text:
                condenseWithEdit && inputs.length === 1
                  ? "x".repeat(500)
                  : "The team agreed on the next project milestone.",
            },
      );
    }
    if (address.includes("api.limitless.ai")) {
      const params = new URL(address).searchParams;
      if (params.get("limit") === "1")
        return Response.json({ data: { lifelogs: [] } });
      transcriptPages++;
      const next = params.has("cursor");
      return Response.json({
        data: {
          lifelogs: [
            {
              id: next ? "second" : "first",
              startTime: start,
              endTime: stop,
              contents: [
                {
                  type: "blockquote",
                  startTime: start,
                  endTime: stop,
                  content: next
                    ? "Last page decision."
                    : "First page discussion.",
                },
              ],
            },
          ],
        },
        meta: {
          lifelogs: { nextCursor: next && !repeatedCursor ? null : "page-two" },
        },
      });
    }
    if (address.endsWith("/workspaces")) return Response.json([{ id: 1 }]);
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ ...entry(), ...writes.at(-1) });
    }
    gets++;
    return Response.json(
      gets > 1
        ? {
            ...entry(),
            description: currentDescription ?? description,
            stop: currentStop,
          }
        : entry(),
    );
  };
  const request = (cron = false) =>
    new NextRequest("http://test/api/cron/summarize-time-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cron
          ? { authorization: "Bearer fake-cron" }
          : { "x-toggl-session-token": "fake" }),
      },
      body: JSON.stringify({ entryId: 123, startDate: start, endDate: stop }),
    });
  const reset = () => {
    gets = 0;
    writes = [];
    inputs = [];
    transcriptPages = 0;
  };
  try {
    let response = await POST(request());
    assert.equal((await response.json()).results[0].status, "summarized");
    assert.equal(transcriptPages, 2);
    assert.ok(
      inputs[0].includes("First page discussion.") &&
        inputs[0].includes("Last page decision."),
    );
    assert.match(
      writes[0].description,
      /^Original notes\n\n<ai-summary \d{4}-/,
    );
    assert.ok(writes[0].description.length <= 3000);

    reset();
    currentDescription = "Recent human edit " + "x".repeat(2750);
    await POST(request());
    assert.ok(writes[0].description.startsWith(currentDescription));
    assert.ok(writes[0].description.length <= 3000);

    reset();
    currentDescription = "Existing notes " + "x".repeat(2700);
    condenseWithEdit = true;
    response = await POST(request());
    assert.equal((await response.json()).results[0].status, "summarized");
    assert.equal(gets, 3);
    assert.ok(writes[0].description.startsWith("Edited during compression "));
    assert.ok(writes[0].description.length <= 3000);
    condenseWithEdit = false;

    reset();
    currentDescription = undefined;
    incomplete = true;
    response = await POST(request());
    assert.match((await response.json()).results[0].error, /token limit twice/);
    assert.equal(writes.length, 0);
    incomplete = false;

    reset();
    currentStop = "2026-11-02T17:00:00Z";
    response = await POST(request());
    assert.match(
      (await response.json()).results[0].error,
      /time range changed/,
    );
    assert.equal(writes.length, 0);
    currentStop = stop;

    reset();
    repeatedCursor = true;
    response = await POST(request());
    assert.match(
      (await response.json()).results[0].error,
      /repeated a pagination cursor/,
    );
    assert.equal(writes.length, 0);
    repeatedCursor = false;

    reset();
    description = buildAiSummaryBlock({
      generatedAt: new Date().toISOString(),
      summary: "Existing summary",
    });
    response = await POST(request());
    assert.equal(
      (await response.json()).results[0].reason,
      "already_summarized",
    );
    assert.equal(inputs.length, 0);
    assert.equal(writes.length, 0);

    reset();
    description = "x".repeat(2900);
    response = await POST(request());
    assert.equal(
      (await response.json()).results[0].reason,
      "description_limit",
    );
    assert.equal(inputs.length, 0);
    assert.equal(writes.length, 0);

    reset();
    response = await POST(request(true));
    assert.equal(response.status, 400);
    assert.equal(gets, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      "OPENAI_API_KEY",
      "LIMITLESS_API_KEY",
      "CRON_SECRET",
      "TOGGL_SESSION_TOKEN",
    ]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});
