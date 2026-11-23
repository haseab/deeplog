import test from "node:test";
import assert from "node:assert/strict";
import { createToastDiagnostics } from "./toast-diagnostics";
import { parseToastDiagnostics, type ToastDiagnosticReport } from "./toast-diagnostics-data";

test("rapid typing is batched, bounded, ordered and correlated without real identifiers", () => {
  const reports: ToastDiagnosticReport[] = [];
  const timers: (() => void)[] = [];
  const record = createToastDiagnostics(report => reports.push(report), flush => { timers.push(flush); });
  record({ event: "toast.created", entryId: 987654321, toastId: "private-toast-content" });
  for (let i = 0; i < 100; i++) record({ event: "editor.report", entryId: 987654321, editor: "description", open: true, changed: false });
  assert.equal(reports.length, 0);
  assert.equal(timers.length, 1);
  timers.shift()!();
  assert.equal(reports[0].events.length, 64);
  assert.equal(reports[0].dropped, 37);
  assert.deepEqual(reports[0].events.map(e => e.sequence), Array.from({ length: 64 }, (_, i) => i + 1));
  assert.ok(reports[0].events.every(e => e.entry === 1));
  assert.equal(reports[0].events[0].toast, 1);
  assert.doesNotMatch(JSON.stringify(reports), /987654321|private-toast-content/);
  assert.ok(parseToastDiagnostics(reports[0]));
  record({ event: "toast.cancel", entryId: 987654321, toastId: "private-toast-content", reason: "cancelled" });
  timers.shift()!();
  assert.equal(reports[1].pageId, reports[0].pageId);
  assert.equal(reports[1].dropped, 0);
  assert.equal(reports[1].events[0].toast, 1);
  assert.equal(reports[1].events[0].sequence, 102);
});

test("transport failures are dropped without retries or affecting later edits", () => {
  const timers: (() => void)[] = [];
  let sends = 0;
  const record = createToastDiagnostics(() => { sends++; throw new Error("offline"); }, flush => { timers.push(flush); });
  record({ event: "description.edit", entryId: 3 });
  assert.doesNotThrow(() => timers.shift()!());
  assert.equal(timers.length, 0);
  record({ event: "description.edit", entryId: 3 });
  timers.shift()!();
  assert.equal(sends, 2);
});

test("parser rejects content, unknown events, malformed values and oversized batches", () => {
  const report = { version: 1, pageId: crypto.randomUUID(), dropped: 0, events: [{ event: "toast.created", sequence: 1, at: Date.now() }] };
  assert.ok(parseToastDiagnostics(report));
  for (const value of [
    { ...report, description: "private" },
    { ...report, events: [{ ...report.events[0], message: "private" }] },
    { ...report, events: [{ ...report.events[0], event: "private" }] },
    { ...report, events: [{ ...report.events[0], editor: "private" }] },
    { ...report, events: [{ ...report.events[0], active: "yes" }] },
    { ...report, events: [{ ...report.events[0], count: Infinity }] },
    { ...report, events: Array(65).fill(report.events[0]) },
  ]) assert.equal(parseToastDiagnostics(value), null);
});
