import test from "node:test";
import assert from "node:assert/strict";
import { matchesEntrySearch, replaceEntryText, searchParamsForEntries, compareEntryOrder } from "./entry-search";

test("search combines a literal phrase, any selected project, and all selected tags", () => {
  const entry = { description: "Weekly planning [draft]", project_id: 2, tag_ids: [3, 4] };
  const filters = { text: "PLANNING [draft]", match: "phrase" as const, projects: ["1", "2"], tags: ["3", "4"] };
  assert.equal(matchesEntrySearch(entry, filters), true);
  assert.equal(matchesEntrySearch(entry, { ...filters, tags: ["3", "5"] }), false);
  assert.equal(matchesEntrySearch(entry, { ...filters, projects: ["1"] }), false);
  assert.equal(matchesEntrySearch(entry, { ...filters, match: "exact" }), false);
  assert.equal(matchesEntrySearch(entry, { ...filters, match: "exact", text: "weekly planning [draft]" }), true);
  assert.equal(matchesEntrySearch({ ...entry, project_id: null }, { ...filters, projects: ["none"] }), true);
});

test("date-only searches omit empty text and encode punctuation safely", () => {
  const search = { text: "", match: "phrase" as const, projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" };
  assert.equal(searchParamsForEntries(search).has("q"), false);
  assert.equal(searchParamsForEntries({ ...search, text: "A & B + C" }, 2).get("q"), "A & B + C");
  assert.equal(searchParamsForEntries(search, 2).get("page"), "2");
});

test("find and replace treats punctuation and replacement tokens literally", () => {
  assert.equal(replaceEntryText("a.* a.* A.*", "a.*", "$&"), "$& $& A.*");
  assert.equal(replaceEntryText("hello hello", "hello", ""), " ");
  assert.equal(replaceEntryText("unchanged", "", "x"), "unchanged");
});

test("timeline context ordering is deterministic when timestamps tie", () => {
  const entries = [{ id: 2, start: "2026-01-01T10:00:00Z" }, { id: 1, start: "2026-01-02T10:00:00Z" }, { id: 3, start: "2026-01-01T10:00:00Z" }];
  assert.deepEqual(entries.sort(compareEntryOrder).map(entry => entry.id), [1, 3, 2]);
});

test("advanced search serializes operators and boolean criteria without stale text for empty rules", () => {
  const search = { text: "Previous text", match: "empty" as const, combine: "or" as const, projects: [], tags: [], from: "2026-01-01", to: "2026-01-31", conditions: [{ match: "not-contains" as const, text: "  Draft  " }, { match: "not-empty" as const, text: "Stale text" }] };
  const params = searchParamsForEntries(search);
  assert.equal(params.has("q"), false);
  assert.equal(params.get("match"), "empty");
  assert.equal(params.get("combine"), "or");
  assert.deepEqual(JSON.parse(params.get("conditions")!), [{ match: "not-contains", text: "Draft" }, { match: "not-empty", text: "" }]);
  const entry = { description: "Planning", project_id: 2, tag_ids: [3] };
  assert.equal(matchesEntrySearch(entry, search), true);
  assert.equal(matchesEntrySearch(entry, { ...search, combine: "and" }), false);
});
