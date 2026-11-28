const CACHE_KEY = "deeplog_description_items";

export function descriptionItemStart(text: string): number | null {
  const separator = /[ \t]+-(?:[ \t]+|$)/.exec(text);
  return separator ? separator.index + separator[0].length : null;
}

export function descriptionItems(description: string): string[] {
  const start = descriptionItemStart(description);
  const body = description.slice(start ?? 0).split(/[ \t]+-(?:[ \t]+|$)/, 1)[0];
  return body.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

export type DescriptionItem = {
  description: string;
  usageCount: number;
  firstSeenAt: number;
};

export function readDescriptionItems(): DescriptionItem[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    const unique = new Map<string, DescriptionItem>();
    for (const value of items) {
      // Existing string-only caches migrate without losing their descriptions.
      const raw = typeof value === "string" ? { description: value } : value;
      if (!raw || typeof raw.description !== "string") continue;
      const description = raw.description.split(/[ \t]+-(?:[ \t]+|$)/, 1)[0].trim();
      if (!description) continue;
      const item = {
        description,
        usageCount: Number.isSafeInteger(raw.usageCount) && raw.usageCount > 0 ? raw.usageCount : 0,
        firstSeenAt: Number.isFinite(raw.firstSeenAt) && raw.firstSeenAt > 0 ? raw.firstSeenAt : 0,
      };
      const key = description.toLocaleLowerCase();
      const existing = unique.get(key);
      if (existing) {
        existing.usageCount = Math.max(existing.usageCount, item.usageCount);
        existing.firstSeenAt = Math.min(existing.firstSeenAt, item.firstSeenAt);
      } else unique.set(key, item);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function readItems(): string[] {
  return readDescriptionItems().map((item) => item.description);
}

function writeItems(items: DescriptionItem[]): void {
  const protectedItems = items.filter((item) => item.usageCount > 0);
  const unusedItems = items.filter((item) => item.usageCount === 0)
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  // The limit applies only while there are never-selected items to evict.
  // Explicit selections are protected even if they eventually exceed the cap.
  const kept = [...protectedItems, ...unusedItems.slice(0, Math.max(0, 2000 - protectedItems.length))];
  localStorage.setItem(CACHE_KEY, JSON.stringify(kept));
}

// Capture full descriptions before the recent-timer cache shortens them.
export function rememberDescriptionItems(descriptions: string[]): void {
  try {
    const existing = readDescriptionItems();
    const known = new Set(existing.map((item) => item.description.toLocaleLowerCase()));
    const added: DescriptionItem[] = [];
    const firstSeenAt = Date.now();
    for (const description of descriptions.flatMap(descriptionItems)) {
      const key = description.toLocaleLowerCase();
      if (known.has(key)) continue;
      known.add(key);
      added.push({ description, usageCount: 0, firstSeenAt });
    }
    writeItems([...added, ...existing]);
  } catch {
    // Completion is optional when browser storage is unavailable.
  }
}

export function recordDescriptionItemSelection(description: string): void {
  try {
    const items = readDescriptionItems();
    const key = description.toLocaleLowerCase();
    const item = items.find((candidate) => candidate.description.toLocaleLowerCase() === key);
    if (item) item.usageCount = Math.min(Number.MAX_SAFE_INTEGER, item.usageCount + 1);
    else items.unshift({ description, usageCount: 1, firstSeenAt: Date.now() });
    writeItems(items);
  } catch {
    // A storage failure must not interrupt insertion into the editor.
  }
}
