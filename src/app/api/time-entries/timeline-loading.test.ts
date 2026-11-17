import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./analytics-route";
import { POST as validate } from "../validate-session-token/route";

test("timeline and session validation coalesce metadata; warm timeline loads make only two Toggl calls", async t => {
  const token = crypto.randomUUID();
  const calls: string[] = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path.endsWith("/me")) return Response.json({ id: 1, timezone: "UTC" });
    if (path.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }]);
    if (path.endsWith("/projects") || path.endsWith("/tags")) return Response.json([]);
    if (path.endsWith("/query")) return Response.json({ data_table: [] });
    if (path.endsWith("/current")) return Response.json(null);
    throw Error(`Unexpected endpoint ${path}`);
  });
  const request = () => new NextRequest("https://deeplog.app/api/time-entries?from_date=2026-11-16&to_date=2026-11-16", { headers: { "x-toggl-session-token": token } });
  const [cold, validation] = await Promise.all([
    GET(request()),
    validate(new NextRequest("https://deeplog.app/api/validate-session-token", { method: "POST", body: JSON.stringify({ sessionToken: token }) })),
  ]);
  assert.equal(cold.status, 200); assert.equal(validation.status, 200);
  assert.equal(calls.length, 6, "validation must reuse the timeline's profile and workspace reads");
  calls.length = 0;
  const started = Date.now();
  const warm = await GET(request());
  assert.equal(warm.status, 200);
  assert.deepEqual(calls, ["/analytics/api/organizations/4/query", "/api/v9/me/time_entries/current"]);
  assert.ok(Date.now() - started < 3500, "warm loads must not requeue four metadata calls");
});
