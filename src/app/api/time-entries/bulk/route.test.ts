import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "./route";
const current = { id: 7, user_id: 1, workspace_id: 2, description: "Planning", project_id: 4, tag_ids: [5], start: "2026-01-01T10:00:00Z", stop: "2026-01-01T11:00:00Z" };
const change = { id: 7, account: "1:2", operation: "update", expected: { description: "Planning" }, patch: { description: "Updated" } };
async function run(body: unknown, options: { entry?: Partial<typeof current>; writeStatus?: number } = {}) {
  const original = globalThis.fetch, calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/me")) return Response.json({ id: 1 });
    if (String(url).endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 3 }]);
    if (!init?.method || init.method === "GET") return Response.json({ ...current, ...options.entry });
    return new Response(null, { status: options.writeStatus ?? 204 });
  };
  try {
    const response = await POST(new NextRequest("http://localhost/api/time-entries/bulk", { method: "POST", headers: { "Content-Type": "application/json", "x-toggl-session-token": `test-${crypto.randomUUID()}` }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json(), writes: calls.filter(call => ["PUT", "DELETE"].includes(call.init?.method ?? "")), calls };
  } finally { globalThis.fetch = original; }
}

test("guarded updates write only selected fields, preserving unrelated changes", async () => {
  const result = await run(change, { entry: { project_id: 9 } });
  assert.equal(result.status, 200);
  assert.equal(result.writes.length, 1);
  assert.deepEqual(JSON.parse(String(result.writes[0].init?.body)), { description: "Updated" });
});
test("remote conflicts and account changes never write", async () => {
  const conflict = await run(change, { entry: { description: "Remote edit" } });
  assert.equal(conflict.status, 409); assert.equal(conflict.writes.length, 0);
  assert.deepEqual(conflict.body.current, { description: "Remote edit" });
  const wrongAccount = await run({ ...change, account: "other" });
  assert.equal(wrongAccount.status, 403); assert.equal(wrongAccount.writes.length, 0);
  const wrongOwner = await run(change, { entry: { user_id: 8 } });
  assert.equal(wrongOwner.status, 403); assert.equal(wrongOwner.writes.length, 0);
});
test("status checks and already applied updates do not replay writes", async () => {
  const check = await run({ ...change, reviewOnly: true });
  assert.equal(check.body.state, "unchanged"); assert.equal(check.writes.length, 0);
  const applied = await run(change, { entry: { description: "Updated" } });
  assert.equal(applied.body.state, "applied"); assert.equal(applied.writes.length, 0);
});
test("delete compares the complete captured snapshot before its single write", async () => {
  const expected = { description: current.description, project_id: current.project_id, tag_ids: current.tag_ids, start: current.start, stop: current.stop };
  const body = { ...change, operation: "delete", expected, patch: {} };
  const conflict = await run(body, { entry: { stop: "2026-01-01T12:00:00Z" } });
  assert.equal(conflict.status, 409); assert.equal(conflict.writes.length, 0);
  const result = await run(body);
  assert.equal(result.status, 200); assert.equal(result.writes[0].init?.method, "DELETE");
});
test("uncertain upstream failures are not replayed, invalid bodies are rejected", async () => {
  const failure = await run(change, { writeStatus: 503 });
  assert.equal(failure.status, 503); assert.equal(failure.body.uncertain, true); assert.equal(failure.writes.length, 1);
  for (const body of [null, [], { ...change, patch: { start: current.start } }, { ...change, expected: {} }]) {
    const invalid = await run(body);
    assert.equal(invalid.status, 400); assert.equal(invalid.writes.length, 0);
  }
});
