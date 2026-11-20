/** Shared HTTP contract; safe to import in both server and browser bundles. */
export const TOGGL_RATE_LIMIT_CODE = "TOGGL_RATE_LIMITED";
export const TOGGL_RATE_LIMIT_MESSAGE = "Toggl is rate limiting requests. Please wait before retrying.";
export const TOGGL_QUOTA_LIMIT_CODE = "TOGGL_QUOTA_EXHAUSTED";

export function retryAfterSeconds(value: string | null, fallback = 120, now = Date.now()): number {
  if (!value?.trim()) return fallback;
  const seconds = Number(value);
  const remaining = Number.isFinite(seconds) ? seconds : (Date.parse(value) - now) / 1000;
  return Number.isFinite(remaining) && remaining >= 0 ? Math.max(1, Math.ceil(remaining)) : fallback;
}

export class TogglRateLimitError extends Error {
  readonly status: 402 | 429;
  readonly code: string;
  readonly retryAt: number;

  constructor(readonly retryAfter: number, readonly reason: "rate" | "quota" = "rate") {
    super(reason === "quota" ? "Toggl's API quota is exhausted. Please wait before retrying." : TOGGL_RATE_LIMIT_MESSAGE);
    this.status = reason === "quota" ? 402 : 429;
    this.code = reason === "quota" ? TOGGL_QUOTA_LIMIT_CODE : TOGGL_RATE_LIMIT_CODE;
    this.name = "TogglRateLimitError";
    this.retryAt = Date.now() + retryAfter * 1000;
  }

  response(extraHeaders?: HeadersInit): Response {
    const headers = new Headers(extraHeaders);
    headers.set("Retry-After", String(this.retryAfter));
    headers.set("Cache-Control", "no-store");
    return Response.json({ error: this.message, code: this.code, status: this.status, retryAfter: this.retryAfter, isSessionExpired: false }, { status: this.status, headers });
  }
}
