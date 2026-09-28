import test from "node:test";
import assert from "node:assert/strict";
import { compareDescription, acknowledgeDraft, type DescriptionDraft } from "./description-sync";

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
