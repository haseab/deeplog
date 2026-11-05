import { addCalendarDays, isValidTimeZone, wallTimeToUtc } from "./timezone";

const calendarDate = /^\d{4}-\d{2}-\d{2}$/;
const dateTime = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

function parseBoundary(value: string, timeZone: string, isEnd: boolean): Date | null {
  if (calendarDate.test(value)) {
    // Validate before advancing the inclusive end date to the next midnight.
    const midnight = wallTimeToUtc(value, "00:00:00", timeZone, "earlier");
    return midnight && isEnd
      ? wallTimeToUtc(addCalendarDays(value, 1), "00:00:00", timeZone, "earlier")
      : midnight;
  }

  const match = dateTime.exec(value);
  if (!match) return null;
  const [, date, time, seconds = "00", fraction = "", offset] = match;
  const wallTime = `${time}:${seconds}`;

  if (offset) {
    // Date.parse normalizes some impossible calendar dates, so validate the
    // wall-clock fields first. An explicit offset disambiguates DST repeats.
    if (!wallTimeToUtc(date, wallTime, "UTC")) return null;
    const instant = new Date(`${date}T${wallTime}${fraction}${offset}`);
    return Number.isFinite(instant.getTime()) ? instant : null;
  }

  // Offset-free values follow the table's timezone, never the server's zone.
  // Reject nonexistent or repeated local times; an offset resolves repeats.
  const instant = wallTimeToUtc(date, wallTime, timeZone);
  return instant
    ? new Date(instant.getTime() + Number(`0${fraction}`) * 1000)
    : null;
}

/** Date-only ends include the entire day; datetime ends are exclusive. */
export function parseTimeEntryRange(
  from: string | null,
  to: string | null,
  timeZone: string
): { start: Date; endExclusive: Date } | null {
  if (!from || !to || !isValidTimeZone(timeZone)) return null;
  const start = parseBoundary(from, timeZone, false);
  const endExclusive = parseBoundary(to, timeZone, true);
  return start && endExclusive && endExclusive > start
    ? { start, endExclusive }
    : null;
}
