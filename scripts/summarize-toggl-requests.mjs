import { readFileSync } from "node:fs";

// Pipe hosting logs in; the report contains only endpoint labels and numeric metrics.
const lines = readFileSync(process.argv[2] ?? 0, "utf8").split("\n");
const groups = new Map();
const endpoints = new Set([
  "/api/v9/me", "/api/v9/workspaces", "/api/v9/me/time_entries", "/api/v9/me/time_entries/current", "/api/v9/me/time_entries/:id",
  ...["projects", "tags", "time_entries"].flatMap(resource => [
    `/api/v9/workspaces/:id/${resource}`, `/api/v9/workspaces/:id/${resource}/:id`, `/api/v9/workspaces/:id/${resource}/:id/stop`,
  ]), "/analytics/api/organizations/:id/query", "other",
]);
for (const line of lines) {
  let text = line;
  try { const outer = JSON.parse(line); text = outer.msg ?? outer.message ?? line; } catch { /* Plain console line. */ }
  if (typeof text !== "string") continue;
  const match = text.match(/\[toggl-(request|upstream)\]\s+(\{.*\})/);
  if (!match) continue;
  try {
    const event = JSON.parse(match[2]);
    const endpoint = endpoints.has(event.endpoint) ? event.endpoint : "other";
    const method = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(event.method) ? event.method : "OTHER";
    const key = `${method} ${endpoint}`;
    if (!groups.has(key)) groups.set(key, { endpoint: key, requests: 0, cacheHits: 0, sharedReads: 0, upstreamCalls: 0, upstreamErrors: 0, waits: [], networks: [] });
    const group = groups.get(key);
    if (match[1] === "request") {
      group.requests++;
      if (event.cache === "hit") group.cacheHits++;
      if (event.cache === "shared") group.sharedReads++;
    } else {
      group.upstreamCalls++;
      if (event.status >= 400 || event.outcome !== "completed") group.upstreamErrors++;
      if (Number.isFinite(event.queueWaitMs)) group.waits.push(event.queueWaitMs);
      if (Number.isFinite(event.networkMs)) group.networks.push(event.networkMs);
    }
  } catch { /* Ignore unrelated/malformed log lines. */ }
}
const p95 = values => values.sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
const report = [...groups.values()].map(({ waits, networks, ...group }) => ({ ...group, p95QueueWaitMs: p95(waits), p95NetworkMs: p95(networks) })).sort((a, b) => b.upstreamCalls - a.upstreamCalls);
console.log(JSON.stringify({ upstreamCalls: report.reduce((n, row) => n + row.upstreamCalls, 0), endpoints: report }, null, 2));
