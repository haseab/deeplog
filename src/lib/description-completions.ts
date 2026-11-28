import { fuzzyMatch, getRecentTimers, type RecentTimerEntry } from "./recent-timers-cache";

import { descriptionItems, descriptionItemStart, readItems } from "./description-item-cache";
export { descriptionItemStart, rememberDescriptionItems } from "./description-item-cache";

export function searchDescriptionItems(query: string, limit = 20): RecentTimerEntry[] {
  const unique = new Map<string, string>();
  for (const item of [...readItems(), ...getRecentTimers().flatMap((timer) => descriptionItems(timer.description))]) {
    const key = item.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()]
    .map((description) => ({ description, ...fuzzyMatch(query.trim(), description) }))
    .filter((item) => item.matches && item.description.toLocaleLowerCase() !== query.trim().toLocaleLowerCase())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, id) => ({ id, description: item.description, projectId: null, tagIds: [], usageCount: 0 }));
}

// Offsets are local to a text block, so rich text outside the item is untouched.
export function completionRange(text: string, caret: number) {
  const prefixEnd = descriptionItemStart(text) ?? 0;
  const start = Math.max(caret >= prefixEnd ? prefixEnd : 0, text.slice(0, caret).lastIndexOf(",") + 1, text.slice(0, caret).lastIndexOf("\n") + 1);
  const nextComma = text.indexOf(",", caret);
  const nextLine = text.indexOf("\n", caret);
  const nextHyphenMatch = /[ \t]+-(?:[ \t]+|$)/.exec(text.slice(caret));
  const nextHyphen = nextHyphenMatch ? caret + nextHyphenMatch.index : -1;
  const end = Math.min(...[nextComma, nextLine, nextHyphen, text.length].filter((offset) => offset >= 0));
  const leading = text.slice(start, end).match(/^\s*/)?.[0].length ?? 0;
  const trailing = text.slice(start + leading, end).match(/\s*$/)?.[0].length ?? 0;
  const from = start + leading;
  return { from, to: Math.max(from, end - trailing), query: text.slice(from, Math.max(from, caret)) };
}
