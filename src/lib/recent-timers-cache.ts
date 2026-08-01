export type RecentTimerEntry = {
  id: number; // Time entry ID
  description: string;
  projectId: number | null;
  tagIds: number[];
  usageCount: number; // Track how many times this timer has been used
};

const CACHE_KEY = "deeplog_recent_timers";
const DISMISSED_CACHE_KEY = "deeplog_dismissed_recent_timers";

function getTimerSignature(
  description: string,
  projectId: number | null,
  tagIds: number[]
): string {
  return JSON.stringify([
    description,
    projectId,
    [...tagIds].sort((a, b) => a - b),
  ]);
}

function getDismissedTimerSignatures(): string[] {
  try {
    const cached = localStorage.getItem(DISMISSED_CACHE_KEY);
    if (!cached) return [];

    const signatures = JSON.parse(cached);
    return Array.isArray(signatures)
      ? signatures.filter(
          (signature): signature is string => typeof signature === "string"
        )
      : [];
  } catch (error) {
    console.error("Failed to load dismissed recent timers:", error);
    return [];
  }
}

function isRecentTimerDismissed(
  description: string,
  projectId: number | null,
  tagIds: number[]
): boolean {
  return getDismissedTimerSignatures().includes(
    getTimerSignature(description, projectId, tagIds)
  );
}

export function getRecentTimers(): RecentTimerEntry[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    const timers = JSON.parse(cached) as RecentTimerEntry[];

    // Migrate old entries without usageCount
    return timers
      .filter(
        (timer) =>
          !isRecentTimerDismissed(
            timer.description,
            timer.projectId,
            timer.tagIds
          )
      )
      .map((timer) => ({
        ...timer,
        usageCount: timer.usageCount ?? 0,
      }));
  } catch (error) {
    console.error("Failed to load recent timers cache:", error);
    return [];
  }
}

export function addToRecentTimers(entry: RecentTimerEntry): void {
  try {
    if (
      isRecentTimerDismissed(entry.description, entry.projectId, entry.tagIds)
    ) {
      return;
    }

    const timers = getRecentTimers();

    // First check if this exact combination (description, project, tags) already exists
    const duplicateIndex = timers.findIndex(
      (t) =>
        t.description === entry.description &&
        t.projectId === entry.projectId &&
        getTimerSignature(t.description, t.projectId, t.tagIds) ===
          getTimerSignature(entry.description, entry.projectId, entry.tagIds)
    );

    if (duplicateIndex !== -1) {
      // Keep the existing representative ID for this suggestion. A newer time
      // entry with the same description/project/tags should not make cache
      // invalidation depend on a different, otherwise equivalent entry.
      const existingTimer = timers[duplicateIndex];
      const preservedUsageCount = Math.max(
        existingTimer.usageCount ?? 0,
        entry.usageCount ?? 0
      );

      if (existingTimer.usageCount !== preservedUsageCount) {
        existingTimer.usageCount = preservedUsageCount;
        localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
      }

      return;
    }

    // Check if this entry ID already exists with different data (corrected entry)
    const existingIdIndex = timers.findIndex((t) => t.id === entry.id);
    if (existingIdIndex !== -1) {
      // Remove the old version of this entry
      timers.splice(existingIdIndex, 1);
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
      getTimerSignature(
        cachedEntry.description,
        cachedEntry.projectId,
        cachedEntry.tagIds
      ) ===
        getTimerSignature(
          fetchedEntry.description,
          fetchedEntry.project_id,
          fetchedEntry.tag_ids || []
        );

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
        getTimerSignature(t.description, t.projectId, t.tagIds) ===
          getTimerSignature(
            entry.description,
            entry.project_id,
            entry.tag_ids || []
          )
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
        getTimerSignature(t.description, t.projectId, t.tagIds) ===
          getTimerSignature(description, projectId, tagIds)
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

export function removeRecentTimer(
  description: string,
  projectId: number | null,
  tagIds: number[]
): void {
  try {
    const timers = getRecentTimers();
    const signature = getTimerSignature(description, projectId, tagIds);

    // Find and remove the matching timer
    const filteredTimers = timers.filter(
      (t) =>
        !(
          t.description === description &&
          t.projectId === projectId &&
          getTimerSignature(t.description, t.projectId, t.tagIds) === signature
        )
    );

    localStorage.setItem(CACHE_KEY, JSON.stringify(filteredTimers));

    const dismissedSignatures = getDismissedTimerSignatures();
    if (!dismissedSignatures.includes(signature)) {
      dismissedSignatures.push(signature);
      localStorage.setItem(
        DISMISSED_CACHE_KEY,
        JSON.stringify(dismissedSignatures)
      );
    }
  } catch (error) {
    console.error("Failed to remove recent timer:", error);
  }
}
