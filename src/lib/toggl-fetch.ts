import { logTogglUpstream, logTogglRequest, togglEndpoint, type TogglRequestDiagnostic } from "./toggl-request-diagnostics";
import { timelineSnapshots, togglCredential } from "./timeline-snapshots";
import { TogglMetadataCache } from "./toggl-metadata-cache";
import { TogglRateLimitError, retryAfterSeconds } from "./toggl-rate-limit";
import { randomUUID } from "node:crypto";
import { recordRefreshRequest } from "./refresh-timing-server";
import { setTimeout as delay } from "node:timers/promises";
import { TogglSessionBudget } from "./toggl-request-budget";

const TOGGL_HOSTS = new Set(["track.toggl.com", "api.track.toggl.com", "reports.api.track.toggl.com", "reports.toggl.com"]);

type Lane = {
  tail: Promise<void>; pending: number; nextStart: number; cooldownUntil: number;
  budget?: TogglSessionBudget; strikes: number; lastLimitedAt: number;
  quotas: Map<string, number>;
};

// The upstream quota is per organization or user. Workspace-to-organization
// mapping is not available here, so block only the scope actually observed.
function quotaScope(url: URL) {
  const workspace = url.pathname.match(/^\/api\/v9\/workspaces\/(\d+)(?:\/|$)/);
  if (workspace) return `workspace:${workspace[1]}`;
  const organization = url.pathname.match(/\/(?:api\/v9|analytics\/api)\/organizations\/(\d+)(?:\/|$)/);
  return organization ? `organization:${organization[1]}` : "user";
}

function numericHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
}

async function waitForTurn(previous: Promise<void>, signal?: AbortSignal | null) {
  if (!signal) return previous;
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    void previous.then(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    });
  });
}

/** Per-credential serialization, burst budget and upstream backoff. Never retries a write. */
export class TogglRequestQueue {
  private lanes = new Map<string, Lane>();

  // Explicit spacing/cooldown overrides also support isolated transport tests.
  constructor(private readonly spacingMs?: number, private readonly cooldownMs?: number) {}

  async fetch(input: string | URL | Request, init?: RequestInit, metrics?: { requestId?: string; queueWaitMs: number; networkMs: number; upstream: boolean }): Promise<Response> {
    const queuedAt = Date.now();
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    // Keep unrelated services (e.g. transcription providers) outside this queue.
    if (!TOGGL_HOSTS.has(url.hostname)) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers ?? request?.headers);
    const session = /^Bearer\s+\S/i.test(headers.get("authorization") ?? "");
    const spacingMs = this.spacingMs ?? (session ? 0 : 1100);
    const key = togglCredential(headers.get("authorization") ?? "anonymous");
    const signal = init?.signal ?? request?.signal;
    signal?.throwIfAborted();
    // Evict idle lanes without retaining credentials or per-user timers.
    const now = Date.now();
    for (const [id, lane] of this.lanes) {
      for (const [scope, until] of lane.quotas) if (until <= now) lane.quotas.delete(scope);
      if (!lane.pending && Math.max(lane.nextStart, lane.cooldownUntil, ...lane.quotas.values()) + 600_000 < now) this.lanes.delete(id);
    }
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { tail: Promise.resolve(), pending: 0, nextStart: 0, cooldownUntil: 0,
        budget: session && this.spacingMs === undefined ? new TogglSessionBudget() : undefined,
        strikes: 0, lastLimitedAt: 0, quotas: new Map() };
      this.lanes.set(key, lane);
    }
    const rateLimited = () => Response.json(
      { error: "Toggl is rate limiting requests. Please wait before retrying." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((lane.cooldownUntil - Date.now()) / 1000))) } },
    );
    const scope = quotaScope(url);
    const quotaLimited = () => {
      const remaining = Math.max(1, Math.ceil(((lane.quotas.get(scope) ?? 0) - Date.now()) / 1000));
      return Response.json({ error: "Toggl's API quota is exhausted. Please wait before retrying." }, {
        status: 402, headers: { "Retry-After": String(remaining),
          "X-Toggl-Quota-Remaining": "0", "X-Toggl-Quota-Resets-In": String(remaining) },
      });
    };
    // Fail locally during cooldown, rather than holding HTTP requests open for minutes.
    if ((lane.quotas.get(scope) ?? 0) > now) return quotaLimited();
    if (lane.cooldownUntil > now) return rateLimited();
    const previous = lane.tail;
    let release!: () => void;
    lane.tail = new Promise<void>(resolve => { release = resolve; });
    lane.pending++;
    try {
      // Cancellation must not release a slot before its predecessor finishes.
      await waitForTurn(previous, signal);
      signal?.throwIfAborted();
      if ((lane.quotas.get(scope) ?? 0) > Date.now()) return quotaLimited();
      if (lane.cooldownUntil > Date.now()) return rateLimited();
      while (lane.nextStart > Date.now()) {
        await delay(lane.nextStart - Date.now(), undefined, { signal: signal ?? undefined });
      }
      signal?.throwIfAborted();
      if (lane.budget) {
        let waitMs: number;
        while ((waitMs = lane.budget.take()) > 0) {
          await delay(waitMs, undefined, { signal: signal ?? undefined });
          signal?.throwIfAborted();
        }
      }
      lane.nextStart = Date.now() + spacingMs;
      const networkStarted = Date.now();
      if (metrics) { metrics.queueWaitMs = networkStarted - queuedAt; metrics.upstream = true; }
      let response: Response | undefined;
      try { response = await fetch(input, init); }
      finally {
        const networkMs = Date.now() - networkStarted;
        if (metrics) metrics.networkMs = networkMs;
        logTogglUpstream({ requestId: metrics?.requestId ?? randomUUID(), method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
          endpoint: togglEndpoint(url), queueWaitMs: networkStarted - queuedAt, networkMs,
          status: response?.status, outcome: response ? "completed" : signal?.aborted ? "aborted" : "failed" });
      }
      const quotaRemaining = numericHeader(response.headers, "X-Toggl-Quota-Remaining");
      const quotaReset = numericHeader(response.headers, "X-Toggl-Quota-Resets-In");
      // A generic payment/feature 402 without quota evidence is not throttling.
      if (quotaRemaining === 0 || (response.status === 402 && quotaRemaining === undefined && quotaReset !== undefined)) {
        lane.quotas.set(scope, Date.now() + Math.max(1, quotaReset ?? 3600) * 1000);
        if (response.status === 402) {
          await response.body?.cancel();
          return quotaLimited();
        }
      }
      if (response.status === 429) {
        const limitedAt = Date.now();
        lane.strikes = limitedAt - lane.lastLimitedAt >= 60_000 ? 1 : lane.strikes + 1;
        lane.lastLimitedAt = limitedAt;
        const base = this.cooldownMs ?? (session ? 1000 : 120_000);
        const fallback = Math.min(Math.max(base, 30_000), base * 2 ** Math.min(lane.strikes - 1, 10));
        const seconds = retryAfterSeconds(response.headers.get("Retry-After"), fallback / 1000);
        lane.cooldownUntil = limitedAt + seconds * 1000;
        lane.budget?.drain();
      }
      if (response.status === 429) {
        const headers = new Headers(response.headers);
        headers.set("Retry-After", String(Math.max(1, Math.ceil((lane.cooldownUntil - Date.now()) / 1000))));
        return new Response(response.body, { status: 429, headers });
      }
      return response;
    } finally {
      lane.pending--;
      // An aborted waiter must leave its place reserved until earlier work ends.
      void previous.then(release);
    }
  }
}

/** Stable metadata is shared for five minutes; entry and conflict reads stay fresh. */
export function createTogglFetch(
  queue: TogglRequestQueue,
  metadata = new TogglMetadataCache(),
  log: (event: TogglRequestDiagnostic) => void = logTogglRequest,
) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const started = Date.now();
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const credential = togglCredential(headers.get("authorization") ?? "anonymous");
    const signal = init?.signal ?? request?.signal;
    const isToggl = TOGGL_HOSTS.has(url.hostname);
    const event: TogglRequestDiagnostic = {
      requestId: randomUUID(), method, endpoint: togglEndpoint(url), cache: "bypass",
      upstream: false, queueWaitMs: 0, networkMs: 0, durationMs: 0, outcome: "failed",
    };
    try {
      signal?.throwIfAborted();
      const metadataPath = /^\/api\/v9\/(?:me|workspaces(?:\/\d+\/(?:projects|tags))?)$/.test(url.pathname);
      const cacheable = isToggl && method === "GET" && metadataPath;
      const response = cacheable
        ? await metadata.get(`${credential}:${url.href}`, () => queue.fetch(input, {
            ...init, headers, signal: AbortSignal.timeout(15_000),
          }, event), signal, state => { event.cache = state; })
        : await queue.fetch(input, init, event);
      event.status = response.status;
      event.outcome = "completed";
      if (isToggl) {
        if (response.status === 401) {
          metadata.invalidate(credential);
          timelineSnapshots.invalidate(credential);
        } else if (response.ok && method !== "GET" && /^\/api\/v9\/workspaces\/\d+\/(?:projects|tags|time_entries)(?:\/|$)/.test(url.pathname)) {
          // Entry writes cannot invalidate profile/workspace/project/tag metadata.
          const metadataWrite = url.pathname.match(/^(\/api\/v9\/workspaces\/\d+\/(?:projects|tags))(?:\/|$)/);
          if (metadataWrite) metadata.invalidate(credential, metadataWrite[1]);
          timelineSnapshots.invalidate(credential);
        }
        if (response.status === 429) throw new TogglRateLimitError(retryAfterSeconds(response.headers.get("Retry-After")));
        if (response.status === 402 && response.headers.get("X-Toggl-Quota-Remaining") === "0") {
          throw new TogglRateLimitError(retryAfterSeconds(response.headers.get("Retry-After")), "quota");
        }
      }
      return response;
    } catch (error) {
      if (signal?.aborted) event.outcome = "aborted";
      throw error;
    } finally {
      event.durationMs = Date.now() - started;
      if (!event.upstream && (event.cache === "miss" || event.cache === "bypass")) event.queueWaitMs = event.durationMs;
      if (isToggl) {
        try { recordRefreshRequest(event); } catch { /* Timing cannot block requests. */ }
        try { log({ ...event }); } catch { /* Telemetry cannot block requests. */ }
      }
    }
  };
}

// Next route bundles share these process-wide instances, including background jobs.
const shared = globalThis as typeof globalThis & {
  deeplogTogglQueue?: TogglRequestQueue;
  deeplogTogglMetadata?: TogglMetadataCache;
};
export const togglFetch = createTogglFetch(
  shared.deeplogTogglQueue ??= new TogglRequestQueue(),
  shared.deeplogTogglMetadata ??= new TogglMetadataCache(),
);
