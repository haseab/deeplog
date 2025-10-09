export type RecentTimerEntry = {
  id: number; // Time entry ID
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

    // Add to the beginning (most recent first)
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
  // Filter entries with descriptions under 60 characters
  const validEntries = entries.filter(
    (e) => e.description && e.description.length > 0 && e.description.length < 60
  );

  // Add each valid entry to the cache
  validEntries.forEach((entry) => {
    addToRecentTimers({
      id: entry.id,
      description: entry.description,
      projectId: entry.project_id,
      tagIds: entry.tag_ids || [],
    });
  });
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
        score += 10; // Bonus for word start
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
    return timers.slice(0, limit);
  }

  // Score and filter matches
  const scoredMatches = timers
    .map((timer) => {
      const result = fuzzyMatch(query, timer.description);
      return {
        timer,
        score: result.score,
        matches: result.matches
      };
    })
    .filter((item) => item.matches)
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .map((item) => item.timer);

  return scoredMatches.slice(0, limit);
}
