import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as description } from "../app/api/time-entries/[id]/description/route";
import { GET as timeline, POST as start } from "../app/api/time-entries/analytics-route";
import { POST as split } from "../app/api/time-entries/split/route";
import { POST as combine } from "../app/api/time-entries/combine/route";
import { POST as project } from "../app/api/projects/route";
import { POST as tag } from "../app/api/tags/route";
import { POST as validateApiKey } from "../app/api/validate-api-key/route";
import { POST as validate } from "../app/api/validate-session-token/route";
import { GET as search } from "../app/api/time-entries/search/route";
import { PATCH as update, DELETE as remove } from "../app/api/time-entries/[id]/route";
import { apiFetch, togglRetryAt } from "./api-fetch";
import { toast } from "./toast";
import { retryAfterSeconds, TogglRateLimitError, TOGGL_RATE_LIMIT_CODE, TOGGL_QUOTA_LIMIT_CODE } from "./toggl-rate-limit";

const json = { account: "1:2", base: "base", local: "mine", entryId: 3, offsetMinutes: 1, name: "Planning", apiKey: "rate-limit-test-key" };
const params = { params: Promise.resolve({ id: "3" }) };
const request = (path: string, method = "POST", token = crypto.randomUUID()) => new NextRequest(`https://deeplog.app${path}`, {
  method, headers: { "x-toggl-session-token": token, "Content-Type": "application/json" },
  ...(method === "GET" ? {} : { body: JSON.stringify({ ...json, apiKey: crypto.randomUUID(), sessionToken: token }) }),
});
const limited = () => new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "180" } });
async function assertLimited(response: Response) {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "180");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.equal(body.code, TOGGL_RATE_LIMIT_CODE);
  assert.equal(body.retryAfter, 180);
  assert.equal(body.isSessionExpired, false);
  assert.match(body.error, /rate limiting/);
}

test("Retry-After parsing supports seconds, dates, and safe fallback", () => {
  const now = Date.parse("2026-11-16T17:00:00Z");
  assert.equal(retryAfterSeconds("5"), 5);
  assert.equal(retryAfterSeconds("Mon, 16 Nov 2026 17:01:00 GMT", 120, now), 60);
  for (const value of [null, "", "bad", "-5"]) assert.equal(retryAfterSeconds(value), 120);
});

test("every interactive route returns 429 rather than an authentication or generic error", async t => {
  t.mock.method(globalThis, "fetch", async () => limited());
  t.mock.method(console, "info", () => {});
  for (const run of [
    () => description(request("/api/time-entries/3/description"), params),
    () => timeline(request("/api/time-entries?from_date=2026-11-16&to_date=2026-11-16", "GET")),
    () => start(request("/api/time-entries")),
    () => split(request("/api/time-entries/split")),
    () => combine(request("/api/time-entries/combine")),
    () => update(request("/api/time-entries/3", "PATCH"), params),
    () => remove(request("/api/time-entries/3", "DELETE"), params),
    () => project(request("/api/projects")),
    () => tag(request("/api/tags")),
    () => validate(request("/api/validate-session-token")),
    () => validateApiKey(request("/api/validate-api-key")),
    () => search(request("/api/time-entries/search?q=x&from_date=2026-11-16&to_date=2026-11-16", "GET")),
  ]) await assertLimited(await run());
});

test("interactive routes preserve quota status, reset and authentication instead of reporting an expired session", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, {
    status: 402, headers: { "X-Toggl-Quota-Remaining": "0", "X-Toggl-Quota-Resets-In": "90" },
  }));
  t.mock.method(console, "info", () => {});
  for (const run of [
    () => description(request("/api/time-entries/3/description"), params),
    () => timeline(request("/api/time-entries?from_date=2026-11-16&to_date=2026-11-16", "GET")),
    () => start(request("/api/time-entries")),
    () => split(request("/api/time-entries/split")),
    () => combine(request("/api/time-entries/combine")),
    () => update(request("/api/time-entries/3", "PATCH"), params),
    () => remove(request("/api/time-entries/3", "DELETE"), params),
    () => project(request("/api/projects")),
    () => tag(request("/api/tags")),
    () => validate(request("/api/validate-session-token")),
    () => validateApiKey(request("/api/validate-api-key")),
    () => search(request("/api/time-entries/search?q=x&from_date=2026-11-16&to_date=2026-11-16", "GET")),
  ]) {
    const response = await run();
    assert.equal(response.status, 402);
    assert.equal(response.headers.get("Retry-After"), "90");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.equal(body.code, TOGGL_QUOTA_LIMIT_CODE);
    assert.equal(body.isSessionExpired, false);
    assert.equal(body.retryAfter, 90);
  }
});


for (const phase of ["me", "workspaces", "read", "write"]) {
  test(`description ${phase} rate limit preserves status, cooldown and correlation`, async t => {
    let writes = 0;
    t.mock.method(console, "info", () => {});
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/me")) return phase === "me" ? limited() : Response.json({ id: 1 });
      if (path.endsWith("/workspaces")) return phase === "workspaces" ? limited() : Response.json([{ id: 2, organization_id: 4 }]);
      if (init?.method === "PUT") { writes++; return limited(); }
      return phase === "read" ? limited() : Response.json({ description: "base", wid: 2, uid: 1 });
    });
    const response = await description(request("/api/time-entries/3/description"), params);
    assert.ok(response.headers.get("x-deeplog-sync-request-id"));
    await assertLimited(response);
    assert.equal(writes, phase === "write" ? 1 : 0);
  });
}

test("real server 429 reaches frontend toast and per-session retry state without a toast storm", async t => {
  const token = crypto.randomUUID();
  const notices: { message: unknown; options: unknown }[] = [];
  t.mock.method(toast, "error", (message: Parameters<typeof toast.error>[0], options: Parameters<typeof toast.error>[1]) => { notices.push({ message, options }); return "toast"; });
  t.mock.method(console, "info", () => {});
  let upstream = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("/api/")) {
      return description(new NextRequest(`https://deeplog.app${input}`, { ...init, signal: init?.signal ?? undefined }), params);
    }
    upstream++;
    return limited();
  });
  const before = Date.now();
  for (let i = 0; i < 3; i++) {
    await assert.rejects(apiFetch("/api/time-entries/3/description", {
      method: "POST", headers: { "x-toggl-session-token": token }, body: JSON.stringify(json),
    }), error => error instanceof TogglRateLimitError && error.status === 429 && error.retryAfter === 180);
  }
  assert.equal(upstream, 1, "shared server cooldown must prevent further Toggl calls");
  assert.equal(notices.length, 1);
  assert.match(String(notices[0].message), /rate limiting.*180 seconds/);
  assert.match(JSON.stringify(notices[0].options), /saved locally.*retry automatically/);
  assert.ok(togglRetryAt(token) >= before + 180_000);
  assert.equal(togglRetryAt("unrelated-account"), 0);
});

test("quota exhaustion reaches the browser retry state, draft-safe toast and shared cooldown", async t => {
  const now = 2_000_000_000_000;
  t.mock.method(Date, "now", () => now);
  t.mock.method(console, "info", () => {});
  const notices: string[] = [];
  t.mock.method(toast, "error", (message: Parameters<typeof toast.error>[0]) => { notices.push(String(message)); return "toast"; });
  let upstream = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith("/api/")) return description(new NextRequest(`https://deeplog.app${input}`, { ...init, signal: init?.signal ?? undefined }), params);
    upstream++;
    return new Response(null, { status: 402, headers: { "X-Toggl-Quota-Remaining": "0", "X-Toggl-Quota-Resets-In": "30" } });
  });
  const token = crypto.randomUUID();
  for (let i = 0; i < 2; i++) {
    await assert.rejects(apiFetch("/api/time-entries/3/description", {
      method: "POST", headers: { "x-toggl-session-token": token }, body: JSON.stringify(json),
    }), error => error instanceof TogglRateLimitError && error.status === 402 && error.reason === "quota" && error.retryAfter === 30);
  }
  assert.equal(upstream, 1);
  assert.equal(togglRetryAt(token), now + 30_000);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /quota is exhausted/);
});

test("frontend leaves successful, expired-session and unrelated-provider responses intact", async t => {
  t.mock.method(toast, "error", () => { assert.fail("unexpected Toggl rate-limit toast"); });
  for (const response of [Response.json({ ok: true }), Response.json({ isSessionExpired: true }, { status: 401 }), Response.json({ error: "Limitless throttled" }, { status: 429 }), Response.json({ error: "Upgrade required" }, { status: 402 }), Response.json({ code: TOGGL_QUOTA_LIMIT_CODE }, { status: 429 })]) {
    t.mock.method(globalThis, "fetch", async () => response);
    assert.equal(await apiFetch("/api/limitless"), response);
  }
});
