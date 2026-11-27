import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "./route";

const columns = ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"];
const row = [3, "Planning & review", "2026-10-30", "07:15:26", "07:16:57", 91000, 5, [6]];

async function run(query = "", options: { token?: string | null; status?: number; meStatus?: number; workspaceStatus?: number; rows?: unknown[][]; malformed?: boolean; total?: number; countStatus?: number } = {}) {
  // Each simulated session has its own upstream rate-limit state.
  const session = options.token ?? `test-session-${crypto.randomUUID()}`;
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/me")) return Response.json({ id: 1, timezone: "America/Los_Angeles" }, { status: options.meStatus ?? 200 });
    if (String(url).endsWith("/workspaces")) return Response.json([{ id: 2, organization_id: 4 }], { status: options.workspaceStatus ?? 200 });
    if (String(url).includes("/time_entries/")) return Response.json({ start: "2026-11-01T09:30:00Z", stop: "2026-11-01T09:31:31Z", duration: 91 });
    if (init?.body && JSON.parse(String(init.body)).aggregations?.[0]?.function === "count") {
      return Response.json({ data_json_row: [{ count_time_entry_id: options.total ?? (options.rows ?? [row]).length }] }, { status: options.countStatus ?? 200 });
    }
    return Response.json(options.malformed ? {} : {
      data_table: [columns, ...(options.rows ?? [row])],
      dictionaries: { projects: { "5": { name: "Planning", color: "#123456" } }, tags: { "6": { name: "Review" } } },
    }, { status: options.status ?? 200 });
  };
  try {
    const headers = new Headers();
    if (options.token !== null) headers.set("x-toggl-session-token", session);
    const response = await GET(new NextRequest(`http://localhost/api/time-entries/search?${query || "q=Planning%20%26%20review&from_date=2026-10-26&to_date=2026-11-01&page=2&limit=1"}`, { headers }));
    return { status: response.status, body: await response.json(), calls, session, cache: response.headers.get("Cache-Control") };
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
  assert.equal(new Headers(call.init?.headers).get("Authorization"), `Bearer ${result.session}`);
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
  assert.deepEqual(result.body.pagination, { page: 0, limit: 100, total: 0, hasMore: false });
});

test("date-only searches allow project and all-tag filters without description text", async () => {
  const result = await run("from_date=2026-10-30&to_date=2026-10-30&projects=4,5&tags=6,7", {
    rows: [[4, "Other entry", "2026-10-30", "08:00:00", "08:01:00", 60000, 5, [6, 7]]],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.timeEntries.map((entry: { id: number }) => entry.id), [4]);
  const payload = JSON.parse(String(result.calls[2].init?.body));
  assert.deepEqual(payload.filters, [
    { property: "workspace_id", operator: "=", value: 2 },
    { property: "user_id", operator: "=", value: 1 },
    { operator: "and", conditions: [
      { property: "project_id", operator: "in", value: [4, 5] },
      { property: "tag_ids", operator: "contains one of", value: [6] },
      { property: "tag_ids", operator: "contains one of", value: [7] },
    ] },
  ]);
  assert.equal(result.body.pagination.hasMore, false);
});

test("exact descriptions and no-project selections are sent upstream before pagination", async () => {
  const result = await run("q=planning&match=exact&projects=none&from_date=2026-10-30&to_date=2026-10-30&limit=1", {
    rows: [[4, "Planning", "2026-10-30", "08:00:00", "08:01:00", 60000, null, []]],
  });
  assert.equal(result.body.timeEntries.length, 1);
  assert.equal(result.body.pagination.hasMore, false);
  const payload = JSON.parse(String(result.calls[2].init?.body));
  assert.deepEqual(payload.filters[2], { operator: "and", conditions: [
    { property: "description", operator: "=", value: "planning" },
    { property: "project_id", operator: "empty" },
  ] });
});

test("full matching pages remain full, and small project searches finish in one query", async () => {
  const query = "projects=5&from_date=2026-10-01&to_date=2026-10-31";
  const rows = Array.from({ length: 100 }, (_, index) => [index + 10, "Planning", "2026-10-30", "08:00:00", "08:01:00", 60000, 5, [6]]);
  const full = await run(query, { rows, total: 125 });
  assert.equal(full.body.timeEntries.length, 100);
  assert.equal(full.body.pagination.hasMore, true);
  assert.equal(full.body.pagination.total, 125);
  const countCall = full.calls.find(call => call.url.includes("response_format=json_row"))!;
  const countPayload = JSON.parse(String(countCall.init?.body));
  const dataPayload = JSON.parse(String(full.calls[2].init?.body));
  assert.deepEqual(countPayload, { period: dataPayload.period, filters: dataPayload.filters, aggregations: [{ function: "count", property: "time_entry_id" }] });
  assert.equal(full.calls.filter(call => call.url.includes("/query?")).length, 2);
  const complete = await run(query, { rows, total: 100 });
  assert.equal(complete.body.pagination.hasMore, false);
  const small = await run(query, { rows: rows.slice(0, 4) });
  assert.equal(small.body.timeEntries.length, 4);
  assert.equal(small.body.pagination.hasMore, false);
  assert.equal(small.calls.filter(call => call.url.includes("/query?")).length, 1);
});

test("unavailable counts retain loaded entries, while expired sessions and throttling retain their status", async () => {
  const query = "projects=5&from_date=2026-10-01&to_date=2026-10-31&limit=1";
  const fallback = await run(query, { countStatus: 500 });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.timeEntries.length, 1);
  assert.equal(fallback.body.pagination.hasMore, true);
  assert.equal(fallback.body.pagination.total, undefined);
  assert.equal((await run(query, { countStatus: 401 })).status, 401);
  assert.equal((await run(query, { countStatus: 429 })).status, 429);
});

test("mixed no-project and project selections preserve OR semantics and deduplicate filters", async () => {
  const result = await run("projects=none,5,5&tags=6,6&from_date=2026-10-01&to_date=2026-10-31");
  const payload = JSON.parse(String(result.calls[2].init?.body));
  assert.deepEqual(payload.filters[2], { operator: "and", conditions: [
    { operator: "or", conditions: [{ property: "project_id", operator: "in", value: [5] }, { property: "project_id", operator: "empty" }] },
    { property: "tag_ids", operator: "contains one of", value: [6] },
  ] });
});

test("invalid inputs fail before making upstream requests", async () => {
  const base = "q=x&from_date=2026-10-26&to_date=2026-11-01";
  for (const query of [base.replace("q=x", "q=%20"), base.replace("2026-11-01", "2026-02-30"), base.replace("2026-10-26", "2026-11-02"), "q=x", ...["page=-1", "page=1x", "page=1.5", "limit=0", "limit=101", "limit=NaN", "projects=0", "projects=9007199254740992", "tags=Infinity", "tags=9007199254740992"].map((value) => `${base}&${value}`)]) {
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
  assert.equal((await run("", { status: 402 })).status, 402);
  assert.equal((await run("", { status: 429 })).status, 429);
  assert.equal((await run("", { malformed: true })).status, 502);
});

test("ambiguous daylight-saving timestamps are resolved through the canonical entry", async () => {
  const result = await run("q=Planning&from_date=2026-10-26&to_date=2026-11-01", { rows: [[3, "Planning", "2026-11-01", "01:30:00", "01:31:31", 91000, null, []]] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 4);
  assert.equal(result.body.timeEntries[0].start, "2026-11-01T09:30:00.000Z");
  assert.equal(result.body.timeEntries[0].duration, 91);
});

test("advanced text operators are forwarded to Toggl, including value-free empty rules", async () => {
  for (const [match, operator] of [["not-contains", "not contains"], ["starts-with", "starts with"], ["ends-with", "ends with"], ["not-exact", "!="], ["empty", "empty"], ["not-empty", "not empty"]]) {
    const unary = match === "empty" || match === "not-empty";
    const result = await run(`match=${match}${unary ? "" : "&q=Planning"}&from_date=2026-10-01&to_date=2026-10-31`);
    assert.equal(result.status, 200, match);
    const payload = JSON.parse(String(result.calls[2].init?.body));
    assert.deepEqual(payload.filters[2], { operator: "and", conditions: [{ property: "description", operator, ...(unary ? {} : { value: "Planning" }) }] });
  }
});

test("OR applies only to user criteria; all tags, dates and authenticated scopes stay intact in data and count queries", async () => {
  const conditions = encodeURIComponent(JSON.stringify([{ match: "starts-with", text: "Planning" }, { match: "not-empty", text: "" }]));
  const result = await run(`q=Draft&match=not-contains&combine=or&conditions=${conditions}&projects=5,none&tags=6,7&from_date=2026-10-01&to_date=2026-10-31&limit=1`, { total: 10 });
  assert.equal(result.status, 200);
  const payload = JSON.parse(String(result.calls[2].init?.body));
  assert.deepEqual(payload.filters, [
    { property: "workspace_id", operator: "=", value: 2 },
    { property: "user_id", operator: "=", value: 1 },
    { operator: "or", conditions: [
      { property: "description", operator: "not contains", value: "Draft" },
      { property: "description", operator: "starts with", value: "Planning" },
      { property: "description", operator: "not empty" },
      { operator: "or", conditions: [{ property: "project_id", operator: "in", value: [5] }, { property: "project_id", operator: "empty" }] },
      { operator: "and", conditions: [{ property: "tag_ids", operator: "contains one of", value: [6] }, { property: "tag_ids", operator: "contains one of", value: [7] }] },
    ] },
  ]);
  const count = JSON.parse(String(result.calls.find(call => call.url.includes("response_format=json_row"))!.init?.body));
  assert.deepEqual(count.filters, payload.filters);
  assert.deepEqual(count.period, payload.period);
});

test("malformed or incomplete advanced rules fail before contacting Toggl", async () => {
  const base = "from_date=2026-10-01&to_date=2026-10-31";
  const invalid = ["match=not-contains", "match=starts-with", "match=unknown", "combine=x", "conditions={", ...[
    null, {}, [{ match: "phrase", text: "" }], [{ match: "unknown", text: "Planning" }],
    [{ match: "phrase", text: "Planning", property: "user_id" }],
    Array.from({ length: 9 }, () => ({ match: "exact", text: "Planning" })),
  ].map(value => `conditions=${encodeURIComponent(JSON.stringify(value))}`)];
  for (const query of invalid) {
    const result = await run(`${base}&${query}`);
    assert.equal(result.status, 400, query);
    assert.equal(result.calls.length, 0, query);
  }
});
