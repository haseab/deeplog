import { TogglRateLimitError, retryAfterSeconds } from "./toggl-rate-limit";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const TOGGL_HOSTS = new Set(["track.toggl.com", "api.track.toggl.com", "reports.api.track.toggl.com"]);

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

  async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    // Keep unrelated services (e.g. transcription providers) outside this queue.
    if (!TOGGL_HOSTS.has(url.hostname)) {
      return fetch(input, init);
    }
    const headers = new Headers(init?.headers ?? request?.headers);
    const key = createHash("sha256").update(headers.get("authorization") ?? "anonymous").digest("hex");
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
      const response = await fetch(input, init);
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

// Next route bundles share this process-wide queue, including background jobs.
const shared = globalThis as typeof globalThis & { deeplogTogglQueue?: TogglRequestQueue };
const queue = shared.deeplogTogglQueue ??= new TogglRequestQueue();
export async function togglFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await queue.fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (response.status === 429 && TOGGL_HOSTS.has(url.hostname)) throw new TogglRateLimitError(retryAfterSeconds(response.headers.get("Retry-After")));
  return response;
}
