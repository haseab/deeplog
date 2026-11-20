import { toast } from "./toast";
import { TOGGL_RATE_LIMIT_CODE, TOGGL_QUOTA_LIMIT_CODE, TogglRateLimitError, retryAfterSeconds } from "./toggl-rate-limit";

const cooldowns = new Map<string, number>();
let notifiedUntil = 0;
export function togglRetryAt(sessionToken: string) { return cooldowns.get(sessionToken) ?? 0; }

/** Keep rate-limit feedback consistent even when a caller uses a generic error message. */
export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 429 && response.status !== 402) return response;
  const data = await response.clone().json().catch(() => null);
  // Do not mislabel another provider's rate limit as a Toggl failure.
  const quota = response.status === 402 && data?.code === TOGGL_QUOTA_LIMIT_CODE;
  if (!quota && !(response.status === 429 && data?.code === TOGGL_RATE_LIMIT_CODE)) return response;
  const error = new TogglRateLimitError(retryAfterSeconds(response.headers.get("Retry-After")), quota ? "quota" : "rate");
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const token = headers.get("x-toggl-session-token");
  const now = Date.now();
  for (const [key, until] of cooldowns) if (until <= now) cooldowns.delete(key);
  if (token) cooldowns.set(token, Math.max(togglRetryAt(token), error.retryAt));
  if (now >= notifiedUntil) {
    const url = input instanceof Request ? input.url : String(input);
    const draft = /\/api\/time-entries\/\d+\/description(?:\?|$)/.test(url);
    toast.error(`${quota ? "Toggl's API quota is exhausted." : "Toggl is rate limiting requests."} Try again in ${error.retryAfter} seconds.`, {
      id: "toggl-rate-limit", duration: 8000,
      description: draft ? "Your description draft is saved locally. Sync will retry automatically." : undefined,
    });
    notifiedUntil = error.retryAt;
  }
  throw error;
}
