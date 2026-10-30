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
