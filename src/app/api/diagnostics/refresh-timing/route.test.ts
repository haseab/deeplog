import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

test("client telemetry rejects private fields, cross-origin requests and oversized bodies", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (_label: string, value: string) => { logs.push(value); });
  const value = { requestId: crypto.randomUUID(), outcome: "paint-opportunity", totalMs: 3200, visible: true };
  const post = (data: unknown, origin = "https://deeplog.app", type = "application/json") => POST(new Request("https://deeplog.app/api/diagnostics/refresh-timing", {
    method: "POST", headers: { origin, "content-type": type }, body: JSON.stringify(data),
  }));
  assert.equal((await post(value)).status, 204);
  assert.equal((await post({ ...value, description: "private" })).status, 400);
  assert.equal((await post({ ...value, extra: "x".repeat(2048) })).status, 413);
  assert.equal((await post(value, "https://other.example")).status, 403);
  assert.equal((await post(value, "https://deeplog.app", "text/plain")).status, 415);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /private|description|origin/);
  for (let n = 0; n < 120; n++) await post(value);
  assert.equal((await post(value)).status, 429);
});
