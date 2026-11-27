import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

const columns = ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"];

async function run(query: string, status = 200) {
  const previous = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/me")) return Response.json({ id: 1, timezone: "UTC" });
    if (url.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 3 }]);
    if (url.includes("/me/time_entries/")) return Response.json({ id: 15, workspace_id: 2, start: "2026-10-30T12:15:00Z" }, { status });
    const rows = Array.from({ length: 30 }, (_, minute) => [minute + 1, `Example ${minute + 1}`, "2026-10-30", `12:${String(minute + 1).padStart(2, "0")}:00`, `12:${String(minute + 1).padStart(2, "0")}:30`, 30000, null, []]).reverse();
    return Response.json({ data_table: [columns, ...rows] });
  };
  try {
    const response = await GET(new NextRequest(`http://localhost/api/time-entries/context?${query}`, { headers: { "x-toggl-session-token": `test-${crypto.randomUUID()}` } }));
    return { status: response.status, body: await response.json(), calls };
  } finally { globalThis.fetch = previous; }
}

test("context returns only the target plus five entries on each side", async () => {
  const result = await run("entry=15");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]);
  assert.equal(result.body.hasNewer, true);
  assert.equal(result.body.hasOlder, true);
});

test("context extension is exclusive of its cursor in either direction", async () => {
  const older = await run("entry=15&direction=older");
  const newer = await run("entry=15&direction=newer");
  assert.deepEqual(older.body.timeEntries.map((entry: { id: number }) => entry.id), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  assert.deepEqual(newer.body.timeEntries.map((entry: { id: number }) => entry.id), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
});

test("context rejects malformed links and preserves deleted and expired entry errors", async () => {
  for (const query of ["entry=bad", "entry=0", "entry=1&direction=both"]) {
    const result = await run(query);
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
  assert.equal((await run("entry=15", 404)).status, 404);
  const expired = await run("entry=15", 401);
  assert.equal(expired.status, 401);
  assert.equal(expired.body.isSessionExpired, true);
});
