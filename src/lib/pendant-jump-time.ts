import * as chrono from "chrono-node";

// Clock-only queries belong to the days being viewed, rather than today.
export function parsePendantJumpTimes(
  input: string,
  loadedTimes: Date[],
  now = new Date()
): Date[] {
  const query = input.trim().replace(/\b([ap])\s*\.?\s*m\.?/gi, "$1m");
  if (!query) return [];

  const days = Array.from(new Map(loadedTimes.map((time) => [
    `${time.getFullYear()}-${time.getMonth()}-${time.getDate()}`,
    time,
  ])).values());
  const clock = query.match(/^(?:at\s+)?(\d{1,2})(?::(\d{2})(?::(\d{2}))?)?\s*(am|pm)?$/i);
  const compact = query.match(/^(\d{1,2})(\d{2})\s*(am|pm)?$/i);
  if (clock || compact) {
    const hourText = (clock ?? compact)![1];
    let hour = Number(hourText);
    const minute = Number((clock ?? compact)![2] ?? 0);
    const second = Number(clock?.[3] ?? 0);
    const meridiem = (clock?.[4] ?? compact?.[3])?.toLowerCase();
    if (minute > 59 || second > 59 || hour > (meridiem ? 12 : 23) || (meridiem && hour < 1)) return [];
    if (meridiem) hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
    const hours = [hour];
    // Bare 1–12 can mean either half of the day; leading zeros and compact
    // military times are unambiguous. Include both interpretations of 12.
    if (!meridiem && !compact && !hourText.startsWith("0") && hour >= 1 && hour <= 12) {
      hours.push(hour === 12 ? 0 : hour + 12);
    }
    return days.flatMap((day) => hours.map((h) => {
      const time = new Date(day);
      time.setHours(h, minute, second, 0);
      return time;
    }));
  }

  const parsed = chrono.parse(query, now, { forwardDate: false })[0];
  if (!parsed || !parsed.start.isCertain("hour")) return [];
  const expandMeridiem = (result: typeof parsed) => {
    const time = result.start.date();
    const hour = time.getHours();
    if (result.start.isCertain("meridiem") || /\b(noon|midnight|ago|from now)\b/i.test(query) || hour < 1 || hour > 12) return [time];
    const alternate = new Date(time);
    alternate.setHours(hour === 12 ? 0 : hour + 12);
    return [time, alternate];
  };
  const hasDate = (["year", "month", "day"] as const).some((part) => parsed.start.isCertain(part));
  if (hasDate || /\b(ago|yesterday|today|tomorrow|last|next|from now)\b/i.test(query)) {
    return expandMeridiem(parsed);
  }
  return days.flatMap((day) => {
    const result = chrono.parse(query, day, { forwardDate: false })[0];
    return result ? expandMeridiem(result) : [];
  });
}
