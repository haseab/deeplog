export type RecentTimerEntry = {
  id: number; // Time entry ID
  description: string;
  projectId: number | null;
  tagIds: number[];
  usageCount: number; // Track how many times this timer has been used
};

const CACHE_KEY = "deeplog_recent_timers";
const MAX_RECENT_TIMER_SEGMENT_LENGTH = 50;

export function getRecentTimerDescription(description: string): string | null {
  const segments = description
    // A dash is a description-list separator only when surrounded by
    // whitespace. Preserve hyphenated words and channel names such as
    // "core-team" and "#core-team".
    .split(/\s+-\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const eligibleSegments: string[] = [];

  for (const segment of segments) {
    if (segment.length >= MAX_RECENT_TIMER_SEGMENT_LENGTH) {
      break;
    }

    eligibleSegments.push(segment);
  }

  return eligibleSegments.length > 0 ? eligibleSegments.join(" - ") : null;
}

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

function readRecentTimersCache(): RecentTimerEntry[] {
  const cached = localStorage.getItem(CACHE_KEY);
  if (!cached) return [];

  const timers = JSON.parse(cached);
  return Array.isArray(timers) ? (timers as RecentTimerEntry[]) : [];
}

export function getRecentTimers(): RecentTimerEntry[] {
  try {
    // Cache entries are normalized and deduplicated during reconciliation.
    // Reads stay linear so searching on each keystroke remains inexpensive.
    return readRecentTimersCache()
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
    const description = getRecentTimerDescription(entry.description);
    if (!description) return;

    const normalizedEntry = { ...entry, description };
    const normalizedSignature = getTimerSignature(
      normalizedEntry.description,
      normalizedEntry.projectId,
      normalizedEntry.tagIds
    );
    const timers = readRecentTimersCache();

    // First check if this exact combination (description, project, tags) already exists
    const duplicateIndex = timers.findIndex(
      (timer) =>
        getTimerSignature(timer.description, timer.projectId, timer.tagIds) ===
        normalizedSignature
    );

    if (duplicateIndex !== -1) {
      // Keep the existing representative ID for this suggestion. A newer time
      // entry with the same description/project/tags should not make cache
      // invalidation depend on a different, otherwise equivalent entry.
      const existingTimer = timers[duplicateIndex];
      const preservedUsageCount = Math.max(
        existingTimer.usageCount ?? 0,
        normalizedEntry.usageCount ?? 0
      );

      if (existingTimer.usageCount !== preservedUsageCount) {
        existingTimer.usageCount = preservedUsageCount;
        localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
      }

      return;
    }

    // Check if this entry ID already exists with different data (corrected entry)
    const existingIdIndex = timers.findIndex((t) => t.id === normalizedEntry.id);
    if (existingIdIndex !== -1) {
      // Remove the old version of this entry
      timers.splice(existingIdIndex, 1);
    }

    // Ensure usageCount is set (default to 0 if not provided)
    if (normalizedEntry.usageCount === undefined) {
      normalizedEntry.usageCount = 0;
    }

    // Add to the beginning
    timers.unshift(normalizedEntry);

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
  try {
    const fetchedEntriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const reconciledTimers: RecentTimerEntry[] = [];
    const timerIndexBySignature = new Map<string, number>();

    // Normalize and clean the existing cache in one pass. The first cached
    // entry for a signature remains its representative ID.
    for (const cachedTimer of readRecentTimersCache()) {
      const description = getRecentTimerDescription(cachedTimer.description);
      if (!description) continue;

      const normalizedTimer: RecentTimerEntry = {
        ...cachedTimer,
        description,
        usageCount: cachedTimer.usageCount ?? 0,
      };
      const signature = getTimerSignature(
        normalizedTimer.description,
        normalizedTimer.projectId,
        normalizedTimer.tagIds
      );

      const fetchedEntry = fetchedEntriesById.get(normalizedTimer.id);
      if (fetchedEntry) {
        const fetchedDescription = getRecentTimerDescription(
          fetchedEntry.description
        );
        if (!fetchedDescription) continue;

        const fetchedSignature = getTimerSignature(
          fetchedDescription,
          fetchedEntry.project_id,
          fetchedEntry.tag_ids || []
        );
        if (fetchedSignature !== signature) continue;
      }

      const existingIndex = timerIndexBySignature.get(signature);
      if (existingIndex !== undefined) {
        reconciledTimers[existingIndex].usageCount = Math.max(
          reconciledTimers[existingIndex].usageCount,
          normalizedTimer.usageCount
        );
        continue;
      }

      timerIndexBySignature.set(signature, reconciledTimers.length);
      reconciledTimers.push(normalizedTimer);
    }

    // Add previously unseen suggestions from the fetched page without calling
    // addToRecentTimers for every entry. Existing signatures retain their IDs.
    const newTimers: RecentTimerEntry[] = [];
    for (const entry of entries) {
      const description = getRecentTimerDescription(entry.description);
      if (!description) continue;

      const signature = getTimerSignature(
        description,
        entry.project_id,
        entry.tag_ids || []
      );
      if (timerIndexBySignature.has(signature)) {
        continue;
      }

      timerIndexBySignature.set(signature, reconciledTimers.length);
      newTimers.unshift({
        id: entry.id,
        description,
        projectId: entry.project_id,
        tagIds: entry.tag_ids || [],
        usageCount: 0,
      });
    }

    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify([...newTimers, ...reconciledTimers])
    );
  } catch (error) {
    console.error("Failed to reconcile recent timers cache:", error);
  }
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
    // Modern JavaScript sorting is stable, so equal usage counts retain cache
    // order without repeatedly calling indexOf inside the comparator.
    const sorted = [...timers].sort((a, b) => {
      const usageA = a.usageCount || 0;
      const usageB = b.usageCount || 0;
      return usageB - usageA;
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
    .sort((a, b) => {
      const scoreDifference = b.score - a.score;
      return scoreDifference !== 0
        ? scoreDifference
        : b.usageCount - a.usageCount;
    })
    .slice(0, limit);

  return scoredMatches.map((item) => item.timer);
}

export function resetRecentTimerRanking(
  description: string,
  projectId: number | null,
  tagIds: number[]
): void {
  try {
    const timers = readRecentTimersCache();
    const signature = getTimerSignature(description, projectId, tagIds);
    const timer = timers.find(
      (candidate) =>
        getTimerSignature(
          candidate.description,
          candidate.projectId,
          candidate.tagIds
        ) === signature
    );
    if (!timer || (timer.usageCount ?? 0) === 0) return;

    timer.usageCount = 0;
    localStorage.setItem(CACHE_KEY, JSON.stringify(timers));
  } catch (error) {
    console.error("Failed to reset recent timer ranking:", error);
  }
}
