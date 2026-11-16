import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";

async function run(body: Record<string, unknown>, entry: Record<string, unknown> | null = { description: "base", wid: 2, uid: 1 }) {
  const original = globalThis.fetch;
  const originalLog = console.info;
  const logs: Record<string, unknown>[] = [];
  console.info = (_prefix, json) => { logs.push(JSON.parse(String(json))); };
  const writes: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.endsWith("/me")) return Response.json({ id: 1, timezone: "UTC" });
    if (path.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }]);
    if (init?.method === "PUT") { const payload = JSON.parse(String(init.body)); writes.push(payload); return Response.json(payload); }
    return entry ? Response.json(entry) : new Response(null, { status: 404 });
  };
  try {
    const result = await POST(new NextRequest("http://localhost/api/time-entries/3/description", {
      method: "POST", headers: { "x-toggl-session-token": "test", "x-deeplog-sync-request-id": "11111111-1111-4111-8111-111111111111", "x-deeplog-tab-id": "22222222-2222-4222-8222-222222222222", "x-deeplog-revision": "7" }, body: JSON.stringify({ account: "1:2", base: "base", local: "mine", ...body }),
    }), { params: Promise.resolve({ id: "3" }) });
    return { status: result.status, body: await result.json(), writes, logs, requestId: result.headers.get("x-deeplog-sync-request-id") };
  } finally { globalThis.fetch = original; console.info = originalLog; }
}
test("writes only description after a matching baseline", async () => {
  const result = await run({});
  assert.equal(result.status, 200);
  assert.deepEqual(result.writes, [{ description: "mine" }]);
});
test("remote edits yield 409 without writing", async () => {
  const result = await run({}, { description: "phone edit", wid: 2, uid: 1 });
  assert.equal(result.status, 409); assert.equal(result.body.description, "phone edit"); assert.deepEqual(result.writes, []);
});
test("lost response retry is a no-op when remote already matches", async () => {
  const result = await run({}, { description: "mine", wid: 2, uid: 1 });
  assert.equal(result.status, 200); assert.deepEqual(result.writes, []);
});
test("deleted entries are never recreated", async () => {
  const result = await run({}, null);
  assert.equal(result.status, 409); assert.equal(result.body.deleted, true); assert.deepEqual(result.writes, []);
});
test("account mismatch is rejected before any write", async () => {
  const result = await run({ account: "9:2" });
  assert.equal(result.status, 403); assert.deepEqual(result.writes, []);
});
test("review refreshes without writing, even when baseline matches", async () => {
  const result = await run({ reviewOnly: true });
  assert.equal(result.body.description, "base"); assert.deepEqual(result.writes, []);
});
test("review returns the original time of a soft-deleted entry without writing", async () => {
  const start = "2026-01-15T10:00:00Z";
  const result = await run({ reviewOnly: true }, { wid: 2, uid: 1, start, server_deleted_at: "2026-01-16T00:00:00Z" });
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { deleted: true, deletionConfirmed: true, start });
  assert.deepEqual(result.writes, []);
});
test("deleted entry context is still scoped to the authenticated account", async () => {
  const result = await run({ reviewOnly: true }, { wid: 9, uid: 1, start: "2026-01-15T10:00:00Z", server_deleted_at: "2026-01-16T00:00:00Z" });
  assert.equal(result.status, 403);
  assert.deepEqual(result.writes, []);
});
test("empty descriptions can be saved", async () => {
  const result = await run({ local: "" });
  assert.deepEqual(result.writes, [{ description: "" }]);
});

test("server conflict logs correlate the request, tab and revision without leaking descriptions or token", async () => {
  const result = await run({ base: "private baseline", local: "private optimistic edit" }, { description: "private server value", wid: 2, uid: 1 });
  assert.equal(result.status, 409);
  const log = result.logs[0] as { requestId: string; fields: Record<string, unknown>; texts: Record<string, { hash: string }> };
  assert.equal(log.requestId, result.requestId);
  assert.equal(log.fields.outcome, "remote-changed");
  assert.equal(log.fields.revision, 7);
  assert.equal(log.fields.tabId, "22222222-2222-4222-8222-222222222222");
  assert.equal(log.fields.remoteMatchesBase, false);
  assert.notEqual(log.texts.base.hash, log.texts.remote.hash);
  assert.ok(!JSON.stringify(result.logs).includes("private"));
  assert.ok(!JSON.stringify(result.logs).includes('"test"'));
});

test("successful write logs can identify a later remote value as this app's earlier upload", async () => {
  const uploaded = await run({});
  const later = await run({ base: "outdated baseline", local: "next edit" }, { description: "mine", wid: 2, uid: 1 });
  const first = uploaded.logs[0] as { fields: Record<string, unknown>; texts: Record<string, { hash: string }> };
  const second = later.logs[0] as typeof first;
  assert.equal(first.fields.outcome, "uploaded");
  assert.equal(second.fields.outcome, "remote-changed");
  assert.equal(first.texts.returned.hash, second.texts.remote.hash);
  assert.equal(first.texts.local.hash, second.texts.remote.hash);
});
