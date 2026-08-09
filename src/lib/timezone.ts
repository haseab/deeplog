export type TimeZoneMode = "device" | "profile";
export type WallTimeDisambiguation = "earlier" | "later" | "reject";

export type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    getPartsFormatter(timeZone).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function getDeviceTimeZone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(detected) ? detected : "UTC";
}

export function getZonedParts(
  instant: string | number | Date,
  timeZone: string
): ZonedDateTimeParts {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid instant");

  const values = Object.fromEntries(
    getPartsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, "0");
}

export function formatDateInTimeZone(
  instant: string | number | Date,
  timeZone: string
): string {
  const parts = getZonedParts(instant, timeZone);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatTimeInTimeZone(
  instant: string | number | Date,
  timeZone: string,
  options: { seconds?: boolean; compact?: boolean } = {}
): string {
  const parts = getZonedParts(instant, timeZone);
  const suffix = parts.hour >= 12 ? "pm" : "am";
  const hour = parts.hour % 12 || 12;
  const minute = pad(parts.minute);
  const seconds = options.seconds ? `:${pad(parts.second)}` : "";
  const spacer = options.compact ? "" : " ";
  return `${hour}:${minute}${seconds}${spacer}${suffix}`;
}

export function formatDateTimeInTimeZone(
  instant: string | number | Date,
  timeZone: string,
  options: { seconds?: boolean } = {}
): string {
  return `${formatDateInTimeZone(instant, timeZone)} ${formatTimeInTimeZone(
    instant,
    timeZone,
    { seconds: options.seconds, compact: true }
  )}`;
}

export function addCalendarDays(dateString: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) throw new Error("Invalid calendar date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + amount);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

function parseWallTime(dateString: string, timeString: string): ZonedDateTimeParts | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeString);
  if (!dateMatch || !timeMatch) return null;

  const parts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] || 0),
  };
  if (
    parts.month < 1 || parts.month > 12 ||
    parts.day < 1 || parts.day > 31 ||
    parts.hour < 0 || parts.hour > 23 ||
    parts.minute < 0 || parts.minute > 59 ||
    parts.second < 0 || parts.second > 59
  ) return null;

  const validation = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    validation.getUTCFullYear() !== parts.year ||
    validation.getUTCMonth() + 1 !== parts.month ||
    validation.getUTCDate() !== parts.day
  ) return null;

  return parts;
}

function partsEqual(a: ZonedDateTimeParts, b: ZonedDateTimeParts): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day &&
    a.hour === b.hour && a.minute === b.minute && a.second === b.second;
}

function offsetAt(instantMs: number, timeZone: string): number {
  const parts = getZonedParts(instantMs, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return representedAsUtc - Math.floor(instantMs / 1000) * 1000;
}

export function wallTimeToUtcCandidates(
  dateString: string,
  timeString: string,
  timeZone: string
): Date[] {
  if (!isValidTimeZone(timeZone)) return [];
  const wall = parseWallTime(dateString, timeString);
  if (!wall) return [];

  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second
  );
  const sampleHours = [-48, -24, -12, 0, 12, 24, 48];
  const offsets = new Set(sampleHours.map((hours) =>
    offsetAt(wallAsUtc + hours * 60 * 60 * 1000, timeZone)
  ));

  return Array.from(offsets)
    .map((offset) => new Date(wallAsUtc - offset))
    .filter((candidate) => partsEqual(getZonedParts(candidate, timeZone), wall))
    .sort((a, b) => a.getTime() - b.getTime());
}

export function wallTimeToUtc(
  dateString: string,
  timeString: string,
  timeZone: string,
  disambiguation: WallTimeDisambiguation = "reject"
): Date | null {
  const candidates = wallTimeToUtcCandidates(dateString, timeString, timeZone);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (disambiguation === "earlier") return candidates[0];
  if (disambiguation === "later") return candidates[candidates.length - 1];
  return null;
}

export function calendarRangeToUtc(
  fromDate: string,
  toDate: string,
  timeZone: string
): { start: Date; endExclusive: Date } | null {
  const start = wallTimeToUtc(fromDate, "00:00:00", timeZone, "earlier");
  const endExclusive = wallTimeToUtc(
    addCalendarDays(toDate, 1),
    "00:00:00",
    timeZone,
    "earlier"
  );
  return start && endExclusive ? { start, endExclusive } : null;
}

export function intervalsOverlap(
  entryStart: string | Date,
  entryStop: string | Date | null | undefined,
  rangeStart: Date,
  rangeEndExclusive: Date
): boolean {
  const startMs = new Date(entryStart).getTime();
  const stopMs = entryStop ? new Date(entryStop).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(startMs) && startMs < rangeEndExclusive.getTime() && stopMs > rangeStart.getTime();
}
