import { createHash, randomUUID } from "node:crypto";

export type TimelineData = {
  timeEntries: unknown[];
  projects: unknown[];
  tags: unknown[];
  profileTimeZone: string;
  displayTimeZone: string;
};

export function togglCredential(authorization: string): string {
  return createHash("sha256").update(authorization).digest("hex");
}

/** Pagination reuses an explicit range snapshot; refresh always creates a new one. */
export class TimelineSnapshots {
  private entries = new Map<string, { credential: string; scope: string; expiresAt: number; data: TimelineData }>();
  private epoch = 0;
  constructor(private readonly ttlMs = 300_000, private readonly limit = 32) {}
  generation() { return this.epoch; }
  invalidate(credential: string) {
    this.epoch++;
    for (const [id, entry] of this.entries) if (entry.credential === credential) this.entries.delete(id);
  }
  get(id: string, credential: string, scope: string): TimelineData | undefined {
    const entry = this.entries.get(id);
    if (entry && entry.expiresAt <= Date.now()) this.entries.delete(id);
    return entry && entry.expiresAt > Date.now() && entry.credential === credential && entry.scope === scope ? entry.data : undefined;
  }
  put(credential: string, scope: string, data: TimelineData, generation: number): string | undefined {
    // A write during the load makes it unsafe to reuse this result later.
    if (generation !== this.epoch) return undefined;
    for (const [id, entry] of this.entries) if (entry.expiresAt <= Date.now()) this.entries.delete(id);
    const id = randomUUID();
    this.entries.set(id, { credential, scope, data, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return id;
  }
}

export function timelinePage(data: TimelineData, page: number, limit: number, snapshot?: string) {
  const end = (page + 1) * limit;
  return {
    ...data, timeEntries: data.timeEntries.slice(page * limit, end),
    pagination: { page, limit, total: data.timeEntries.length, hasMore: end < data.timeEntries.length },
    ...(snapshot ? { snapshot } : {}), syncStatus: "synced",
  };
}
const shared = globalThis as typeof globalThis & { deeplogTimelineSnapshots?: TimelineSnapshots };
export const timelineSnapshots = shared.deeplogTimelineSnapshots ??= new TimelineSnapshots();
