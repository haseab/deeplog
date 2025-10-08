"use client";

import { PinnedEntry } from "@/types";
import * as React from "react";

const STORAGE_KEY = "deeplog_pinned_entries";

export function usePinnedEntries() {
  const [pinnedEntries, setPinnedEntries] = React.useState<PinnedEntry[]>([]);

  // Load pinned entries from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPinnedEntries(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load pinned entries:", error);
    }
  }, []);

  // Save to localStorage whenever pinnedEntries changes
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedEntries));
    } catch (error) {
      console.error("Failed to save pinned entries:", error);
    }
  }, [pinnedEntries]);

  const pinEntry = React.useCallback((entry: PinnedEntry) => {
    setPinnedEntries((prev) => {
      // Check if already pinned
      if (prev.some((p) => p.id === entry.id)) {
        return prev;
      }
      return [...prev, entry];
    });
  }, []);

  const unpinEntry = React.useCallback((id: string) => {
    setPinnedEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const isPinned = React.useCallback(
    (id: string) => {
      return pinnedEntries.some((entry) => entry.id === id);
    },
    [pinnedEntries]
  );

  return {
    pinnedEntries,
    pinEntry,
    unpinEntry,
    isPinned,
  };
}
