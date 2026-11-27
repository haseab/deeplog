import test from "node:test";
import assert from "node:assert/strict";
import { recallEntrySearch, rememberEntrySearch, RECENT_SEARCH_TTL } from "./recent-entry-search";
const search = { text: "Planning", match: "exact" as const, from: "2026-01-01", to: "2026-01-31", projects: ["2"], tags: ["3"] };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); }, values };
}
test("restores the complete submitted criteria for five minutes without extending expiry on read", () => {
  const store = storage();
  rememberEntrySearch(store, "account-a", search, 1000);
  assert.deepEqual(recallEntrySearch(store, "account-a", 1000 + RECENT_SEARCH_TTL - 1), search);
  assert.equal(recallEntrySearch(store, "account-a", 1000 + RECENT_SEARCH_TTL), null);
  assert.equal(store.values.size, 0);
});
test("a new submission restarts the window and account scopes never share criteria", () => {
  const store = storage();
  rememberEntrySearch(store, "account-a", search, 1000);
  assert.equal(recallEntrySearch(store, "account-b", 2000), null);
  rememberEntrySearch(store, "account-a", { ...search, text: "Review" }, 2000);
  assert.equal(recallEntrySearch(store, "account-a", 1000 + RECENT_SEARCH_TTL)?.text, "Review");
});
test("unavailable storage and malformed saved criteria fall back to a fresh search", () => {
  const store = storage();
  store.setItem("deeplog:recent-search:account-a", JSON.stringify({ expiresAt: 2000, search: { ...search, tags: null } }));
  assert.equal(recallEntrySearch(store, "account-a", 1000), null);
  store.setItem("deeplog:recent-search:account-a", JSON.stringify({ expiresAt: 2000, search: { ...search, from: "2026-02-30" } }));
  assert.equal(recallEntrySearch(store, "account-a", 1000), null);
  const unavailable = { getItem: () => { throw new Error("Disabled"); }, setItem: () => { throw new Error("Disabled"); }, removeItem: () => {} };
  assert.doesNotThrow(() => rememberEntrySearch(unavailable, "account-a", search));
  assert.equal(recallEntrySearch(unavailable, "account-a"), null);
});

test("recalls advanced operator and AND/OR rules and rejects unsupported stored rules", () => {
  const store = storage();
  const advanced = { ...search, match: "not-contains" as const, combine: "or" as const, conditions: [{ match: "empty" as const, text: "" }, { match: "starts-with" as const, text: "Planning" }] };
  rememberEntrySearch(store, "account-a", advanced, 1000);
  assert.deepEqual(recallEntrySearch(store, "account-a", 2000), advanced);
  store.setItem("deeplog:recent-search:account-a", JSON.stringify({ expiresAt: 3000, search: { ...advanced, conditions: [{ match: "unknown", text: "Planning" }] } }));
  assert.equal(recallEntrySearch(store, "account-a", 2000), null);
});
