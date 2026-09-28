/** Entries are displayed newest first. The selected row is always folded away. */
export function getCombineEntryPair<T extends { id: number; tempId?: number }>(
  entries: readonly T[],
  selectedId: number,
  reverse = false,
) {
  const index = entries.findIndex(entry => entry.id === selectedId || entry.tempId === selectedId);
  if (index < 0) return null;
  const selected = entries[index];
  const destination = entries[index + (reverse ? -1 : 1)];
  if (!destination) return null;
  return {
    selected,
    destination,
    newer: reverse ? destination : selected,
    older: reverse ? selected : destination,
  };
}
