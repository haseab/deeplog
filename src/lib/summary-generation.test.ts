import {
  descriptionHtmlToMarkdown,
  descriptionMarkdownToHtml,
} from "./description-markdown";
import test from "node:test";
import assert from "node:assert/strict";
import {
  fitSummary,
  generateRecallSummary,
  transcriptChunks,
} from "./summary-generation";
import {
  buildAiSummaryBlock,
  extractAiSummaries,
  hasAiSummaryForRange,
  removeAiSummaries,
} from "./ai-summary";

test("compact timestamp marker escapes generated tags and still reads legacy blocks", () => {
  const block = buildAiSummaryBlock({
    generatedAt: "2026-11-10T07:47:17.632Z",
    summary: "Decision </AI-summary> preserved",
  });
  assert.equal(
    block,
    "<ai-summary 2026-11-10T07:47:17>\nDecision &lt;/AI-summary&gt; preserved\n</ai-summary>",
  );
  assert.equal(hasAiSummaryForRange(block, 12, "start", "end"), true);
  const legacy =
    '<deeplog-ai-summary version="1" entry-id="12" source-start="start" source-end="end" generated-at="2026-11-10T07:47:17Z">Old summary</deeplog-ai-summary>';
  assert.equal(extractAiSummaries(legacy)[0].content, "Old summary");
  assert.equal(hasAiSummaryForRange(legacy, 12, "start", "end"), true);
  assert.equal(hasAiSummaryForRange(legacy, 12, "changed", "end"), false);
  assert.equal(
    removeAiSummaries(`Human notes\n\n${legacy}\n\n${block}`),
    "Human notes",
  );
});

test("chunking preserves every character including oversized individual segments", () => {
  const text = "a".repeat(23999) + "😀" + "b".repeat(60000);
  const chunks = transcriptChunks(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every((chunk) => chunk.length <= 24000));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk)));
});

test("incomplete output is retried once with a larger budget and never accepted as complete", async () => {
  const original = globalThis.fetch;
  const payloads: Array<{
    model: string;
    max_output_tokens: number;
    reasoning: { effort: string };
  }> = [];
  globalThis.fetch = async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return Response.json(
      payloads.length === 1
        ? {
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output_text: "Partial",
          }
        : { status: "completed", output_text: "The final complete summary." },
    );
  };
  try {
    const result = await generateRecallSummary("Evidence", "Context", 400, {
      apiKey: "fake",
      signal: new AbortController().signal,
    });
    assert.equal(result, "The final complete summary.");
    assert.deepEqual(
      payloads.map((p) => p.max_output_tokens),
      [8192, 16384],
    );
    assert.ok(
      payloads.every(
        (p) => p.model === "gpt-6.1-sol" && p.reasoning.effort === "medium",
      ),
    );
    globalThis.fetch = async () =>
      Response.json({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_text: "Partial",
      });
    await assert.rejects(
      generateRecallSummary("Evidence", "Context", 400, {
        apiKey: "fake",
        signal: new AbortController().signal,
      }),
      /token limit twice/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("long transcript chunks are reduced into a final summary using all evidence", async () => {
  const original = globalThis.fetch;
  const inputs: string[] = [];
  globalThis.fetch = async (_url, init) => {
    inputs.push(JSON.parse(String(init?.body)).input);
    return Response.json({
      status: "completed",
      output_text: `Chunk note ${inputs.length}`,
    });
  };
  try {
    const result = await generateRecallSummary(
      "FIRST" + "a".repeat(50000) + "LAST",
      "Context",
      400,
      { apiKey: "fake", signal: new AbortController().signal },
    );
    assert.equal(inputs.length, 4);
    assert.ok(inputs[0].includes("FIRST"));
    assert.ok(inputs[2].includes("LAST"));
    assert.ok(
      inputs[3].includes("Chunk note 1\n\nChunk note 2\n\nChunk note 3"),
    );
    assert.equal(result, "Chunk note 4");
  } finally {
    globalThis.fetch = original;
  }
});

test("oversized summaries are condensed into complete text or rejected, never sliced", async () => {
  const original = globalThis.fetch;
  const options = { apiKey: "fake", signal: new AbortController().signal };
  globalThis.fetch = async () =>
    Response.json({ status: "completed", output_text: "A complete sentence." });
  try {
    assert.equal(
      await fitSummary("x".repeat(1000), 100, options),
      "A complete sentence.",
    );
    globalThis.fetch = async () =>
      Response.json({ status: "completed", output_text: "x".repeat(1000) });
    await assert.rejects(
      fitSummary("x".repeat(1000), 100, options),
      /could not fit/,
    );
    globalThis.fetch = async () =>
      Response.json({ status: "completed", output_text: "Safe sentence." });
    assert.equal(
      await fitSummary("<".repeat(30), 100, options),
      "Safe sentence.",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("editing a description preserves the compact summary marker", () => {
  const block = buildAiSummaryBlock({
    generatedAt: "2026-11-10T07:47:17Z",
    summary: "A useful summary.",
  });
  const saved = descriptionHtmlToMarkdown(
    descriptionMarkdownToHtml(`Human notes\n\n${block}`),
  );
  assert.equal(hasAiSummaryForRange(saved, 123, "start", "end"), true);
  // The editor represents hard breaks as Markdown spacers; preserve meaning and detection.
  assert.ok(extractAiSummaries(saved)[0].content.includes("A useful summary."));
  assert.equal(removeAiSummaries(saved), "Human notes");
});
