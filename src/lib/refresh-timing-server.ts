import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { isRefreshRequestId } from "./refresh-timing-data";
import type { TogglRequestDiagnostic } from "./toggl-request-diagnostics";

type Phase = { calls: number; hits: number; shared: number; upstream: number; errors: number; queueWaitMs: number; networkMs: number; durationMs: number };
const timing = new AsyncLocalStorage<Map<string, Phase>>();

function phaseFor(endpoint: string) {
  if (endpoint === "/api/v9/me") return "profile";
  if (endpoint === "/api/v9/workspaces") return "workspaces";
  if (endpoint.endsWith("/projects")) return "projects";
  if (endpoint.endsWith("/tags")) return "tags";
  if (endpoint.endsWith("/current")) return "current";
  if (endpoint.startsWith("/analytics/")) return "analytics";
  return "other";
}

/** Called by the existing request diagnostics; no second network request or raw data. */
export function recordRefreshRequest(event: TogglRequestDiagnostic) {
  const phases = timing.getStore();
  if (!phases) return;
  const name = phaseFor(event.endpoint);
  const phase = phases.get(name) ?? { calls: 0, hits: 0, shared: 0, upstream: 0, errors: 0, queueWaitMs: 0, networkMs: 0, durationMs: 0 };
  phase.calls++;
  phase.hits += Number(event.cache === "hit");
  phase.shared += Number(event.cache === "shared");
  phase.upstream += Number(event.upstream);
  phase.errors += Number(event.outcome !== "completed" || (event.status ?? 500) >= 400);
  phase.queueWaitMs += event.queueWaitMs;
  phase.networkMs += event.networkMs;
  phase.durationMs += event.durationMs;
  phases.set(name, phase);
}

export async function withRefreshTiming(request: Request, load: () => Promise<Response>): Promise<Response> {
  const incoming = request.headers.get("x-deeplog-refresh-id");
  const requestId = isRefreshRequestId(incoming) ? incoming : randomUUID();
  const phases = new Map<string, Phase>();
  const started = performance.now();
  let response: Response | undefined;
  try {
    response = await timing.run(phases, load);
    const durationMs = performance.now() - started;
    response.headers.set("x-deeplog-refresh-id", requestId);
    response.headers.set("Server-Timing", [
      `dl_api;dur=${durationMs.toFixed(1)}`,
      ...Array.from(phases, ([name, phase]) => `dl_${name};dur=${phase.durationMs.toFixed(1)}`),
      `dl_queue;dur=${Array.from(phases.values()).reduce((sum, phase) => sum + phase.queueWaitMs, 0).toFixed(1)}`,
      `dl_network;dur=${Array.from(phases.values()).reduce((sum, phase) => sum + phase.networkMs, 0).toFixed(1)}`,
    ].join(", "));
    return response;
  } finally {
    try {
      console.info("[deeplog-refresh-backend]", JSON.stringify({
        requestId, status: response?.status, outcome: response ? "completed" : "failed",
        durationMs: Math.round(performance.now() - started), phases: Object.fromEntries(phases),
      }));
    } catch { /* Diagnostics cannot break a refresh. */ }
  }
}
