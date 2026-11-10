# Time-entry AI summarization

`POST /api/cron/summarize-time-entries` is a separate pipeline from the
Todoist task-extraction route. It fetches Toggl entries in a requested window,
matches each entry against Limitless transcript segments, and appends a
recall-oriented summary to that entry's existing description.

From the DeepLog table, Option–P sends the selected entry's ID and exact time
range to this route. Interactive requests authenticate with
`x-toggl-session-token`; cron requests continue to use `CRON_SECRET`.

## Request

Cron calls require a bearer token matching `CRON_SECRET`. Interactive table
calls instead provide the current `x-toggl-session-token` and an `entryId`.
Both forms require a JSON body with an ISO date-time range. Cron windows are limited
to 24 hours; interactive requests may summarize a longer individual entry:

```bash
curl -X POST http://localhost:3020/api/cron/summarize-time-entries \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-08-01T00:00:00-07:00",
    "endDate": "2026-08-02T00:00:00-07:00"
  }'
```

Required server environment variables:

- `CRON_SECRET`
- `TOGGL_SESSION_TOKEN`
- `LIMITLESS_API_KEY`
- `OPENAI_API_KEY`

## Safety and idempotency

- Human-written description text is never replaced or rewritten.
- The route skips encrypted descriptions.
- A Limitless result only reaches the LLM when at least one timestamped spoken
  segment actually overlaps the time entry. An empty response or a distant
  preceding lifelog is skipped.
- An entry with a compact summary is skipped. Legacy markers still use exact
  entry/time range matching. Compact markers are deliberately entry-scoped:
  remove the existing block to regenerate after changing an entry's times.
- The entry is fetched again immediately before the append, so recent human
  edits are preserved.

Summaries stay entirely in Toggl. New blocks contain only a short tag and the
UTC generation timestamp (seconds, with no fractional seconds):

```text
<ai-summary 2026-11-10T07:47:17>
Summary content
</ai-summary>
```

Existing `<deeplog-ai-summary ...>` blocks remain readable and recognizable.
They are not rewritten automatically.

## Long transcripts and description limits

- GPT-6.1 Sol (`gpt-6.1-sol`) generates summaries with medium reasoning effort.
- Each call allows 8,192 output tokens, including reasoning. A token-limited
  incomplete response retries once with 16,384 tokens. Partial responses are
  never saved. Other failures return a useful error without a Toggl write.
- All Limitless pages are fetched, including the preceding overlapping lifelog.
  Repeated pagination cursors fail the request rather than silently losing data.
- Evidence is split into chunks of at most 24,000 characters. Chunk notes are
  reduced as necessary before the final summary; oversized single segments
  are split without dropping text.
- The final summary uses the space left within the 3,000-character description
  after the existing text, separator, and compact marker. The description is
  fetched again before appending to preserve recent human edits. Oversized text
  gets up to two condensation attempts and is never cut off mid-sentence. Tag
  escaping is included in the size calculation. Fewer than 120 available
  characters causes a `description_limit` skip.
- If the entry times changed during generation, nothing is written; retry it.
  Upstream work is bounded to 275 seconds within the route's 300-second limit.

Mocked verification (no API credentials or real Toggl writes):

```sh
npx tsx --test src/lib/summary-generation.test.ts src/app/api/cron/summarize-time-entries/route.test.ts
```

Helpers for extracting, removing, building, and detecting these blocks live in
`src/lib/ai-summary.ts`.
