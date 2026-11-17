import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST as start } from "./analytics-route";
import { PATCH } from "./[id]/route";
import { POST as description } from "./[id]/description/route";

// Exercise the actual route -> cache -> paced queue -> upstream boundary.
test("pagination, direct edits, recovery and timer starts avoid redundant Toggl calls", async t => {
  const token = crypto.randomUUID();
  const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  let remote = "earlier upload";
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "info", () => {});
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    if (path.endsWith("/me")) return Response.json({ id: 1, timezone: "UTC" });
    if (path.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }]);
    if (path.endsWith("/projects")) return Response.json([{ id: 7, name: "Work", color: "#000" }]);
    if (path.endsWith("/tags")) return Response.json([{ id: 8, name: "Tag" }]);
    if (path.endsWith("/query")) return Response.json({ data_table: [
      ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"],
      ...Array.from({ length: 210 }, (_, i) => [i + 1, "entry", "2026-11-16", "10:00:00", "11:00:00", 3600000, 7, []]),
    ] });
    if (path.endsWith("/current")) return Response.json({ id: 99, start: "2026-11-16T12:00:00Z", project_id: 7 });
    if (path.endsWith("/stop")) return Response.json({ id: 99, stop: "2026-11-16T13:00:00Z" });
    if (method === "GET" && path.includes("/me/time_entries/")) return Response.json({ id: 99, wid: 2, uid: 1, description: remote });
    if (method === "PUT") { if (typeof body?.description === "string") remote = body.description; return Response.json({ id: 99, ...body }); }
    if (method === "POST" && path.endsWith("/time_entries")) return Response.json({ id: 300, ...body });
    throw new Error(`Unexpected ${method} ${path}`);
  });
  const headers = { "x-toggl-session-token": token };
  const range = "https://deeplog.app/api/time-entries?from_date=2026-11-16&to_date=2026-11-16";
  const patch = (body: unknown) => PATCH(new NextRequest("https://deeplog.app/api/time-entries/99", { method: "PATCH", headers, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "99" }) });
  const cold = await GET(new NextRequest(range, { headers }));
  assert.equal(cold.status, 200);
  const first = await cold.json();
  assert.equal(calls.length, 6);
  assert.equal(first.timeEntries.length, 100);
  assert.ok(first.snapshot);

  calls.length = 0;
  const second = await (await GET(new NextRequest(`${range}&page=1&snapshot=${first.snapshot}`, { headers }))).json();
  assert.equal(calls.length, 0, "Load more must not refetch Analytics or current entry");
  assert.equal(second.timeEntries.length, 100);
  assert.deepEqual(second.timeEntries.map((e: { id: number }) => e.id), Array.from({ length: 100 }, (_, i) => i + 101));

  calls.length = 0;
  assert.equal((await patch({ project_id: 7 })).status, 200);
  assert.deepEqual(calls.map(c => [c.method, c.path, c.body]), [["PUT", "/api/v9/workspaces/2/time_entries/99", { project_id: 7 }]]);
  calls.length = 0;
  assert.equal((await patch({ tag_ids: [8] })).status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { tag_ids: [8] });
  calls.length = 0;
  await patch({ start: "2026-11-16T10:00:00Z", stop: "2026-11-16T11:00:00Z", duration: 500 });
  assert.deepEqual(calls[0].body, { start: "2026-11-16T10:00:00Z", stop: "2026-11-16T11:00:00Z" });
  assert.equal(calls.length, 1);

  calls.length = 0;
  const recovery = await description(new NextRequest("https://deeplog.app/api/time-entries/99/description", { method: "POST", headers, body: JSON.stringify({ account: "1:2", base: "base", uncertainUploads: ["earlier upload", "newer typing"], local: "newer typing" }) }), { params: Promise.resolve({ id: "99" }) });
  assert.equal(recovery.status, 200);
  assert.equal(remote, "newer typing");
  assert.deepEqual(calls.map(c => c.method), ["GET", "PUT"], "recovery must use one fresh read plus one write");
  remote = "phone edit";
  calls.length = 0;
  const conflict = await description(new NextRequest("https://deeplog.app/api/time-entries/99/description", { method: "POST", headers, body: JSON.stringify({ account: "1:2", base: "base", uncertainUploads: ["earlier upload", "newer typing"], local: "newer typing" }) }), { params: Promise.resolve({ id: "99" }) });
  assert.equal(conflict.status, 409);
  assert.equal(calls.length, 1, "a differing remote value must never be overwritten");

  calls.length = 0;
  await GET(new NextRequest(`${range}&page=1&snapshot=${first.snapshot}`, { headers }));
  assert.deepEqual(calls.map(c => c.path), ["/analytics/api/organizations/4/query", "/api/v9/me/time_entries/current"], "writes invalidate snapshots, retaining metadata");
  calls.length = 0;
  const refresh = await (await GET(new NextRequest(range, { headers }))).json();
  assert.equal(calls.length, 2, "explicit refresh must fetch fresh entries");
  assert.notEqual(refresh.snapshot, first.snapshot);

  calls.length = 0;
  const created = await start(new NextRequest("https://deeplog.app/api/time-entries", { method: "POST", headers, body: JSON.stringify({ description: "timer", start: "2026-11-16T13:00:00Z", project_id: 7 }) }));
  assert.equal(created.status, 201);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(c => c.method), ["GET", "PATCH", "POST"]);
  assert.equal(calls[2].body?.project_id, 7);
  calls.length = 0;
  assert.equal((await patch({ project_id: "7" })).status, 400);
  assert.equal(calls.length, 0);
  assert.equal((await start(new NextRequest("https://deeplog.app/api/time-entries", { method: "POST", headers, body: JSON.stringify({ project_id: -1 }) }))).status, 400);
  assert.equal(calls.length, 0, "invalid starts must not stop a running timer");
});
