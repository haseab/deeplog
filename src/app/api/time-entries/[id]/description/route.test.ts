import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";

async function run(body: Record<string, unknown>, entry: Record<string, unknown> | null = { description: "base", wid: 2, uid: 1 }) {
  const original = globalThis.fetch;
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
      method: "POST", headers: { "x-toggl-session-token": "test" }, body: JSON.stringify({ account: "1:2", base: "base", local: "mine", ...body }),
    }), { params: Promise.resolve({ id: "3" }) });
    return { status: result.status, body: await result.json(), writes };
  } finally { globalThis.fetch = original; }
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
test("empty descriptions can be saved", async () => {
  const result = await run({ local: "" });
  assert.deepEqual(result.writes, [{ description: "" }]);
});
