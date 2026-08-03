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
Both forms require a JSON body with an ISO date-time range of at most 24 hours:

```bash
curl -X POST http://localhost:3000/api/cron/summarize-time-entries \
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
- An exact entry/time range that already has a marker is skipped.
- The entry is fetched again immediately before the append, so recent human
  edits are preserved.

Summaries are appended in a durable, regex-friendly marker:

```html
<deeplog-ai-summary version="1" entry-id="123" source-start="2026-08-01T12:00:00.000Z" source-end="2026-08-01T12:30:00.000Z" generated-at="2026-08-01T13:00:00.000Z">
Summary content
</deeplog-ai-summary>
```

Helpers for extracting, removing, building, and detecting these blocks live in
`src/lib/ai-summary.ts`.
