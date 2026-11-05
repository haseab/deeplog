import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "./analytics-route";

const columns = ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"];
const row = (id: number, start: string, stop: string, duration = 3_600_000) =>
  [id, `Entry ${id}`, "2026-11-02", start, stop, duration, null, []];

async function run(from: string, to: string, options: {
  page?: number;
  limit?: number;
  timezone?: string;
  current?: { id: number; start: string };
  rows?: unknown[][];
} = {}) {
  const originalFetch = globalThis.fetch;
  const analyticsPayloads: { period: { from: string; to: string } }[] = [];
  globalThis.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/me")) return Response.json({ id: 1, timezone: "America/Los_Angeles" });
    if (path.endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }]);
    if (path.endsWith("/projects") || path.endsWith("/tags")) return Response.json([]);
    if (path.endsWith("/current")) return Response.json(options.current ?? null);
    if (path.endsWith("/query")) {
      analyticsPayloads.push(JSON.parse(String(init?.body)));
      return Response.json({ data_table: [columns, ...(options.rows ?? [
        row(1, "08:00:00", "09:00:00"), // ends exactly at window start
        row(2, "08:45:00", "09:15:00", 1_800_000), // overlaps its start
        row(3, "09:00:00", "10:00:00"),
        row(4, "09:30:00", "10:30:00"), // overlaps its end
        row(5, "10:00:00", "11:00:00"), // starts exactly at window end
      ])] });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  };
  try {
    const params = new URLSearchParams({
      from_date: from, to_date: to, timezone: options.timezone ?? "America/Los_Angeles",
      page: String(options.page ?? 0), limit: String(options.limit ?? 100),
    });
    const response = await GET(new NextRequest(`http://localhost/api/time-entries?${params}`, {
      headers: { "x-toggl-session-token": "test-session" },
    }));
    return { status: response.status, body: await response.json(), analyticsPayloads };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("datetime filtering uses exact overlap boundaries before pagination and keeps original durations", async () => {
  const result = await run("2026-11-02T09:00", "2026-11-02T10:00");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [4, 3, 2]);
  assert.equal(result.body.timeEntries[0].duration, 3600);
  assert.equal(result.body.timeEntries[0].stop, "2026-11-02T18:30:00.000Z");
  assert.deepEqual(result.analyticsPayloads[0].period, { from: "2026-11-01", to: "2026-11-02" });

  const page = await run("2026-11-02T09:00", "2026-11-02T10:00", { page: 1, limit: 1 });
  assert.deepEqual(page.body.timeEntries.map((entry: { id: number }) => entry.id), [3]);
  assert.deepEqual(page.body.pagination, { page: 1, limit: 1, total: 3, hasMore: true });
});

test("offsets are honored independently of the display timezone", async () => {
  const utc = await run("2026-11-02T17:00Z", "2026-11-02T18:00Z", { timezone: "Asia/Tokyo" });
  const offset = await run("2026-11-02T22:30+05:30", "2026-11-02T23:30+05:30");
  for (const result of [utc, offset]) {
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [4, 3, 2]);
  }
});

test("date-only links still include the full day", async () => {
  const result = await run("2026-11-02", "2026-11-02");
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [5, 4, 3, 2, 1]);
});

test("running entries obey the exact window even when they started earlier", async () => {
  const inside = await run("2026-11-02T09:00", "2026-11-02T10:00", {
    current: { id: 6, start: "2026-11-02T16:30:00Z" },
  });
  assert.ok(inside.body.timeEntries.some((entry: { id: number }) => entry.id === 6));
  const outside = await run("2026-11-02T09:00", "2026-11-02T10:00", {
    current: { id: 6, start: "2026-11-02T18:00:00Z" },
  });
  assert.ok(!outside.body.timeEntries.some((entry: { id: number }) => entry.id === 6));
});

test("invalid and reversed datetime ranges return 400 before querying Analytics", async () => {
  for (const [from, to] of [
    ["2026-11-02T10:00", "2026-11-02T09:00"],
    ["2026-11-02T10:00", "2026-11-02T10:00"],
    ["2026-02-30T10:00Z", "2026-03-01T10:00Z"],
    ["2026-11-01T01:30", "2026-11-01T02:30"],
  ]) {
    const result = await run(from, to);
    assert.equal(result.status, 400);
    assert.equal(result.analyticsPayloads.length, 0);
  }
});

test("lagging Analytics timers stopped before the datetime window are excluded", async () => {
  const result = await run("2026-11-02T09:00", "2026-11-02T10:00", {
    rows: [row(7, "08:00:00", "", -1000)],
    current: { id: 6, start: "2026-11-02T16:30:00Z" },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [6]);
});
