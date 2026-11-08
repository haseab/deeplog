import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("tracking integration authenticates before accessing Toggl and returns only running timer fields", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.ATTENTION_API_KEY, previousSession = process.env.TOGGL_SESSION_TOKEN;
  const apiKey = "integration-key-".repeat(4), session = "private-toggl-session";
  process.env.ATTENTION_API_KEY = apiKey;
  process.env.TOGGL_SESSION_TOKEN = session;
  const calls: RequestInit[] = [];
  let body: unknown = { id: 123, description: "Design", start: "2026-11-07T10:00:00-08:00", stop: null, workspace_id: 9, tags: ["private"] };
  let status = 200;
  globalThis.fetch = async (_url, init) => { calls.push(init!); return Response.json(body, { status }); };
  const request = (key?: string) => new Request("https://deeplog.app/api/integrations/tracking-now", { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  try {
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request(session))).status, 401);
    assert.equal(calls.length, 0);
    const response = await GET(request(apiKey));
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { entry: { description: "Design", start: "2026-11-07T18:00:00.000Z" } });
    assert.equal(new Headers(calls[0].headers).get("Authorization"), `Bearer ${session}`);
    body = null;
    assert.deepEqual(await (await GET(request(apiKey))).json(), { entry: null });
    body = { description: "Ended", start: "2026-11-07T18:00:00Z", stop: "2026-11-07T18:05:00Z" };
    assert.deepEqual(await (await GET(request(apiKey))).json(), { entry: null });
    body = { start: "invalid" };
    assert.equal((await GET(request(apiKey))).status, 502);
    status = 401;
    const failed = await GET(request(apiKey));
    assert.equal(failed.status, 503);
    assert.doesNotMatch(await failed.text(), new RegExp(`${session}|${apiKey}`));
    delete process.env.TOGGL_SESSION_TOKEN;
    assert.equal((await GET(request(apiKey))).status, 503);
    delete process.env.ATTENTION_API_KEY;
    assert.equal((await GET(request(apiKey))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.ATTENTION_API_KEY; else process.env.ATTENTION_API_KEY = previousKey;
    if (previousSession === undefined) delete process.env.TOGGL_SESSION_TOKEN; else process.env.TOGGL_SESSION_TOKEN = previousSession;
  }
});
