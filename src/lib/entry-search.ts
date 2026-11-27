import type { TimeEntry } from "@/types";

export const DESCRIPTION_MATCHES = [
  { value: "phrase", label: "Contains phrase", short: "Phrase", operator: "contains", needsText: true },
  { value: "not-contains", label: "Does not contain", short: "Excludes", operator: "not contains", needsText: true },
  { value: "starts-with", label: "Starts with", short: "Starts", operator: "starts with", needsText: true },
  { value: "ends-with", label: "Ends with", short: "Ends", operator: "ends with", needsText: true },
  { value: "exact", label: "Exact description", short: "Exact", operator: "=", needsText: true },
  { value: "not-exact", label: "Not exact description", short: "Not exact", operator: "!=", needsText: true },
  { value: "empty", label: "Is empty", short: "Empty", operator: "empty", needsText: false },
  { value: "not-empty", label: "Is not empty", short: "Not empty", operator: "not empty", needsText: false },
] as const;
export type DescriptionMatch = typeof DESCRIPTION_MATCHES[number]["value"];
export type DescriptionCondition = { match: DescriptionMatch; text: string };
export const MAX_SEARCH_RULES = 8;
export const isDescriptionMatch = (value: unknown): value is DescriptionMatch => DESCRIPTION_MATCHES.some(option => option.value === value);
export const descriptionMatch = (value: DescriptionMatch) => DESCRIPTION_MATCHES.find(option => option.value === value)!;
export function validDescriptionConditions(value: unknown): value is DescriptionCondition[] {
  return Array.isArray(value) && value.length <= MAX_SEARCH_RULES && value.every(rule => rule && typeof rule === "object"
    && Object.keys(rule).every(key => ["match", "text"].includes(key)) && isDescriptionMatch(rule.match) && typeof rule.text === "string"
    && rule.text.length <= 3000 && (!descriptionMatch(rule.match).needsText || !!rule.text.trim()));
}
export type EntrySearch = {
  text: string;
  match: DescriptionMatch;
  from: string;
  to: string;
  projects: string[];
  tags: string[];
  conditions?: DescriptionCondition[];
  combine?: "and" | "or";
};

export function searchParamsForEntries(search: EntrySearch, page = 0) {
  const params = new URLSearchParams({ from_date: search.from, to_date: search.to, page: String(page) });
  if (descriptionMatch(search.match).needsText && search.text.trim()) params.set("q", search.text.trim());
  if (search.match !== "phrase") params.set("match", search.match);
  if (search.projects.length) params.set("projects", search.projects.join(","));
  if (search.tags.length) params.set("tags", search.tags.join(","));
  if (search.combine === "or") params.set("combine", "or");
  if (search.conditions?.length) params.set("conditions", JSON.stringify(search.conditions.map(rule => ({ match: rule.match, text: descriptionMatch(rule.match).needsText ? rule.text.trim() : "" }))));
  return params;
}

type Filter = { property: string; operator: string; value?: string | number | number[] } | { operator: "and" | "or"; conditions: Filter[] };
/** Account scopes always remain outside the user-selectable AND/OR group. */
export function entrySearchFilters(search: EntrySearch, scope: { workspaceId: number; userId: number }): Filter[] {
  const rules: Filter[] = [];
  for (const rule of [{ match: search.match, text: search.text }, ...(search.conditions ?? [])]) {
    const option = descriptionMatch(rule.match);
    if (option.needsText && !rule.text.trim()) continue;
    rules.push({ property: "description", operator: option.operator, ...(option.needsText ? { value: rule.text.trim() } : {}) });
  }
  const projectIds = [...new Set(search.projects.filter(id => id !== "none").map(Number))];
  const projects: Filter[] = [
    ...(projectIds.length ? [{ property: "project_id", operator: "in", value: projectIds }] : []),
    ...(search.projects.includes("none") ? [{ property: "project_id", operator: "empty" }] : []),
  ];
  if (projects.length) rules.push(projects.length === 1 ? projects[0] : { operator: "or", conditions: projects });
  const tags = [...new Set(search.tags)].map(id => ({ property: "tag_ids", operator: "contains one of", value: [Number(id)] }));
  // A tag selection still means every selected tag, including inside an OR search.
  if (search.combine === "or" && tags.length > 1) rules.push({ operator: "and", conditions: tags });
  else rules.push(...tags);
  return [
    { property: "workspace_id", operator: "=", value: scope.workspaceId },
    { property: "user_id", operator: "=", value: scope.userId },
    ...(rules.length ? [{ operator: search.combine ?? "and", conditions: rules } as Filter] : []),
  ];
}

/** Local preview matching only; API searches are evaluated by Toggl before pagination. */
export function matchesEntrySearch(entry: { description: string; project_id?: string | number | null; tag_ids: readonly (string | number)[] }, search: Pick<EntrySearch, "text" | "match" | "projects" | "tags" | "conditions" | "combine">) {
  const text = entry.description.toLocaleLowerCase();
  const checks: boolean[] = [];
  for (const rule of [{ match: search.match, text: search.text }, ...(search.conditions ?? [])]) {
    const value = rule.text.trim().toLocaleLowerCase();
    if (descriptionMatch(rule.match).needsText && !value) continue;
    checks.push(({ phrase: () => text.includes(value), "not-contains": () => !text.includes(value), "starts-with": () => text.startsWith(value), "ends-with": () => text.endsWith(value), exact: () => text === value, "not-exact": () => text !== value, empty: () => !text, "not-empty": () => !!text })[rule.match]());
  }
  if (search.projects.length) checks.push(search.projects.includes(String(entry.project_id ?? "none")));
  if (search.tags.length) checks.push(search.tags.every(tag => entry.tag_ids.map(String).includes(tag)));
  return !checks.length || (search.combine === "or" ? checks.some(Boolean) : checks.every(Boolean));
}

/** Literal, case-sensitive replacement, including every occurrence. No regex syntax. */
export function replaceEntryText(description: string, find: string, replacement: string) {
  return find ? description.split(find).join(replacement) : description;
}
export function compareEntryOrder(a: Pick<TimeEntry, "start" | "id">, b: Pick<TimeEntry, "start" | "id">) {
  return new Date(b.start).getTime() - new Date(a.start).getTime() || b.id - a.id;
}
