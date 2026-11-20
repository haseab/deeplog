# deeplog
for hardcore time trackers

open source software

uses toggl in the backend

## Railway process lifecycle

`railway.json` starts Next.js directly with `exec node`, so Railway's SIGTERM
reaches the server without an npm wrapper reporting the planned shutdown as a
failed command. Next.js handles SIGTERM and exits successfully after closing
connections. Railway allows 30 seconds for this cleanup before sending SIGKILL.
Keep `NEXT_MANUAL_SIG_HANDLE` unset so Next.js retains its built-in signal handlers.

This configuration takes effect on the next deployment. When checking the fix,
replace that deployment once more and confirm its outgoing process shuts down
without `npm error signal SIGTERM` or a crash notification. The first deployment
of this fix still stops the previous version using its old npm command.

## Recording task extraction

Task extraction runs on Railway with a persistent volume, using a per-recording
filesystem ledger instead of the legacy processed timestamp. GPT-6 Luna enumerates
potential todos; GPT-6.1 Sol reviews them against the full transcript and keeps
only relevant, concrete, still-actionable obligations before Todoist delivery. It rescans seven
days, resumes older incomplete work, and records individual Todoist deliveries.
See [TASK_EXTRACTION.md](TASK_EXTRACTION.md) for volume configuration, migration,
backfills, status, and recovery. The extraction route cannot run on Vercel.

In History (`/pendant`), **Test extraction** previews candidates over an arbitrary
date range without creating Todoist tasks or adding candidates to the production
delivery ledger. It reports progress across all pages and supports stop/resume.

## Time-entry links

The table accepts `from` and `to` as dates or ISO datetimes:

- Whole days: `/?from=2026-11-01&to=2026-11-05`
- Local times: `/?from=2026-11-01T14:30&to=2026-11-02T10:00`
- Exact UTC instants: `/?from=2026-11-01T22:30:00Z&to=2026-11-02T18:00:00Z`

Dates include the entire end day. Datetimes use an inclusive start and exclusive
end; entries that overlap the window appear with their full original durations.
Seconds and milliseconds are supported, and dates and datetimes can be mixed.
Values without an offset use the table's selected timezone. `Z` or an explicit
offset fixes an exact instant; encode a positive offset's `+` as `%2B` in a URL
(for example, `2026-11-02T10:00%2B05:30`). Nonexistent or repeated local times
at daylight-saving transitions require a valid explicit offset instead.

Datetime boundaries survive reloads, pagination, and resyncs. Choosing a new
range in the calendar switches back to whole days. The main
`GET /api/time-entries` endpoint accepts the same formats in `from_date` and
`to_date`, with `timezone` selecting the timezone for offset-free values.

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

## Toggl request pacing

Server-side Toggl requests share a per-credential queue across timeline routes,
session validation, tracking integrations, and summarization jobs. Each credential
has at most one upstream request in flight. Session-authenticated (Bearer) requests
share a token bucket with capacity **8** and refill **3 requests/second**. Available
tokens allow immediate starts; only an exhausted budget waits for refill. A normal
six-request sync has no fixed gap between calls.
Public API token (Basic) requests retain at least 1.1 seconds between starts.
Different credentials have independent queues.

A Toggl `429` starts a shared cooldown using its valid `Retry-After` header.
Without that header, session cooldowns start at one second and double on repeated
throttling up to 30 seconds; escalation resets after a minute without throttling.
The burst budget is drained on 429 and refills during recovery. Public API token
requests retain a two-minute fallback. Queued and new calls return a local `429` during that
cooldown without contacting Toggl. The queue never automatically replays writes;
existing draft recovery and operation error handling remain responsible for retrying.
Rate limits propagate as HTTP `429` with `code: "TOGGL_RATE_LIMITED"`,
`retryAfter` seconds, `isSessionExpired: false`, and a `Retry-After` header,
including failures during session validation. The frontend shows a shared rate-limit
toast and pauses background description checks for that session until the cooldown
ends. Description drafts remain saved locally; failed interactive writes keep their
existing rollback/retry behavior.
Requests canceled while queued do not reach Toggl, and network errors release the semaphore.

To keep foreground loads responsive, successful profile, workspace, project and tag
GETs are cached per credential and full URL for five minutes. Concurrent metadata
reads share one request; canceling a caller does not cancel other callers' reads.
Entry descriptions, running timers, and Analytics queries are never cached.
Project/tag writes and upstream 401 responses invalidate the credential's metadata.
Background description uploads wait for the first successful timeline load.
Unresolved conflicts (including missing entries) are retained for explicit review
instead of being polled on tab focus or a timer. Focus refreshes never supersede
an active timeline load; manual reloads and date changes still can.

Actual quota headers also matter: zero `X-Toggl-Quota-Remaining` pauses further
network calls in the observed user/workspace/organization scope until
`X-Toggl-Quota-Resets-In` expires. A successful last allowed request still succeeds.
Explicit quota exhaustion without a reset uses a one-hour fallback. Quota failures
return `402`, `code: "TOGGL_QUOTA_EXHAUSTED"` and `Retry-After`, retain drafts and
pause their background checks. Generic payment/feature 402s are left alone.
Workspace-to-organization aliases are not inferred, so sibling scopes can each
observe their own exhaustion before being paused. Cached metadata remains usable.

This session policy is based on read-only measurements recorded in [AGENTS.md](AGENTS.md):
3.25 requests/second passed for two minutes; 3.5/second eventually throttled;
saturated backend instances each accepted 11 immediate requests. Routing and other
traffic affect results, so these are empirical observations rather than a service
guarantee. Public API quotas were not consumed by the tested session traffic;
the application still honors real quota signals.

Coordination is in memory within one Node process. Multiple production replicas,
other applications, and different credentials for the same Toggl account are not
coordinated. Restarting the process clears the queue and cooldown state.

```sh
npx tsx --test src/lib/toggl-fetch.test.ts src/lib/toggl-request-budget.test.ts src/lib/toggl-rate-limit.test.ts
```

## Local development ports

- The development server for **deeplog** uses **http://localhost:3020**.
- Run `npm run dev` in the normal checkout; its development script sets port **3020** explicitly. Do not use localhost:3000 or silently increment ports.
- Reuse an existing server for this checkout. If the assigned port is occupied by an unrelated process, inspect ownership rather than stopping another project's server.
- Port changes must update the development script, README, environment examples, and local integration/callback URLs together. Keep real credentials in ignored local environment files; never commit them or change production URLs for local development.


## Toggl request efficiency and diagnostics

Stable profile/workspace/project/tag reads are credential-scoped, coalesced and
cached for five minutes per server process. Entry edits keep that metadata warm.
Project/tag mutations invalidate only the matching metadata family; upstream 401s
invalidate all metadata for that credential. External metadata changes appear on
expiry (or after a server restart). Cold processes must still load metadata.

The UI sends project IDs for known selections; name-only requests remain supported
for old clients and pins whose projects are absent from the active list. Ordinary
field edits use one workspace PUT without first reading the entry. Description
edits retain a fresh account-scoped three-way conflict check. Recovery sends bounded
uncertain-upload evidence with that same check, so an acknowledged or uncertain
upload does not require a separate review read. Evidence is cleared on acknowledgement.

Timeline loads return a `snapshot` token. Load More sends that token to reuse the
same sorted range rather than download the full Analytics range again. Snapshots
are scoped to credential, range and timezone, expire after five minutes, and are
bounded to 32 per process. Successful entry/project/tag writes and upstream 401s
invalidate that credential's snapshots; a write during loading prevents publishing
that load as a reusable snapshot. Explicit refresh always queries fresh entry data.
Expired, evicted, invalidated or cross-process snapshots fall back to a fresh load.
Changes made in other Toggl clients become visible on refresh or snapshot expiry.

Server logs contain two structured event families:

- `[toggl-request]`: one per wrapper call, with cache `hit`, `shared`, `miss` or
  `bypass`, status, outcome, total duration and queue/network timings.
- `[toggl-upstream]`: one per actual outbound fetch, including failed fetches and
  reads which finish after the initiating browser request cancels. Count these
  events for actual egress; a shared cache caller does not produce another fetch.

Endpoint IDs are normalized to `:id`; headers, credentials, query strings,
descriptions, bodies and exception messages are excluded. `networkMs` measures
fetch through response headers, and `queueWaitMs` includes both predecessor wait
and, for public API token requests, rate pacing. Session requests have no fixed
spacing; session requests use the shared burst budget, and both authentication
types retain serialization, quota tracking and shared 429 cooldowns.

Summarize captured logs by endpoint, cache reuse, egress, errors and p95 timings:

```sh
node scripts/summarize-toggl-requests.mjs /path/to/server.log
# Or pipe captured hosting logs into the command without a filename.
```

Warm-cache request counts verified at the mocked upstream boundary: field edits
1, description save/recovery 2, timeline refresh 2, timer switch using an ID 3,
and snapshot pagination 0. Cold metadata and additional tag pages add requests.
These counts are regression-test results, not a production traffic measurement.

## List refresh timings

List loads emit one `[deeplog-refresh-client]` record in the browser console and
best-effort server logs, and one `[deeplog-refresh-backend]` record in server logs.
Match their `requestId` to distinguish browser delays from backend work. Existing
`[toggl-request]` and `[toggl-upstream]` diagnostics remain available.

Client fields are milliseconds: `requestMs` measures dispatch through response
headers, `decodeMs` covers body transfer and JSON parsing, and `commitMs` covers
reconciliation through React's layout effect. `totalMs` ends after two animation
frames (`paint-opportunity`), an approximation rather than GPU paint completion.
Hidden pages and stalled frames use `hidden` or `paint-timeout`; failed, aborted
and superseded requests have distinct outcomes. Measurement starts at load
execution, not the physical input event.

Backend records include total handler time and fixed phases with request/cache
counts, queue wait, network time and total request time. `Server-Timing` exposes
`dl_api`, `dl_queue`, `dl_network` and per-phase totals on the list response.
Phase durations include cache waits and can overlap; they need not sum to handler
time. Comparing browser `requestMs` with `dl_api` exposes transport/dispatch overhead.

Client reports contain only a random correlation ID, timing numbers, status,
outcome and visibility. No descriptions, entries, selected dates, account IDs,
URLs or credentials are logged. The same-origin JSON endpoint is strict,
size-bounded and rate-limited; client reports are untrusted diagnostics, not audit
evidence. Reports are never retried and cannot block refreshes. Caching,
mutations, timers and saved drafts are unchanged.
