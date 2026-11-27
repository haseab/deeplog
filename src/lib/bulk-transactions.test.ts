import test from "node:test";
import assert from "node:assert/strict";
import { BulkTransactions, BulkWriteError } from "./bulk-transactions";
import type { TimeEntry } from "../types";
const entry = (id: number): TimeEntry => ({ id, description: "Planning", project_id: 2, project_name: "Example", project_color: "#123456", tags: ["Review"], tag_ids: [3], start: "2026-01-01T10:00:00Z", stop: "2026-01-01T11:00:00Z", duration: 3600 });

test("staging never writes, keeps deleted results visible, and supports per-entry, per-batch and global undo", async () => {
  let writes = 0;
  const store = new BulkTransactions({ write: async () => { writes++; return { state: "applied" }; }, applied: () => {} });
  const raw = [entry(1), entry(2), entry(3)];
  const a = store.stage("account", "Edit", raw.slice(0, 2).map(before => ({ before, patch: { description: "Updated" } })));
  const b = store.stage("account", "Delete", [{ before: raw[2], delete: true }]);
  assert.equal(writes, 0);
  assert.equal(store.overlay(raw).length, 3);
  assert.equal(store.overlay(raw)[2].bulkPendingDelete, true);
  assert.equal(store.undo(a.id, 1), true);
  assert.equal(store.overlay(raw)[0].description, "Planning");
  assert.equal(store.overlay(raw)[1].description, "Updated");
  store.undo(b.id); store.undoAll();
  await store.commit(a.id); await store.commit(b.id);
  assert.equal(writes, 0);
  assert.deepEqual(store.overlay(raw), raw);
});

test("partial failures retain results, stop remaining writes, and only retry known unapplied rows", async () => {
  let raw = [entry(1), entry(2), entry(3)];
  const calls: number[] = [];
  const store = new BulkTransactions({
    write: async (_batch, row) => { calls.push(row.id); if (row.id === 2) throw new BulkWriteError("Disconnected", true, true); return { state: "applied" }; },
    applied: row => { raw = raw.map(item => item.id === row.id ? { ...item, ...row.patch } : item); },
  });
  const batch = store.stage("account", "Edit", raw.map(before => ({ before, patch: { description: "Updated" } })));
  await store.commit(batch.id);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(store.overlay(raw).length, 3);
  assert.deepEqual(store.getSnapshot()[0].rows.map(row => row.status), ["saved", "failed", "failed"]);
  assert.equal(store.canUndo(batch.id, 2), false);
  await store.retry(batch.id);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(store.getSnapshot()[0].rows[1].status, "failed");
});

test("read-only checking resolves lost acknowledgements without replay and prevents concurrent checks", async () => {
  const calls: boolean[] = [];
  let finish!: (result: { state: "applied" }) => void;
  const store = new BulkTransactions({
    write: async (_batch, _row, review) => { calls.push(review); if (!review) throw new BulkWriteError("Unknown", true, true); return new Promise(resolve => { finish = resolve; }); }, applied: () => {},
  });
  const batch = store.stage("account", "Edit", [{ before: entry(1), patch: { description: "Updated" } }]);
  await store.commit(batch.id);
  const checking = store.check(batch.id, 1); await store.check(batch.id, 1);
  assert.deepEqual(calls, [false, true]);
  finish({ state: "applied" }); await checking;
  assert.equal(store.getSnapshot()[0].rows[0].status, "saved");
});

test("restoration changes only the original fields and refuses to overwrite subsequent edits", async () => {
  let raw = [entry(1), entry(2)];
  const store = new BulkTransactions({ write: async () => ({ state: "applied" }), applied: row => { raw = raw.map(item => item.id === row.id ? { ...item, ...row.patch } : item); } });
  const batch = store.stage("account", "Edit", raw.map(before => ({ before, patch: { description: "Updated" } })));
  await store.commit(batch.id);
  raw[0] = { ...raw[0], duration: 7200, tags: ["New tag"], tag_ids: [8] };
  const plan = store.restoration(batch.id, raw, 1);
  assert.equal(plan.changes.length, 1);
  assert.deepEqual(plan.changes[0].patch, { description: "Planning" });
  const inverse = store.stage(plan.account, "Restore", plan.changes);
  assert.equal(store.overlay(raw)[0].duration, 7200);
  assert.deepEqual(store.overlay(raw)[0].tags, ["New tag"]);
  store.undo(inverse.id);
  raw[1].description = "Later edit";
  assert.throws(() => store.restoration(batch.id, raw), /changed after/);
});

test("conflicts preserve remote changes when the optimistic preview is undone", async () => {
  let raw = [entry(1)];
  const store = new BulkTransactions({ write: async () => { throw new BulkWriteError("Conflict", false, false, { description: "Remote edit" }, true); }, applied: (row, current) => { raw = raw.map(item => item.id === row.id ? { ...item, ...current } : item); } });
  const batch = store.stage("account", "Edit", [{ before: raw[0], patch: { description: "Preview" } }]);
  await store.commit(batch.id);
  assert.equal(store.overlay(raw)[0].description, "Preview");
  store.undo(batch.id, 1);
  assert.equal(store.overlay(raw)[0].description, "Remote edit");
});

test("disposal cancels staged writes and overlapping batches are rejected", async () => {
  let writes = 0;
  const store = new BulkTransactions({ write: async () => { writes++; return { state: "applied" }; }, applied: () => {} });
  const changes = [{ before: entry(1), patch: { description: "Updated" } }];
  const batch = store.stage("account", "Edit", changes);
  assert.throws(() => store.stage("account", "Overlap", changes), /pending bulk edits/);
  store.dispose(); await store.commit(batch.id);
  assert.equal(writes, 0);
});
