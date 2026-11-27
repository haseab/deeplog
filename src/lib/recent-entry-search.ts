import { isDescriptionMatch, descriptionMatch, validDescriptionConditions, type EntrySearch } from "./entry-search";

export const RECENT_SEARCH_TTL = 5 * 60 * 1000;
const key = (account: string) => `deeplog:recent-search:${account}`;
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** Criteria only, scoped to this tab and authenticated account. Reads never extend expiry. */
export function rememberEntrySearch(storage: Storage, account: string, search: EntrySearch, now = Date.now()) {
  if (!account) return;
  try { storage.setItem(key(account), JSON.stringify({ expiresAt: now + RECENT_SEARCH_TTL, search })); } catch { /* Storage is optional. */ }
}
export function recallEntrySearch(storage: Storage, account: string, now = Date.now()): EntrySearch | null {
  if (!account) return null;
  try {
    const stored = JSON.parse(storage.getItem(key(account)) ?? "null");
    const search = stored?.search;
    if (!Number.isFinite(stored?.expiresAt) || stored.expiresAt <= now || stored.expiresAt > now + RECENT_SEARCH_TTL
      || !search || typeof search.text !== "string" || !isDescriptionMatch(search.match)
      || search.text.length > 3000 || (isDescriptionMatch(search.match) && descriptionMatch(search.match).needsText && search.match !== "phrase" && !search.text.trim())
      || (search.combine !== undefined && !["and", "or"].includes(search.combine))
      || (search.conditions !== undefined && !validDescriptionConditions(search.conditions))
      || ![search.from, search.to].every(validDate) || search.from > search.to
      || ![search.projects, search.tags].every(ids => Array.isArray(ids) && ids.every(id => typeof id === "string"))) {
      storage.removeItem(key(account)); return null;
    }
    return search;
  } catch { return null; }
}
