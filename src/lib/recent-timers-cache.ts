export type RecentTimerEntry = {
  id: number; // Time entry ID
  description: string;
  projectId: number | null;
  tagIds: number[];
  usageCount: number; // Track how many times this timer has been used
};

const CACHE_KEY = "deeplog_recent_timers";

export function getRecentTimers(): RecentTimerEntry[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    const timers = JSON.parse(cached) as RecentTimerEntry[];

    // Migrate old entries without usageCount
    return timers.map(timer => ({
      ...timer,
      usageCount: timer.usageCount ?? 0
    }));
  } catch (error) {
    console.error("Failed to load recent timers cache:", error);
    return [];
  }
}

export function addToRecentTimers(entry: RecentTimerEntry): void {
  try {
    const timers = getRecentTimers();

    // First check if this exact combination (description, project, tags) already exists
    const duplicateIndex = timers.findIndex(
      (t) =>
        t.description === entry.description &&
        t.projectId === entry.projectId &&
        JSON.stringify(t.tagIds.sort()) === JSON.stringify(entry.tagIds.sort())
    );

    if (duplicateIndex !== -1) {
      // Remove the duplicate and add the new one at the front
      // This ensures we have the latest ID and data
      timers.splice(duplicateIndex, 1);
    } else {
      // Check if this entry ID already exists with different data (corrected entry)
      const existingIdIndex = timers.findIndex((t) => t.id === entry.id);
      if (existingIdIndex !== -1) {
        // Remove the old version of this entry
        timers.splice(existingIdIndex, 1);
      }
    }

    // Ensure usageCount is set (default to 0 if not provided)
    if (entry.usageCount === undefined) {
      entry.usageCount = 0;
    }

    // Add to the beginning
    timers.unshift(entry);

    localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
  } catch (error) {
    console.error("Failed to save to recent timers cache:", error);
  }
}

export function updateRecentTimersCache(
  entries: Array<{
    id: number;
    description: string;
    project_id: number | null;
    tag_ids: number[];
  }>
): void {
  // First, clean up stale entries: if an entry ID exists in cache with different data, remove it
  const cachedTimers = getRecentTimers();
  const cleanedTimers = cachedTimers.filter((cachedEntry) => {
    const fetchedEntry = entries.find((e) => e.id === cachedEntry.id);
    if (!fetchedEntry) {
      // Entry not in current fetch, keep it (might be from different date range)
      return true;
    }

    // Entry exists in fetch - check if data matches
    const dataMatches =
      cachedEntry.description === fetchedEntry.description &&
      cachedEntry.projectId === fetchedEntry.project_id &&
      JSON.stringify(cachedEntry.tagIds.sort()) === JSON.stringify((fetchedEntry.tag_ids || []).sort());

    // Keep only if data matches; remove if stale
    return dataMatches;
  });

  // Save cleaned cache
  localStorage.setItem(CACHE_KEY, JSON.stringify(cleanedTimers));

  // Now filter entries with descriptions under 60 characters
  const validEntries = entries.filter(
    (e) => e.description && e.description.length > 0 && e.description.length < 60
  );

  // Add each valid entry to the cache, preserving existing usage counts
  validEntries.forEach((entry) => {
    // Check if this entry already exists to preserve its usage count
    const existing = cleanedTimers.find(
      (t) =>
        t.description === entry.description &&
        t.projectId === entry.project_id &&
        JSON.stringify(t.tagIds.sort()) === JSON.stringify((entry.tag_ids || []).sort())
    );

    addToRecentTimers({
      id: entry.id,
      description: entry.description,
      projectId: entry.project_id,
      tagIds: entry.tag_ids || [],
      usageCount: existing?.usageCount || 0,
    });
  });
}

export function incrementTimerUsage(
  description: string,
  projectId: number | null,
  tagIds: number[]
): void {
  try {
    const timers = getRecentTimers();

    // Find matching timer
    const index = timers.findIndex(
      (t) =>
        t.description === description &&
        t.projectId === projectId &&
        JSON.stringify(t.tagIds.sort()) === JSON.stringify(tagIds.sort())
    );

    if (index !== -1) {
      // Increment usage count
      timers[index].usageCount = (timers[index].usageCount || 0) + 1;
      localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
    }
  } catch (error) {
    console.error("Failed to increment timer usage:", error);
  }
}

export function fuzzyMatch(query: string, text: string): { matches: boolean; score: number } {
  if (!query) return { matches: true, score: 0 };

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let queryIndex = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Check if this is the start of a word (after space, dash, or beginning)
      const isWordStart = i === 0 || textLower[i - 1] === ' ' || textLower[i - 1] === '-';

      if (isWordStart) {
        score += 5; // Bonus for word start
      } else {
        score += 1; // Regular match
      }

      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        score += 5;
      }

      lastMatchIndex = i;
      queryIndex++;
    }
  }

  return {
    matches: queryIndex === queryLower.length,
    score: queryIndex === queryLower.length ? score : 0
  };
}

export function searchRecentTimers(
  query: string,
  limit: number = 10
): RecentTimerEntry[] {
  const timers = getRecentTimers();

  if (!query.trim()) {
    // Sort by usage count (descending), then by array position (most recent first)
    const sorted = [...timers].sort((a, b) => {
      const usageA = a.usageCount || 0;
      const usageB = b.usageCount || 0;
      if (usageB !== usageA) {
        return usageB - usageA; // Higher usage first
      }
      // If usage is the same, maintain original order (newer first)
      return timers.indexOf(a) - timers.indexOf(b);
    });
    return sorted.slice(0, limit);
  }

  // Score and filter matches
  const scoredMatches = timers
    .map((timer) => {
      const result = fuzzyMatch(query, timer.description);
      return {
        timer,
        score: result.score,
        matches: result.matches,
        usageCount: timer.usageCount || 0
      };
    })
    .filter((item) => item.matches)
    .sort((a, b) => b.score - a.score) // Sort by fuzzy score first
    .slice(0, limit) // Take top N matches
    .sort((a, b) => b.usageCount - a.usageCount); // Then sort by usage count

  return scoredMatches.map((item) => item.timer);
}
