export type RecentTimerEntry = {
  description: string;
  projectId: number | null;
  tagIds: number[];
};

const CACHE_KEY = "deeplog_recent_timers";

export function getRecentTimers(): RecentTimerEntry[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    return JSON.parse(cached) as RecentTimerEntry[];
  } catch (error) {
    console.error("Failed to load recent timers cache:", error);
    return [];
  }
}

export function addToRecentTimers(entry: RecentTimerEntry): void {
  try {
    const timers = getRecentTimers();

    // Check if this exact combination already exists
    const isDuplicate = timers.some(
      (t) =>
        t.description === entry.description &&
        t.projectId === entry.projectId &&
        JSON.stringify(t.tagIds.sort()) === JSON.stringify(entry.tagIds.sort())
    );

    if (isDuplicate) {
      return; // Don't add duplicates
    }

    // Add to the beginning (most recent first)
    timers.unshift(entry);

    localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
  } catch (error) {
    console.error("Failed to save to recent timers cache:", error);
  }
}

export function updateRecentTimersCache(
  entries: Array<{
    description: string;
    project_id: number | null;
    tag_ids: number[];
  }>
): void {
  // Filter entries with descriptions under 60 characters
  const validEntries = entries.filter(
    (e) => e.description && e.description.length > 0 && e.description.length < 60
  );

  // Add each valid entry to the cache
  validEntries.forEach((entry) => {
    addToRecentTimers({
      description: entry.description,
      projectId: entry.project_id,
      tagIds: entry.tag_ids || [],
    });
  });
}

export function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let queryIndex = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === queryLower.length;
}

export function searchRecentTimers(
  query: string,
  limit: number = 10
): RecentTimerEntry[] {
  const timers = getRecentTimers();

  if (!query.trim()) {
    return timers.slice(0, limit);
  }

  const matches = timers.filter((timer) =>
    fuzzyMatch(query, timer.description)
  );

  return matches.slice(0, limit);
}
