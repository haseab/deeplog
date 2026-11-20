export const TOGGL_SESSION_BURST = 8;
export const TOGGL_SESSION_REQUESTS_PER_SECOND = 3;

/** A token bucket: bursts are immediate; only exhausted budgets have to wait. */
export class TogglSessionBudget {
  private tokens = TOGGL_SESSION_BURST;

  constructor(private updatedAt = performance.now()) {}

  /** Consume one token, or return the milliseconds until one is available. */
  take(now = performance.now()): number {
    this.tokens = Math.min(TOGGL_SESSION_BURST,
      this.tokens + Math.max(0, now - this.updatedAt) * TOGGL_SESSION_REQUESTS_PER_SECOND / 1000);
    this.updatedAt = Math.max(this.updatedAt, now);
    if (this.tokens < 1) return Math.ceil((1 - this.tokens) * 1000 / TOGGL_SESSION_REQUESTS_PER_SECOND);
    this.tokens--;
    return 0;
  }

  drain(now = performance.now()) {
    this.tokens = 0;
    this.updatedAt = now;
  }
}
