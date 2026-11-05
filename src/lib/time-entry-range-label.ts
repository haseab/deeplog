import { formatDateInTimeZone } from "./timezone";

export function formatTimeEntryRangeLabel(
  range: { start: Date; endExclusive: Date },
  timeZone: string,
): string {
  const dates = new Intl.DateTimeFormat("en-US", {
    timeZone, month: "short", day: "numeric", year: "numeric",
  });
  const times = new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit",
  });
  if (formatDateInTimeZone(range.start, timeZone) === formatDateInTimeZone(range.endExclusive, timeZone)) {
    return `${dates.format(range.start)} · ${times.formatRange(range.start, range.endExclusive)}`;
  }
  return `${dates.format(range.start)} · ${times.format(range.start)} – ${dates.format(range.endExclusive)} · ${times.format(range.endExclusive)}`;
}
