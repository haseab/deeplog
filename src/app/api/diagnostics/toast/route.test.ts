import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

test("client telemetry rejects private fields, cross-origin requests and oversized bodies", async t => {
  const logs: string[] = [];
  t.mock.method(console, "info", (_label: string, value: string) => { logs.push(value); });
  const value = { version: 1, pageId: crypto.randomUUID(), dropped: 0, events: [{ event: "toast.created", sequence: 1, at: Date.now() }] };
  const post = (data: unknown, origin = "https://app.example", type = "application/json") => POST(new Request("https://app.example/api/diagnostics/toast", {
    method: "POST", headers: { origin, "content-type": type }, body: JSON.stringify(data),
  }));
  assert.equal((await post(value)).status, 204);
  assert.equal((await post({ ...value, description: "private" })).status, 400);
  assert.equal((await post({ ...value, extra: "x".repeat(32768) })).status, 413);
  assert.equal((await post(value, "https://other.example")).status, 403);
  assert.equal((await post(value, "https://app.example", "text/plain")).status, 415);
  const proxyHeaders: Record<string, string>[] = [
    { host: "app.example" },
    { host: "internal:8080", "x-forwarded-host": "app.example" },
  ];
  for (const headers of proxyHeaders) {
    const proxy = await POST(new Request("http://0.0.0.0:8080/api/diagnostics/toast", {
      method: "POST", headers: { ...headers, origin: "https://app.example", "content-type": "application/json" }, body: "{}",
    }));
    assert.equal(proxy.status, 400, "same-origin proxied reports must reach payload validation");
  }
  assert.equal((await post(value, "not-an-origin")).status, 403);
  const crossSite = await POST(new Request("https://app.example/api/diagnostics/toast", {
    method: "POST", headers: { origin: "https://app.example", "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify(value),
  }));
  assert.equal(crossSite.status, 403);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /private|description|origin/);
  for (let n = 0; n < 120; n++) await post(value);
  assert.equal((await post(value)).status, 429);
});
