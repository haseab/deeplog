import test from "node:test";
import assert from "node:assert/strict";
import { recordRefreshRequest, withRefreshTiming } from "./refresh-timing-server";

test("concurrent refreshes isolate timings and never echo arbitrary request data", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (_label: string, value: string) => { logs.push(value); });
  const first = crypto.randomUUID();
  const make = (id: string, endpoint: string, networkMs: number) => withRefreshTiming(
    new Request("https://deeplog.app/api/time-entries?private=do-not-log", { headers: { "x-deeplog-refresh-id": id, authorization: "secret" } }),
    async () => {
      await Promise.resolve();
      recordRefreshRequest({ requestId: crypto.randomUUID(), endpoint, method: "GET", cache: "bypass", upstream: true, queueWaitMs: 1100, networkMs, durationMs: 1100 + networkMs, outcome: "completed", status: 200 });
      return Response.json({ description: "private description" });
    },
  );
  const [a, b] = await Promise.all([make(first, "/api/v9/me", 120), make("untrusted-id-secret", "/api/v9/workspaces", 240)]);
  assert.equal(a.headers.get("x-deeplog-refresh-id"), first);
  assert.notEqual(b.headers.get("x-deeplog-refresh-id"), "untrusted-id-secret");
  assert.match(a.headers.get("server-timing")!, /dl_queue;dur=1100.0/);
  assert.match(a.headers.get("server-timing")!, /dl_network;dur=120.0/);
  const reports = logs.map(line => JSON.parse(line));
  assert.deepEqual(Object.keys(reports.find(r => r.requestId === first).phases), ["profile"]);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(logs.join(""), /secret|private|authorization|description/);
});

test("server logging failure does not change the response", async t => {
  t.mock.method(console, "info", () => { throw Error("logger unavailable"); });
  const response = await withRefreshTiming(new Request("https://deeplog.app/api/time-entries"), async () => new Response(null, { status: 401 }));
  assert.equal(response.status, 401);
  assert.ok(response.headers.get("server-timing"));
});
