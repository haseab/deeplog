import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

test("the public list route correlates real request diagnostics without changing its payload", async t => {
  const reports: string[] = [];
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "info", (label: string, value: string) => {
    if (label === "[deeplog-refresh-backend]") reports.push(value);
  });
  t.mock.method(globalThis, "fetch", async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/me")) return Response.json({ id: 1, timezone: "UTC" });
    if (path.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 3 }]);
    if (path.endsWith("/projects") || path.endsWith("/tags")) return Response.json([]);
    if (path.endsWith("/query")) return Response.json({ data_table: [] });
    if (path.endsWith("/current")) return Response.json(null);
    throw Error("Unexpected upstream endpoint");
  });
  const requestId = crypto.randomUUID();
  const response = await GET(new NextRequest("https://deeplog.app/api/time-entries?from_date=2026-11-19&to_date=2026-11-19", {
    headers: { "x-toggl-session-token": crypto.randomUUID(), "x-deeplog-refresh-id": requestId },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-deeplog-refresh-id"), requestId);
  assert.match(response.headers.get("server-timing")!, /dl_analytics;dur=/);
  assert.deepEqual((await response.json()).timeEntries, []);
  assert.equal(reports.length, 1);
  const report = JSON.parse(reports[0]);
  assert.equal(report.requestId, requestId);
  assert.equal(report.phases.analytics.calls, 1);
  assert.equal(report.phases.current.upstream, 1);
});
