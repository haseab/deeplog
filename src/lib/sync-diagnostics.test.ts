import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { makeSyncDiagnostic, recordSyncDiagnostic, readSyncDiagnostics, SYNC_LOG_LIMIT } from "./sync-diagnostics";
import { changeDraft } from "./description-draft-store";
import { EntryMutations } from "./entry-mutations";

before(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: () => "test-tab" } });
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
});
after(() => { Reflect.deleteProperty(globalThis, "window"); Reflect.deleteProperty(globalThis, "sessionStorage"); Reflect.deleteProperty(globalThis, "indexedDB"); });

test("diagnostics fingerprint content without serializing plaintext or ciphertext", async () => {
  const secret = "private description that must never be logged";
  const encrypted = "abcdefghijklmnop:YWJjZA==:YWJjZA==";
  const event = await makeSyncDiagnostic({ event: "test", texts: { base: secret, local: secret, encrypted, absent: undefined } });
  const json = JSON.stringify(event);
  assert.ok(!json.includes(secret)); assert.ok(!json.includes(encrypted));
  assert.equal(event.texts.base?.hash, event.texts.local?.hash);
  assert.equal(event.texts.base?.hash.length, 64);
  assert.equal(event.texts.encrypted?.encrypted, true);
  assert.equal(event.texts.absent, null);
});

test("logs remain in IndexedDB, are scoped by account and entry, and keep invocation order", async () => {
  recordSyncDiagnostic({ event: "first", account: "trace-account", entryId: 1, texts: { local: "first" } });
  recordSyncDiagnostic({ event: "second", account: "trace-account", entryId: 1 });
  recordSyncDiagnostic({ event: "other-entry", account: "trace-account", entryId: 2 });
  recordSyncDiagnostic({ event: "other-account", account: "unrelated-account", entryId: 1 });
  const report = await readSyncDiagnostics("trace-account", 1);
  assert.deepEqual(report.events.map(e => e.event), ["first", "second"]);
  assert.ok(report.events[0].sequence < report.events[1].sequence);
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("deeplog-sync-diagnostics", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  const rows = await new Promise<unknown[]>((resolve, reject) => {
    const r = connection.transaction("events").objectStore("events").getAll();
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  connection.close();
  assert.equal(rows.length, 4, "Events are durable records available to a new connection after reload");
});

test("retention removes expired events even if inserted out of time order, and bounds the ring", async () => {
  const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("deeplog-sync-diagnostics", 1); r.onsuccess = () => resolve(r.result); });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("events", "readwrite"); const events = tx.objectStore("events");
    for (let i = 0; i < SYNC_LOG_LIMIT + 5; i++) events.add({ at: Date.now(), account: "retention", event: "seed", sequence: i });
    events.add({ at: Date.now() - 8 * 86400000, account: "retention", event: "expired" });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  recordSyncDiagnostic({ event: "last", account: "retention", entryId: 3 });
  const report = await readSyncDiagnostics("retention");
  assert.equal(report.events.length, SYNC_LOG_LIMIT);
  assert.ok(!report.events.some(e => e.event === "expired"));
  assert.ok(report.events.some(e => e.event === "last")); db.close();
});

test("cross-tab conflicts record distinct ownership and retain safe before/after evidence", async () => {
  const key = "store-test:2:3";
  await changeDraft(key, () => ({ key, account: "store-test", entryId: 3, base: "server baseline", local: "tab one text", owner: "tab-one", status: "local", revision: 1, updatedAt: 1 }));
  await changeDraft(key, old => ({ ...old!, local: "tab two text", owner: "tab-two", revision: 2 }));
  const report = await readSyncDiagnostics("store-test", 3);
  const conflict = report.events.find(e => e.event === "draft.cross-tab-conflict")!;
  assert.ok(conflict); assert.equal(conflict.fields?.beforeOwner, "tab-one");
  assert.equal(conflict.fields?.afterOwner, "tab-two"); assert.equal(conflict.fields?.afterStatus, "conflict");
  assert.notEqual(conflict.texts.beforeLocal?.hash, conflict.texts.afterLocal?.hash);
  assert.ok(!JSON.stringify(report).includes("tab two text"));
});

test("hashing failures cannot stop mutation execution", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => { throw new Error("unavailable"); } } });
  try {
    recordSyncDiagnostic({ event: "cannot-log", account: "store-test" });
    assert.equal(await new EntryMutations().run([3], async () => "saved"), "saved");
  } finally { Object.defineProperty(globalThis, "crypto", original); }
  const report = await readSyncDiagnostics("store-test");
  assert.ok(report.dropped > 0);
});

test("diagnostic storage failures do not stop draft persistence or entry mutations", async () => {
  await readSyncDiagnostics("store-test");
  const original = IDBDatabase.prototype.transaction;
  Object.defineProperty(IDBDatabase.prototype, "transaction", { configurable: true, value: function(this: IDBDatabase, ...args: unknown[]) {
    if (this.name === "deeplog-sync-diagnostics") throw new DOMException("Full", "QuotaExceededError");
    return Reflect.apply(original, this, args);
  } });
  try {
    const saved = await changeDraft("failure-test:1:5", () => ({ key: "failure-test:1:5", account: "failure-test", entryId: 5, base: "base", local: "saved despite diagnostic failure", status: "local", revision: 1, updatedAt: 1 }));
    assert.equal(saved?.local, "saved despite diagnostic failure");
    assert.equal(await new EntryMutations().run([5], async () => "uploaded"), "uploaded");
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally { Object.defineProperty(IDBDatabase.prototype, "transaction", { configurable: true, writable: true, value: original }); }
  assert.equal((await readSyncDiagnostics("failure-test")).storageFailed, true);
});
