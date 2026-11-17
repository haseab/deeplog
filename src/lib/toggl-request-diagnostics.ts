/** Fixed endpoint labels only: never log credentials, query strings, IDs or bodies. */
export type TogglRequestDiagnostic = {
  requestId: string;
  method: string;
  endpoint: string;
  cache: "hit" | "shared" | "miss" | "bypass";
  upstream: boolean;
  queueWaitMs: number;
  networkMs: number;
  durationMs: number;
  status?: number;
  outcome: "completed" | "aborted" | "failed";
};

export function togglEndpoint(url: URL): string {
  if (/^\/api\/v9\/me(?:\/time_entries(?:\/(?:current|\d+))?)?$/.test(url.pathname) ||
      /^\/api\/v9\/workspaces(?:\/\d+\/(?:projects|tags|time_entries)(?:\/\d+(?:\/stop)?)?)?$/.test(url.pathname) ||
      /^\/analytics\/api\/organizations\/\d+\/query$/.test(url.pathname)) {
    return url.pathname.replace(/\/\d+(?=\/|$)/g, "/:id");
  }
  return "other";
}

export function logTogglRequest(event: TogglRequestDiagnostic): void {
  try { console.info("[toggl-request]", JSON.stringify(event)); } catch { /* Logging must not affect requests. */ }
}

export type TogglUpstreamDiagnostic = Pick<TogglRequestDiagnostic, "requestId" | "method" | "endpoint" | "queueWaitMs" | "networkMs" | "status" | "outcome">;
export function logTogglUpstream(event: TogglUpstreamDiagnostic): void {
  try { console.info("[toggl-upstream]", JSON.stringify(event)); } catch { /* Best effort. */ }
}
