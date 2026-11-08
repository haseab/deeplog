# Recording task extraction

`POST /api/cron/extract-tasks` inventories Limitless recordings and creates tasks
in the Todoist project named `task-extraction`. `GET` on the same endpoint reports
coverage and unresolved work. Both require `Authorization: Bearer <CRON_SECRET>`.

## Railway deployment

1. Use the existing persistent volume attached to the **Railway service executing
   this route**. Production project `deeplog` has `deeplog-volume` mounted at
   `/app/data` on service `deeplog` (verified with `rw personal volume`). Use one
   service instance and one shared ledger directory.
2. Extraction automatically uses `<RAILWAY_VOLUME_MOUNT_PATH>/task-extraction`.
   Railway supplies this variable for attached volumes; no additional path variable
   is required. The existing production volume therefore stores the ledger in
   `/app/data/task-extraction`. An optional absolute `TASK_EXTRACTION_DATA_DIR` overrides
   the default but must remain inside the attached volume. Production refuses
   to fall back to the app's ordinary filesystem when no volume/path is configured.
3. Set `CRON_SECRET`, `LIMITLESS_API_KEY`, `OPENAI_API_KEY`, and `TODOIST_API_KEY` in
   the service's environment. Create exactly one Todoist project named
   `task-extraction`. Keep credentials out of source control.
4. The scheduler defaults to `https://deeplog.app/api/cron/extract-tasks`, which
   is served by Railway. Set `DEEPLOG_CRON_SECRET` to the same secret. If extraction
   moves to another Railway service, override `DEEPLOG_EXTRACTION_URL` with its
   full HTTPS endpoint URL. The hourly worker still triggers extraction every
   three hours (UTC).
5. Enable volume backups and verify GET reports state after a redeployment.
   A volume is persistent storage, not a backup. Never remove the ledger as a
   way of retrying work.

The frontend can remain on Vercel. Real extraction refuses to run there: Vercel
functions cannot host this persistent local ledger. Synthetic AI dry runs do not
need ledger storage. The app's ordinary deployment directory is not used for
production state. See [Railway volumes](https://docs.railway.com/volumes).

Locally, the default is `data/task-extraction/`, ignored by Git. Tests use isolated
temporary directories and mocked providers; they create no real Todoist tasks.
The local development server remains `http://localhost:3020` (`npm run dev`).

## Migration and first run

`data/processed-tasks.json` is now legacy reference only. It is neither read nor
updated. Its timestamp is not evidence that individual recordings succeeded.
The new ledger initially scans the last seven days (plus one preceding day for
boundary context). It does not automatically process the entire historical archive.

Existing Todoist tasks from the old extractor have no reliable source mapping.
They cannot be safely deduplicated automatically. Before enabling the regular
scheduler, run discovery and draft extraction, inspect the results against
existing Todoist tasks, and link already-created tasks as described below.
Do not enable automatic delivery until this initial overlap has been reconciled.

Request bodies:

```json
{"discoveryOnly":true}
```

Fetches and saves recordings without calling the AI or creating tasks.

```json
{"draftOnly":true}
```

Fetches recordings and saves extracted candidates without sending them to
Todoist. GET lists pending candidates and IDs. Link known legacy Todoist tasks
using `resolveDelivery` with `todoistId` below; pending drafts can be linked too.
Normal `{}` runs deliver pending candidates, so keep the scheduler disabled
during review. Discovery/draft modes apply to one invocation; they do not
permanently disable delivery by other callers.

## Testing arbitrary historical ranges without task creation

In `/pendant`, click **Test extraction**. The dialog starts with the history
view's range. Choose any local start/end time, or use the 3/7/30-day presets.
Supply your OpenAI key (prefilled from Settings if saved); the connected Limitless
key is reused. Click **Run test**. The UI fetches all pages and extracts in batches,
showing discovered/extracted counts, candidates by recording, and failures.
It labels incomplete results explicitly. Stop after a batch and resume as needed.
Large ranges can take many requests and consume OpenAI credits.

This uses a separate `POST /api/limitless/extraction-preview` route. New tests take
`{ "startDate": "...", "endDate": "..." }`; subsequent batches take
`{ "runId": "..." }`. Interactive calls require `x-limitless-api-key` and
`x-openai-api-key`. Operators may instead use `Authorization: Bearer <CRON_SECRET>`
to test with the server's configured source/AI keys.

Unlike `draftOnly`, previews **never enter the production delivery ledger**.
They reuse production discovery/chunking/extraction against an isolated directory
under the server's temporary folder, with Todoist capabilities disabled. Candidates
cannot be picked up by normal cron runs. No Todoist credentials are used.
Preview IDs are scoped to the source account. Tests expire after 24 hours (expired
temporary folders are removed when a new test starts) and may disappear on a server
replacement. They are test results, not durable processing history.

Boundary context is included just as in production: a recording can start on the
preceding day. Inspect the displayed timestamps when judging range coverage.
An exhausted discovery scan is distinct from successful extraction; recordings
without available speech are counted separately, and failures remain visible.

## Normal catch-up

Send `{}` to POST. A completed scan's end time helps choose the next discovery
range; it is **not** a processing-completion flag. Each new rolling scan covers
at least seven days. After a longer outage, it begins at the earlier of seven
days ago and one day before the last completed rolling scan's end.

Discovery splits the range into daily windows, includes a preceding day for
recordings near boundaries, and follows every pagination cursor. Each page's
recordings are saved before its cursor advances. A failed page is retried, not
marked covered. Duplicate pages are harmless because source IDs and content
hashes identify recordings. Invalid pages and repeated cursors fail the scan.
Content requests use 20-record pages. Live comparison found that 50/100-record
pages can return metadata with empty content arrays despite speech being available
for the same recordings on smaller pages.

Each request attempts at most eight pages and ten recordings, with a 210-second
work budget plus time for an in-flight provider call. Unfinished work remains on
disk. Repeated POSTs resume pending rolling scans and unfinished backfills, and
process known pending/failed recordings regardless of their age. Large backlogs
need repeated invocations; HTTP success does not mean the entire backlog is done.

All spoken transcript content is analyzed, without a keyword gate. Production
and previews use the same two-pass pipeline:

1. `gpt-6-luna` with `medium` reasoning enumerates potential todos broadly in
   12,000-character chunks with 1,000 characters of overlap.
2. `gpt-6.1-sol` with `xhigh` reasoning reviews every distinct candidate against
   the full original transcript, including later completion or cancellation.
   It keeps only concrete, relevant, outstanding obligations attributable to the
   recording owner. Vague directions (such as "go to the room"), conversational
   filler, other people's plans, speculation, immediate actions and tasks already
   completed in the conversation are excluded. Repeated obligations keep the most
   specific supported candidate. Short useful tasks do not require a deadline.

The reviewer selects existing candidate IDs and cannot introduce or rewrite tasks.
Every candidate needs a saved keep/reject decision and reason; every kept candidate
needs a verbatim source quote. Missing decisions, invented quotes, incomplete
responses and timeouts fail closed: nothing from that transcript is delivered
until review succeeds. A transcript with no candidates needs no reviewer API call.
Raw enumeration, model IDs, review attempts, decisions and errors remain in the
per-version ledger. Finished chunks and successful reviews are reused on retry.
Previews show only reviewed tasks and cannot complete while review is unfinished.

Existing completed imports are preserved. Previously enumerated but unsent drafts
must pass the new review before delivery; excluded drafts remain as `filtered`
audit records. Delivered tasks and uncertain deliveries are never deleted or
silently retried. Use targeted reprocessing to evaluate an already-completed
transcript with the new pipeline. Empty/missing speech waits for source updates;
an explicit, valid AI `tasks: []` result completes a nonempty chunk.

Tasks are saved before delivery. Each task's `sending` state is saved before
its Todoist request, and the confirmed Todoist ID is saved immediately after.
Explicit rejections (including rate limiting) stay retryable. A timeout, 5xx,
malformed success, or interrupted `sending` task becomes `needs_review`.
These are never blindly sent again. Successful tasks are not recreated on retry.
Task descriptions include the recording ID, timestamp and `[DeepLog:<task-id>]`
marker so uncertain deliveries can be found in Todoist, including completed tasks.

## Historical backfills

```json
{
  "startDate":"2026-10-01T00:00:00.000Z",
  "endDate":"2026-11-01T00:00:00.000Z",
  "draftOnly":true
}
```

A fixed range is resumable. Repeat the same body until its scan is completed and
its recordings have been processed. `endDate` is optional; the first request
captures a fixed end and subsequent requests with the same start resume it.
Backfills include preceding-day context, so discovery can include recordings
starting before the requested start. Backfills are additive and do not reset
existing delivery history. Pending work from other ranges can also be processed.
After migration review, use `{}` to resume automatic delivery.

Seven-day rescanning is a bounded recovery policy: recordings arriving late or
changing outside that window need an explicit backfill/reconciliation scan.
Only history still exposed by Limitless can be recovered. A successful AI call
cannot guarantee that every intended task was recognized.

## Ledger and status

- `record-<hashed-source-id>.json`: recording ID, current version, all retained
  transcript versions, chunk results/attempts, task candidates/delivery IDs,
  status, and timestamped events. Source IDs are hashed for filenames.
- `scan-<uuid>.json`: fixed discovery range, window position, cursor, page count,
  and completion time. Completed scans remain available for auditing.
- `run.lock/owner.json`: exclusive run lock with PID and start time.

Recordings are `pending`, `completed`, `failed`, `needs_review`, or
`awaiting_transcript`. A recording completes only when every current chunk has
an explicit result, the quality review is complete, and all approved current
candidates are confirmed delivered (or none survive review). Legacy completed
records without a review remain readable and are not automatically replayed.
Unresolved uncertain deliveries also prevent completion.

Unchanged completed recordings are skipped. Changed spoken content creates a
new retained version. Exact normalized task text reuses existing delivery IDs;
unmatched tasks after an earlier delivered version are held for review to avoid
blindly creating duplicates with changed wording. No semantic deduplication
across different recordings is claimed. Previous tasks are never deleted.

To correct a suspected extraction mistake, POST
`{"reprocessRecordingId":"source-id"}`. This queues a fresh extraction attempt
from the stored transcript and retains the previous results. A subsequent normal
or draft run processes it. Previously confirmed deliveries are retained; new
wording after an earlier delivery is held for review. For source corrections,
rescan the relevant date range to fetch the updated transcript first.

GET returns counts, scans and unresolved task candidates. Use
`?recordingId=<URL-encoded-source-id>` to inspect a recording's full history,
including transcript text. These endpoints are authenticated and uncached.
POST returns 503 with `success:false` for discovery errors, failed recordings,
or review-required deliveries; normal unfinished batches return 200 with
pending counts. Lock contention returns 409. Corrupt/unreadable state fails
closed instead of replacing it with a fresh checkpoint.

## Resolving deliveries

Inspect the recording and check Todoist for the exact DeepLog marker, including
completed tasks. Once found, record its ID (also supports linking a pending draft
to a known legacy task):

```json
{"resolveDelivery":{"recordingId":"source-id","taskId":"candidate-uuid","todoistId":"confirmed-todoist-id"}}
```

If you have verified that no task was created (or approved a genuinely new task
from a changed transcript), explicitly authorize a retry:

```json
{"resolveDelivery":{"recordingId":"source-id","taskId":"candidate-uuid","confirmNotCreated":true}}
```

Resolution is an audited operator assertion; it does not independently verify
Todoist. Retry confirmation applies only to review-required tasks. A subsequent
normal run resumes processing. Do not retry just because a task is absent from
the active task list: it may already be completed or deleted.

## Crash and storage recovery

Writes use same-directory temporary files, fsync, rename, and directory fsync.
A single atomic directory lock prevents concurrent processing; locks do not
expire while a slow process could still be delivering tasks.

After a hard crash, the lock deliberately remains. Stop/disable extraction and
confirm **no old extractor is running**, inspect `run.lock/owner.json`, then
remove only the `run.lock` directory inside the configured ledger directory.
Restart extraction. Interrupted deliveries will require review. Never remove a
lock solely because its timestamp is old, and never delete recording files.
On disk-full/permissions errors, repair storage first, then resume.

Back up the whole ledger together. Restoring an old backup can lose delivery
acknowledgements; reconcile Todoist before delivering again. Transcript text is
stored on the volume (files mode 0600); restrict volume/backup access accordingly.

## Synthetic test

```json
{"testTranscript":"Remind me to send Alex the contract tomorrow."}
```

Calls extraction without fetching recordings, writing the ledger, or creating
Todoist tasks. `createTestTasks:true` is no longer supported.

## Verification

```sh
npx tsx --test src/lib/task-extraction/*.test.ts src/app/api/cron/extract-tasks/route.test.ts
npx tsx --test src/app/api/limitless/extraction-preview/route.test.ts
node tests/extraction-preview.mjs # local server at localhost:3020; mocked APIs
npx tsc --noEmit --incremental false
```
