export type AnalyticsEntry = { start: string; stop?: string | null };
export function analyticsRange(entry: AnalyticsEntry, now = Date.now()) {
  const start = Date.parse(entry.start),
    end = entry.stop ? Date.parse(entry.stop) : now;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 31 * 86400000
  )
    throw new Error("Choose an entry with a valid time range of up to 31 days.");
  return { start, end };
}
