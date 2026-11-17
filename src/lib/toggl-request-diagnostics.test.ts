import test from "node:test";
import assert from "node:assert/strict";
import { createTogglFetch, TogglRequestQueue } from "./toggl-fetch";
import { togglEndpoint, type TogglRequestDiagnostic } from "./toggl-request-diagnostics";
import { projectSelection } from "./project-selection";

test("diagnostics distinguish actual egress, cache reuse, network and queue time without private data", async t => {
  const events: TogglRequestDiagnostic[] = [];
  const f = createTogglFetch(new TogglRequestQueue(20), undefined, e => events.push(e));
  t.mock.method(globalThis, "fetch", async () => { await new Promise(r => setTimeout(r, 5)); return Response.json({ description: "private body" }); });
  const headers = { Authorization: "Bearer private credential" };
  const url = "https://track.toggl.com/api/v9/me";
  await Promise.all([f(url, { headers }), f(url, { headers })]);
  await f(url, { headers });
  await Promise.all([f(`${url}/time_entries/123`, { headers }), f(`${url}/time_entries/456`, { headers })]);
  assert.deepEqual(events.slice(0, 3).map(e => e.cache).sort(), ["hit", "miss", "shared"]);
  assert.equal(events.filter(e => e.upstream).length, 3);
  assert.ok(events.filter(e => e.upstream).every(e => e.networkMs >= 4));
  assert.ok(events.some(e => e.queueWaitMs >= 10));
  assert.ok(events.every(e => e.durationMs >= 0 && e.status === 200));
  assert.ok(!JSON.stringify(events).includes("private"));
  assert.ok(events.every(e => !e.endpoint.includes("123")));
  assert.equal(togglEndpoint(new URL("https://track.toggl.com/unrecognized/private-path?secret=x")), "other");
});

test("logging failures do not fail requests and error logs never include exception details", async t => {
  const f = createTogglFetch(new TogglRequestQueue(0), undefined, () => { throw Error("logger offline"); });
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  assert.equal((await f("https://track.toggl.com/api/v9/me")).status, 200);
  const events: TogglRequestDiagnostic[] = [];
  const failing = createTogglFetch(new TogglRequestQueue(0), undefined, e => events.push(e));
  t.mock.method(globalThis, "fetch", async () => { throw Error("private credentials"); });
  await assert.rejects(failing("https://track.toggl.com/api/v9/me"));
  assert.equal(events[0].outcome, "failed");
  assert.ok(!JSON.stringify(events).includes("private"));
});

test("project selections send known IDs and preserve no-project and legacy pinned names", () => {
  assert.deepEqual(projectSelection("Work", [{ name: "Work", id: 7 }]), { project_id: 7 });
  assert.deepEqual(projectSelection("No Project", []), { project_id: null });
  assert.deepEqual(projectSelection("", []), { project_id: null });
  assert.deepEqual(projectSelection("Older pin", []), { project_name: "Older pin" });
});


test("upstream completion remains observable after the initiating cache caller cancels", async t => {
  const upstream: unknown[] = [];
  t.mock.method(console, "info", (prefix: unknown, value: unknown) => { if (prefix === "[toggl-upstream]") upstream.push(JSON.parse(String(value))); });
  let resolve!: (r: Response) => void;
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(r => { resolve = r; }));
  const f = createTogglFetch(new TogglRequestQueue(0), undefined, () => {});
  const controller = new AbortController();
  const first = f("https://track.toggl.com/api/v9/me", { signal: controller.signal });
  const shared = f("https://track.toggl.com/api/v9/me");
  await new Promise(r => setTimeout(r, 0));
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  resolve(Response.json({ id: 1 }));
  await shared;
  assert.equal(upstream.length, 1);
  assert.equal((upstream[0] as { status: number }).status, 200);
});


test("log summary counts actual egress separately from cache callers and normalizes output", async () => {
  const { spawnSync } = await import("node:child_process");
  const lines = [
    '[toggl-request] {"method":"GET","endpoint":"/api/v9/me","cache":"miss"}',
    '[toggl-request] {"method":"GET","endpoint":"/api/v9/me","cache":"shared"}',
    '[toggl-request] {"method":"GET","endpoint":"/api/v9/me","cache":"hit"}',
    '[toggl-upstream] {"method":"GET","endpoint":"/api/v9/me","queueWaitMs":12,"networkMs":5,"status":200,"outcome":"completed"}',
    JSON.stringify({ msg: '[toggl-upstream] {"method":"PUT","endpoint":"/api/v9/workspaces/:id/time_entries/:id","queueWaitMs":3,"networkMs":7,"status":429,"outcome":"completed"}' }),
    '[toggl-request] {"method":"private secret","endpoint":"/private secret","cache":"hit"}',
  ].join("\n");
  const result = spawnSync(process.execPath, ["scripts/summarize-toggl-requests.mjs"], { input: lines, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.upstreamCalls, 2);
  const me = summary.endpoints.find((e: { endpoint: string }) => e.endpoint === "GET /api/v9/me");
  assert.equal(me.requests, 3);
  assert.equal(me.cacheHits, 1);
  assert.equal(me.sharedReads, 1);
  assert.equal(me.p95QueueWaitMs, 12);
  assert.ok(!result.stdout.includes("private secret"));
});
