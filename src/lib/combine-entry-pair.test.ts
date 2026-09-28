import test from "node:test";
import assert from "node:assert/strict";
import { getCombineEntryPair } from "./combine-entry-pair";
const rows = [{ id: 3, description: "Newer" }, { id: 2, description: "Selected" }, { id: 1, description: "Older" }];
test("C folds the selected row into the older neighbor", () => {
  const pair = getCombineEntryPair(rows, 2)!;
  assert.equal(pair.selected.id, 2);
  assert.equal(pair.destination.id, 1);
  assert.equal(pair.newer.id, 2);
  assert.equal(pair.older.id, 1);
});
test("Option+C folds the selected row into the newer neighbor", () => {
  const pair = getCombineEntryPair(rows, 2, true)!;
  assert.equal(pair.selected.id, 2);
  assert.equal(pair.destination.id, 3);
  assert.equal(pair.newer.id, 3);
  assert.equal(pair.older.id, 2);
});
test("boundaries reject only the direction without a neighbor", () => {
  assert.equal(getCombineEntryPair(rows, 3, true), null);
  assert.equal(getCombineEntryPair(rows, 1), null);
  assert.equal(getCombineEntryPair(rows, 1, true)?.destination.id, 2);
  assert.equal(getCombineEntryPair(rows, 3)?.destination.id, 2);
  assert.equal(getCombineEntryPair(rows, 99, true), null);
});
test("preview follows a temporary row after its server ID arrives", () => {
  const reconciled = [{ id: 3 }, { id: 20, tempId: -2 }, { id: 1 }];
  assert.equal(getCombineEntryPair(reconciled, -2, true)?.selected.id, 20);
  assert.equal(getCombineEntryPair(reconciled, -2, true)?.destination.id, 3);
});
