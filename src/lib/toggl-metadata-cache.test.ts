import test from "node:test";
import assert from "node:assert/strict";
import { createTogglFetch, TogglRequestQueue } from "./toggl-fetch";
import { TogglMetadataCache } from "./toggl-metadata-cache";

const origin = "https://track.toggl.com/api/v9";
const auth = (token = "a", extra: RequestInit = {}) => ({ headers: { Authorization: `Bearer ${token}` }, ...extra });

test("concurrent metadata reads share one upstream call and independent response bodies", async t => {
  const f = createTogglFetch(new TogglRequestQueue(0));
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ id: 1 }));
  const responses = await Promise.all([f(`${origin}/me`, auth()), f(`${origin}/me`, auth()), f(`${origin}/me`, auth())]);
  assert.deepEqual(await Promise.all(responses.map(r => r.json())), [{ id: 1 }, { id: 1 }, { id: 1 }]);
  assert.equal(mock.mock.callCount(), 1);
});

test("canceling the initiating caller cannot cancel metadata needed by a timeline load", async t => {
  const f = createTogglFetch(new TogglRequestQueue(0));
  let resolve!: (response: Response) => void;
  const ready = new Promise<Response>(r => { resolve = r; });
  let upstreamSignal: AbortSignal | null | undefined;
  const mock = t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    upstreamSignal = init?.signal;
    return ready;
  });
  const controller = new AbortController();
  const canceled = f(`${origin}/me`, auth("a", { signal: controller.signal }));
  const visible = f(`${origin}/me`, auth());
  controller.abort();
  await assert.rejects(canceled, { name: "AbortError" });
  assert.equal(upstreamSignal?.aborted, false);
  resolve(Response.json({ id: 1 }));
  assert.deepEqual(await (await visible).json(), { id: 1 });
  assert.equal(mock.mock.callCount(), 1);
});

test("entry reads, running timers, and Analytics never use cached responses", async t => {
  const f = createTogglFetch(new TogglRequestQueue(0));
  let revision = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ revision: ++revision }));
  for (const path of ["/me/time_entries/3", "/me/time_entries/current", "/analytics/query"]) {
    const first = await (await f(`${origin}${path}`, auth())).json();
    const next = await (await f(`${origin}${path}`, auth())).json();
    assert.notEqual(first.revision, next.revision);
  }
});

test("metadata is scoped by credential and full URL, expires, and invalidates on metadata writes", async t => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const f = createTogglFetch(new TogglRequestQueue(0), new TogglMetadataCache(100));
  let revision = 0;
  t.mock.method(globalThis, "fetch", async () => Response.json({ revision: ++revision }));
  const read = async (token = "a", path = "/workspaces/2/projects?page=1") => (await f(`${origin}${path}`, auth(token))).json();
  assert.deepEqual(await read(), await read());
  assert.notDeepEqual(await read("a"), await read("b"));
  assert.notDeepEqual(await read("a"), await read("a", "/workspaces/2/projects?page=2"));
  const before = await read();
  now += 101;
  assert.notDeepEqual(await read(), before);
  const beforeWrite = await read();
  await f(`${origin}/workspaces/2/projects`, auth("a", { method: "POST", body: "{}" }));
  assert.notDeepEqual(await read(), beforeWrite);
});

test("failed metadata and body reads do not poison the cache; upstream 401 invalidates identity", async t => {
  const f = createTogglFetch(new TogglRequestQueue(0));
  let status = 500, calls = 0, broken = false;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (broken) return new Response(new ReadableStream({ start(c) { c.error(new Error("body failed")); } }));
    return Response.json({ id: 1 }, { status });
  });
  await f(`${origin}/me`, auth()); await f(`${origin}/me`, auth());
  assert.equal(calls, 2);
  broken = true;
  await assert.rejects(f(`${origin}/me`, auth()), /body failed/);
  broken = false; status = 200;
  await f(`${origin}/me`, auth());
  const cachedCalls = calls;
  await f(`${origin}/me`, auth());
  assert.equal(calls, cachedCalls);
  status = 401;
  await f(`${origin}/me/time_entries/3`, auth());
  status = 200;
  await f(`${origin}/me`, auth());
  assert.equal(calls, cachedCalls + 2);
});
