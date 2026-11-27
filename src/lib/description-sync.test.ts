import test from "node:test";
import assert from "node:assert/strict";
import { needsDescriptionUpload, compareDescription, acknowledgeDraft, refreshDescriptionConflict, resolveEditedDescription, type DescriptionDraft } from "./description-sync";

test("three-way comparison never overwrites a changed remote description", () => {
  assert.equal(compareDescription("original", "mine", "original"), "upload");
  assert.equal(compareDescription("original", "mine", "newer phone edit"), "conflict");
  assert.equal(compareDescription("original", "mine", "mine"), "synced");
  assert.equal(compareDescription("original", "", "original"), "upload");
  assert.equal(compareDescription("original", "mine", ""), "conflict");
});
const draft: DescriptionDraft = { key: "1:2:3", account: "1:2", entryId: 3, base: "original", local: "first edit", revision: 1, updatedAt: 0, status: "local" };
test("an older upload acknowledgement cannot erase newer typing", () => {
  const newer = { ...draft, local: "second edit", revision: 2 };
  const result = acknowledgeDraft(newer, draft, "first edit");
  assert.equal(result.local, "second edit");
  assert.equal(result.base, "first edit");
  assert.equal(result.status, "local");
  assert.equal(compareDescription(result.base, result.local, "first edit"), "upload");
});
test("only the uploaded revision becomes synced", () => {
  assert.equal(acknowledgeDraft(draft, draft, draft.local).status, "synced");
});

test("a successful upload clears a conflict raised while the matching text was in flight", () => {
  const concurrent: DescriptionDraft = { ...draft, status: "conflict", remote: "outdated comparison", deleted: true, error: "old error" };
  const result = acknowledgeDraft(concurrent, draft, draft.local);
  assert.equal(result.status, "synced");
  assert.equal(result.remote, undefined);
  assert.equal(result.deleted, false);
  assert.equal(result.error, undefined);
});

test("a successful older upload preserves a competing draft and its actual remote comparison", () => {
  const concurrent: DescriptionDraft = { ...draft, local: "other tab's edit", revision: 2, status: "conflict" };
  const result = acknowledgeDraft(concurrent, draft, draft.local);
  assert.equal(result.status, "conflict");
  assert.equal(result.local, concurrent.local);
  assert.equal(result.remote, draft.local);
});

test("the same revision number cannot acknowledge different text from another tab", () => {
  const current = { ...draft, local: "other tab with the same revision" };
  assert.equal(acknowledgeDraft(current, draft, draft.local).status, "local");
});

test("an acknowledged value shared by newer revisions does not need another upload", () => {
  const newer = { ...draft, revision: 3 };
  assert.equal(acknowledgeDraft(newer, draft, draft.local).status, "synced");
});

test("an acknowledgement cannot be applied to another entry or account", () => {
  const other = { ...draft, key: "9:2:3" };
  assert.equal(acknowledgeDraft(other, draft, draft.local), other);
});

test("a stale deletion or comparison clears when Toggl already contains the local draft", () => {
  const shown: DescriptionDraft = { ...draft, status: "conflict", deleted: true, deletionConfirmed: true, remote: "old remote" };
  const result = refreshDescriptionConflict(shown, shown, { deleted: false, remote: shown.local });
  assert.equal(result.status, "synced");
  assert.equal(result.local, shown.local);
  assert.equal(result.base, shown.local);
  assert.equal(result.deleted, false);
  assert.equal(result.deletionConfirmed, false);
});

test("rechecking an unavailable entry restores a comparison without choosing a winner", () => {
  const shown: DescriptionDraft = { ...draft, status: "conflict", deleted: true };
  const result = refreshDescriptionConflict(shown, shown, { deleted: false, remote: "current Toggl text" });
  assert.equal(result.deleted, false);
  assert.equal(result.status, "conflict");
  assert.equal(result.remote, "current Toggl text");
  assert.equal(result.local, draft.local);
  assert.equal(result.base, draft.base);
});

test("a delayed review check cannot overwrite a newer edit or resolution", () => {
  const shown: DescriptionDraft = { ...draft, status: "conflict", deleted: true };
  for (const current of [{ ...shown, local: "newer typing", revision: 2 }, { ...shown, status: "synced" as const }]) {
    assert.equal(refreshDescriptionConflict(current, shown, { deleted: false, remote: shown.local }), current);
  }
});

test("not found does not retain old evidence of confirmed deletion", () => {
  const shown: DescriptionDraft = { ...draft, status: "conflict", deleted: true, deletionConfirmed: true };
  const result = refreshDescriptionConflict(shown, shown, { deleted: true });
  assert.equal(result.deletionConfirmed, false);
  assert.equal(result.local, shown.local);
  assert.equal(result.status, "conflict");
});

test("editing a known conflict resumes sync against the conflicting remote version", () => {
  for (const remote of ["phone edit", ""]) {
    const edited: DescriptionDraft = { ...draft, local: "edited after conflict", revision: 2, status: "conflict", remote, sent: "old upload" };
    const result = resolveEditedDescription(edited);
    assert.equal(result.status, "local");
    assert.equal(result.local, edited.local);
    assert.equal(result.revision, 2);
    assert.equal(result.base, remote);
    assert.equal(result.remote, undefined);
    assert.equal(result.sent, undefined);
    assert.equal(compareDescription(result.base, result.local, remote), "upload");
    assert.equal(compareDescription(result.base, result.local, "another phone edit"), "conflict");
  }
});

test("editing cannot resolve deleted entries or conflicts without a known remote", () => {
  for (const conflict of [
    { ...draft, status: "conflict" as const },
    { ...draft, status: "conflict" as const, remote: "phone edit", deleted: true },
  ]) assert.equal(resolveEditedDescription(conflict), conflict);
  assert.equal(resolveEditedDescription(draft), draft);
});

test("background sync skips all conflicts, including missing entries, without altering drafts", () => {
  const missing: DescriptionDraft = { ...draft, status: "conflict", deleted: true };
  const changed: DescriptionDraft = { ...draft, status: "conflict", remote: "phone edit" };
  assert.equal(needsDescriptionUpload(missing), false);
  assert.equal(needsDescriptionUpload(changed), false);
  assert.equal(missing.local, "first edit");
  assert.equal(changed.remote, "phone edit");
  assert.equal(needsDescriptionUpload({ ...draft, status: "synced" }), false);
});

test("new edits still upload and failed uploads respect their retry time", () => {
  assert.equal(needsDescriptionUpload(draft, 100), true);
  assert.equal(needsDescriptionUpload({ ...draft, status: "error", retryAt: 101 }, 100), false);
  assert.equal(needsDescriptionUpload({ ...draft, status: "error", retryAt: 100 }, 100), true);
});


test("repeated lost responses retain earlier upload evidence until acknowledged", async () => {
  const { prepareDescriptionUpload, acknowledgeDraft } = await import("./description-sync");
  const initial = { key: "1:2:3", account: "1:2", entryId: 3, base: "base", local: "first", revision: 1, updatedAt: 1, status: "local" as const };
  const first = prepareDescriptionUpload(initial);
  const second = prepareDescriptionUpload({ ...first, local: "second", revision: 2 });
  const third = prepareDescriptionUpload({ ...second, local: "third", revision: 3 });
  assert.deepEqual(third.uncertainUploads, ["first", "second", "third"]);
  const acknowledged = acknowledgeDraft(third, third, "third");
  assert.equal(acknowledged.status, "synced");
  assert.equal(acknowledged.uncertainUploads, undefined);
  let bounded = third;
  for (let i = 0; i < 30; i++) bounded = prepareDescriptionUpload({ ...bounded, local: String(i) });
  assert.equal(bounded.uncertainUploads?.length, 16);
});

test("matching-entry suggestions stay separate from the missing draft and clear on fresh evidence", () => {
  const shown: DescriptionDraft = { ...draft, status: "conflict", deleted: true };
  const matchingEntry = { entryId: 4, start: "2026-01-15T10:00:00Z" };
  const suggested = refreshDescriptionConflict(shown, shown, { deleted: true, matchingEntry });
  assert.equal(suggested.entryId, shown.entryId);
  assert.equal(suggested.status, "conflict");
  assert.equal(suggested.local, shown.local);
  assert.deepEqual(suggested.matchingEntry, matchingEntry);
  assert.equal(refreshDescriptionConflict(suggested, suggested, { deleted: true }).matchingEntry, undefined);
  assert.equal(refreshDescriptionConflict(suggested, suggested, { deleted: false, remote: shown.local }).matchingEntry, undefined);
});
