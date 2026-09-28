# Offline descriptions

Descriptions on existing Toggl entries now save to IndexedDB as you type. A small
icon at the left of the row shows local storage, upload progress, errors, or a
conflict. Hover/focus provides the label; click opens the draft. The bottom-right
controls also expose drafts outside the current table filter and recovery history.

After 1.2 seconds without typing, the app attempts to sync. Reconnection,
reauthentication, and reopening the app trigger another attempt. Transient failures
retain the draft and use bounded exponential retry delays. A retry is also available
in the draft dialog. Escape closes an existing-entry editor; edits are autosaved.

## Conflict behavior

The browser saves the original server description alongside the local draft. The
server reads Toggl immediately before an update:

- Current Toggl text equals the original: update only `description`.
- Current Toggl text already equals the draft: acknowledge without another write.
- Otherwise: return a conflict and preserve the local text.

The dialog offers **Keep mine**, **Keep Toggl**, and **Merge/edit**. It rereads Toggl
before accepting a choice, and refreshes the comparison if it changed. The next
upload checks again. Choosing Keep Toggl does not write to Toggl. Both versions are
copied to local recovery history in the same IndexedDB transaction as resolution.
Deleted entries retain a copyable draft and are not recreated.

Uploads are serialized across tabs with Web Locks. Revision numbers prevent an
older response from clearing newer typing. The outgoing value is saved before
sending so a lost response can be reconciled on the next attempt. Competing local
tab edits preserve the earlier text in recovery history and pause for review.

Drafts and recovery records are scoped to the verified Toggl user and workspace.
A hash of the session token identifies the cached account, allowing offline use
without persisting another copy of the token. The server checks account identity
on every description request. E2EE descriptions are encrypted before storage and
upload; encryption failures never fall back to plaintext persistence. Storage
failures keep text in memory, display a failure, and warn before leaving the page.

## Trying it

1. Start the app with `npm run dev`, connect to Toggl, and load an existing entry.
2. In browser DevTools, set Network to Offline and type a description. The local
   disk icon appears after the IndexedDB write succeeds.
3. Restore connectivity. The description should sync without changing its timer,
   tags, or project.
4. To exercise conflicts, edit that entry's description in another Toggl client
   while this app is offline, then reconnect. Click the amber icon to compare.
5. To test recovery across reloads, save offline, restore connectivity, and reload.

## Automated checks

With a development server on `http://127.0.0.1:3000` and Google Chrome installed:

```sh
node tests/offline-descriptions.mjs
node --import tsx --test src/lib/*.test.ts
node --import tsx 'src/app/api/time-entries/[id]/description/route.test.ts'
npx tsc --noEmit
```

The browser test uses an isolated browser profile and mocks every `/api/` request;
it does not touch a real Toggl account. It covers storage while typing, conflicts,
refresh recovery, edits during uploads, lost responses, multiple tabs, Keep Toggl,
merge, recovery history, encryption, account isolation, deletion, and mobile width.

## Boundaries

- This adds offline **description editing for existing entries**. New timer
  creation and other fields retain their existing online behavior.
- The app shell is not cached by a service worker. A fully offline cold start or
  reload of the whole application is not provided. Stored drafts survive reloads
  and can be recovered when the application loads again.
- Clearing browser site data removes drafts and recovery history. They are local
  to this browser profile, not a separate backup service.
- Web Locks, IndexedDB, and Web Crypto require a supported secure browser context
  (HTTPS or localhost). Automatic sync does not run without Web Locks.
- Toggl does not document atomic conditional writes for this endpoint. Checking
  immediately before a description-only PUT prevents stale queued overwrites,
  but cannot eliminate a simultaneous write from another Toggl client between
  that GET and PUT. History preserves resolved conflicts, not every remote edit.
