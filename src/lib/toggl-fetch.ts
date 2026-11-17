import { logTogglUpstream, logTogglRequest, togglEndpoint, type TogglRequestDiagnostic } from "./toggl-request-diagnostics";
import { timelineSnapshots, togglCredential } from "./timeline-snapshots";
import { TogglMetadataCache } from "./toggl-metadata-cache";
import { TogglRateLimitError, retryAfterSeconds } from "./toggl-rate-limit";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const TOGGL_HOSTS = new Set(["track.toggl.com", "api.track.toggl.com", "reports.api.track.toggl.com", "reports.toggl.com"]);

type Lane = { tail: Promise<void>; pending: number; nextStart: number; cooldownUntil: number };

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

/** Server-side, per-credential semaphore plus start-rate limiter. Never retries a write. */
export class TogglRequestQueue {
  private lanes = new Map<string, Lane>();

  constructor(private readonly spacingMs = 1100, private readonly cooldownMs = 120_000) {}

  async fetch(input: string | URL | Request, init?: RequestInit, metrics?: { requestId?: string; queueWaitMs: number; networkMs: number; upstream: boolean }): Promise<Response> {
    const queuedAt = Date.now();
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    // Keep unrelated services (e.g. transcription providers) outside this queue.
    if (!TOGGL_HOSTS.has(url.hostname)) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers ?? request?.headers);
    const key = togglCredential(headers.get("authorization") ?? "anonymous");
    const signal = init?.signal ?? request?.signal;
    signal?.throwIfAborted();
    // Evict idle lanes without retaining credentials or per-user timers.
    const now = Date.now();
    for (const [id, lane] of this.lanes) {
      if (!lane.pending && Math.max(lane.nextStart, lane.cooldownUntil) + 600_000 < now) this.lanes.delete(id);
    }
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { tail: Promise.resolve(), pending: 0, nextStart: 0, cooldownUntil: 0 };
      this.lanes.set(key, lane);
    }
    const rateLimited = () => Response.json(
      { error: "Toggl is rate limiting requests. Please wait before retrying." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((lane.cooldownUntil - Date.now()) / 1000))) } },
    );
    // Fail locally during cooldown, rather than holding HTTP requests open for minutes.
    if (lane.cooldownUntil > now) return rateLimited();
    const previous = lane.tail;
    let release!: () => void;
    lane.tail = new Promise<void>(resolve => { release = resolve; });
    lane.pending++;
    try {
      // Cancellation must not release a slot before its predecessor finishes.
      await waitForTurn(previous, signal);
      signal?.throwIfAborted();
      if (lane.cooldownUntil > Date.now()) return rateLimited();
      while (lane.nextStart > Date.now()) {
        await delay(lane.nextStart - Date.now(), undefined, { signal: signal ?? undefined });
      }
      signal?.throwIfAborted();
      lane.nextStart = Date.now() + this.spacingMs;
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
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const retryAt = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(retryAfter ?? "");
        lane.cooldownUntil = Math.max(Date.now() + this.cooldownMs, Number.isFinite(retryAt) ? retryAt : 0);
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
      }
      return response;
    } catch (error) {
      if (signal?.aborted) event.outcome = "aborted";
      throw error;
    } finally {
      event.durationMs = Date.now() - started;
      if (!event.upstream && (event.cache === "miss" || event.cache === "bypass")) event.queueWaitMs = event.durationMs;
      if (isToggl) { try { log({ ...event }); } catch { /* Telemetry cannot block requests. */ } }
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
