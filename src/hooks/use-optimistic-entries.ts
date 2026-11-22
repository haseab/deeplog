"use client";

import * as React from "react";

// Actions and React render from the same snapshot. Evaluate transitions once,
// immediately, so a following action cannot read the previous render's rows.
export function useOptimisticEntries<T>() {
  const [entries, publish] = React.useState<T[]>([]);
  const current = React.useRef(entries);
  const update = React.useCallback((action: React.SetStateAction<T[]>) => {
    const next = typeof action === "function" ? action(current.current) : action;
    current.current = next;
    publish(next);
  }, []);
  return [entries, update, current] as const;
}
