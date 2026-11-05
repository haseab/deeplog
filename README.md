# deeplog
for hardcore time trackers

open source software

uses toggl in the backend

### Search time entries

`GET /api/time-entries/search?q=planning&from_date=2026-10-01&to_date=2026-10-31`

Send the Toggl session key in the `x-toggl-session-token` header, as with the
other time-entry endpoints. No API key is required. The route uses the Analytics
query endpoint observed in Toggl Track's Detailed report in Chrome, with its
`description contains` filter, scoped to the authenticated user and workspace.

`q`, `from_date`, and `to_date` are required. Dates are inclusive `YYYY-MM-DD`
calendar dates in the Toggl profile timezone. Optional `page` is zero-based
(default `0`); `limit` is `1`–`100` (default `100`). Results are newest first.

The response contains `timeEntries` (the app's usual entry shape, with UTC
timestamps and duration in seconds), `profileTimeZone`, and
`pagination: { page, limit, hasMore }`. A full page sets `hasMore: true`; the
final request may return an empty page. This is a historical report search;
running timers and recent changes may not yet appear in Toggl Analytics.

Invalid input or a missing session returns `400`; an expired session returns
`401` with `isSessionExpired: true`; Toggl rate limits return `429`, and upstream
failures return `502`. Responses are not cached.

## Successive entry actions

Splits update immediately and show an Undo (⌘Z) toast before saving. Undo removes
the new segment and restores the original; Cmd+Enter saves immediately. The undo
window uses the same configured duration as combine (four seconds by default).

Combine, split, description uploads, and delayed field edits share an entry-level
mutation queue in the current browser tab. A follow-up action commits an earlier
combine, split, or field edit's undo window, then waits for its server acknowledgement.
The UI still updates immediately. Split children retain their queued actions when
the server replaces their temporary IDs, and late acknowledgements do not replace
newer optimistic times. If a prerequisite fails, dependent writes stop and the app
shows an error; description drafts remain recoverable locally.

With the development server running, the mocked regressions are:

```sh
node tests/combine-shortcuts.mjs
node tests/split-undo.mjs
node tests/successive-entry-actions.mjs
TEST_BASE_URL=http://127.0.0.1:3020 node tests/offline-descriptions.mjs
npx tsx --test src/lib/entry-mutations.test.ts
```

## Local development ports

- The development server for **deeplog** uses **http://localhost:3020**.
- Run `npm run dev` in the normal checkout; its development script sets port **3020** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.
