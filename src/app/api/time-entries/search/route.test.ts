import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

const columns = ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"];
const row = [3, "Planning & review", "2026-10-30", "07:15:26", "07:16:57", 91000, 5, [6]];

async function run(query = "", options: { token?: string | null; status?: number; meStatus?: number; workspaceStatus?: number; rows?: unknown[][]; malformed?: boolean } = {}) {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/me")) return Response.json({ id: 1, timezone: "America/Los_Angeles" }, { status: options.meStatus ?? 200 });
    if (String(url).endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }], { status: options.workspaceStatus ?? 200 });
    if (String(url).includes("/time_entries/")) return Response.json({ start: "2026-11-01T09:30:00Z", stop: "2026-11-01T09:31:31Z", duration: 91 });
    return Response.json(options.malformed ? {} : {
      data_table: [columns, ...(options.rows ?? [row])],
      dictionaries: { projects: { "5": { name: "Planning", color: "#123456" } }, tags: { "6": { name: "Review" } } },
    }, { status: options.status ?? 200 });
  };
  try {
    const headers = new Headers();
    if (options.token !== null) headers.set("x-toggl-session-token", options.token ?? "test-session");
    const response = await GET(new NextRequest(`http://localhost/api/time-entries/search?${query || "q=Planning%20%26%20review&from_date=2026-10-26&to_date=2026-11-01&page=2&limit=1"}`, { headers }));
    return { status: response.status, body: await response.json(), calls, cache: response.headers.get("Cache-Control") };
  } finally {
    globalThis.fetch = original;
  }
}

test("search forwards session auth and scopes the captured contains filter to this user and workspace", async () => {
  const result = await run();
  assert.equal(result.status, 200);
  const call = result.calls[2];
  assert.equal(call.url, "https://track.toggl.com/analytics/api/organizations/4/query?response_format=json&include_dicts=true");
  assert.equal(call.init?.method, "POST");
  assert.equal(new Headers(call.init?.headers).get("Authorization"), "Bearer test-session");
  assert.equal(call.init?.cache, "no-store");
  const payload = JSON.parse(String(call.init?.body));
  assert.deepEqual(payload.filters, [
    { property: "workspace_id", operator: "=", value: 2 },
    { property: "user_id", operator: "=", value: 1 },
    { operator: "and", conditions: [{ property: "description", operator: "contains", value: "Planning & review" }] },
  ]);
  assert.deepEqual(payload.pagination, { per_page: 1, page: 3 });
  assert.deepEqual(payload.ordinations, [{ property: "start", direction: "desc", nulls: "first" }]);
  assert.deepEqual(payload.period, { from: "2026-10-26", to: "2026-11-01" });
  assert.deepEqual(result.body.timeEntries[0], {
    id: 3, description: "Planning & review", start: "2026-10-30T14:15:26.000Z", stop: "2026-10-30T14:16:57.000Z",
    duration: 91, project_id: 5, project_name: "Planning", project_color: "#123456", tags: ["Review"], tag_ids: [6],
  });
  assert.deepEqual(result.body.pagination, { page: 2, limit: 1, hasMore: true });
  assert.equal(result.cache, "no-store, max-age=0");
});

test("short and empty pages terminate pagination", async () => {
  const result = await run("q=x&from_date=2026-10-30&to_date=2026-10-30", { rows: [] });
  assert.deepEqual(result.body.timeEntries, []);
  assert.deepEqual(result.body.pagination, { page: 0, limit: 100, hasMore: false });
});

test("invalid inputs fail before making upstream requests", async () => {
  const base = "q=x&from_date=2026-10-26&to_date=2026-11-01";
  for (const query of [base.replace("q=x", "q=%20"), base.replace("2026-11-01", "2026-02-30"), base.replace("2026-10-26", "2026-11-02"), "q=x", ...["page=-1", "page=1x", "page=1.5", "limit=0", "limit=101", "limit=NaN"].map((value) => `${base}&${value}`)]) {
    const result = await run(query);
    assert.equal(result.status, 400, query);
    assert.equal(result.calls.length, 0, query);
  }
});

test("missing sessions and expired sessions preserve the app's authentication contract", async () => {
  const missing = await run("", { token: null });
  assert.equal(missing.status, 400);
  assert.equal(missing.calls.length, 0);
  for (const options of [{ meStatus: 401 }, { workspaceStatus: 401 }, { status: 401 }]) {
    const expired = await run("", options);
    assert.equal(expired.status, 401);
    assert.equal(expired.body.isSessionExpired, true);
  }
});

test("upstream failures are not returned as successful empty searches", async () => {
  assert.equal((await run("", { status: 500 })).status, 502);
  assert.equal((await run("", { status: 429 })).status, 429);
  assert.equal((await run("", { malformed: true })).status, 502);
});

test("ambiguous daylight-saving timestamps are resolved through the canonical entry", async () => {
  const result = await run("", { rows: [[3, "Planning", "2026-11-01", "01:30:00", "01:31:31", 91000, null, []]] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 4);
  assert.equal(result.body.timeEntries[0].start, "2026-11-01T09:30:00.000Z");
  assert.equal(result.body.timeEntries[0].duration, 91);
});
