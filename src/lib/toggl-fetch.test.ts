import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { TogglRequestQueue } from "./toggl-fetch";

const url = "https://track.toggl.com/api/v9/me";
const auth = (token = "session-a", signal?: AbortSignal) => ({ headers: { Authorization: `Bearer ${token}` }, signal });

test("concurrent routes sharing a credential serialize and space upstream starts", async t => {
  const queue = new TogglRequestQueue(30);
  const starts: number[] = [];
  let active = 0, maxActive = 0;
  t.mock.method(globalThis, "fetch", async () => {
    starts.push(Date.now()); maxActive = Math.max(maxActive, ++active);
    await delay(10); active--;
    return Response.json({ ok: true });
  });
  await Promise.all(Array.from({ length: 4 }, () => queue.fetch(url, auth())));
  assert.equal(maxActive, 1);
  assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 29);
});

test("a slow request prevents overlap even after the spacing interval elapsed", async t => {
  const queue = new TogglRequestQueue(1);
  let active = 0;
  t.mock.method(globalThis, "fetch", async () => {
    assert.equal(active++, 0); await delay(20); active--;
    return new Response();
  });
  await Promise.all([queue.fetch(url, auth()), queue.fetch(url, auth())]);
});

test("a 429 pauses queued and new calls without replaying writes; other credentials work", async t => {
  const queue = new TogglRequestQueue(0, 100);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    calls.push(new Headers(init?.headers).get("Authorization")!);
    return new Response(null, { status: calls.length === 1 ? 429 : 200, headers: { "Retry-After": "3" } });
  });
  const [limited, queued] = await Promise.all([
    queue.fetch(url, { ...auth(), method: "PUT", body: "edit" }), queue.fetch(url, auth()),
  ]);
  assert.equal(limited.status, 429);
  assert.equal(queued.status, 429);
  assert.ok(Number(queued.headers.get("Retry-After")) >= 3);
  assert.equal((await queue.fetch(url, auth())).status, 429);
  assert.equal((await queue.fetch(url, auth("session-b"))).status, 200);
  assert.equal(calls.length, 2);
});

test("cooldown honors HTTP-date Retry-After and resumes after expiry", async t => {
  const queue = new TogglRequestQueue(0, 20);
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(null, ++calls === 1
    ? { status: 429, headers: { "Retry-After": new Date(now + 5000).toUTCString() } } : { status: 200 }));
  await queue.fetch(url, auth());
  assert.equal((await queue.fetch(url, auth())).headers.get("Retry-After"), "5");
  now += 5001;
  assert.equal((await queue.fetch(url, auth())).status, 200);
});

test("missing or malformed Retry-After uses the shared fallback cooldown", async t => {
  for (const header of [undefined, "garbage"]) {
    const queue = new TogglRequestQueue(0, 120_000);
    const mock = t.mock.method(globalThis, "fetch", async () => new Response(null, {
      status: 429, headers: header ? { "Retry-After": header } : {},
    }));
    await queue.fetch(url, auth());
    const blocked = await queue.fetch(url, auth());
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("Retry-After")) >= 119);
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});

test("aborted queued work never fetches and does not deadlock subsequent work", async t => {
  const queue = new TogglRequestQueue(20);
  let active = 0;
  const mock = t.mock.method(globalThis, "fetch", async () => {
    assert.equal(active++, 0); await delay(10); active--; return new Response();
  });
  const controller = new AbortController();
  const first = queue.fetch(url, auth());
  const aborted = queue.fetch(url, auth("session-a", controller.signal));
  controller.abort();
  const follower = queue.fetch(url, auth());
  await assert.rejects(aborted, { name: "AbortError" });
  await Promise.all([first, follower]);
  assert.equal(mock.mock.callCount(), 2);
});

test("abort during pacing cancels the wait and releases the semaphore", async t => {
  const queue = new TogglRequestQueue(40);
  const mock = t.mock.method(globalThis, "fetch", async () => new Response());
  await queue.fetch(url, auth());
  const controller = new AbortController();
  const pending = queue.fetch(url, auth("session-a", controller.signal));
  await delay(5); controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await queue.fetch(url, auth());
  assert.equal(mock.mock.callCount(), 2);
});

test("upstream failure releases the semaphore and unrelated services bypass it", async t => {
  const queue = new TogglRequestQueue(0);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) throw new Error("network failed");
    return new Response("ok");
  });
  await assert.rejects(queue.fetch(url, auth()), /network failed/);
  assert.equal((await queue.fetch(url, auth())).status, 200);
  assert.equal(await (await queue.fetch("https://api.openai.com/v1/responses", auth())).text(), "ok");
});

test("Request inputs and init header overrides share lanes across Toggl hosts", async t => {
  const queue = new TogglRequestQueue(0, 1000);
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 429 }));
  await queue.fetch(new Request(url, auth()));
  assert.equal((await queue.fetch("https://api.track.toggl.com/api/v9/me", auth())).status, 429);
  assert.equal(mock.mock.callCount(), 1);
  await queue.fetch(new Request(url, auth()), auth("different-session"));
  assert.equal(mock.mock.callCount(), 2);
});
