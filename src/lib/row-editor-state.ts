export const createRowEditorState = () => ({
  description: new Set<number>(),
  duration: new Set<number>(),
  project: new Set<number>(),
  tags: new Set<number>(),
  time: new Set<number>(),
});

export type RowEditorState = ReturnType<typeof createRowEditorState>;
export type RowEditorType = keyof RowEditorState;

// Controls report their state again when inline callback props change. Only
// transitions from the same control may pause or re-arm an entry's Undo toast.
export function updateRowEditorState(
  editors: RowEditorState,
  entryId: number,
  type: RowEditorType,
  open: boolean,
) {
  const active = editors[type];
  if (active.has(entryId) === open) return null;

  const replacedEntryIds = new Set<number>();
  if (open) {
    // Recover orphaned registrations when moving to another row. Keep other
    // controls on this row until they report closed: close/open order varies.
    Object.values(editors).forEach(ids => {
      ids.forEach(id => {
        if (id !== entryId) {
          replacedEntryIds.add(id);
          ids.delete(id);
        }
      });
    });
    active.add(entryId);
  } else {
    active.delete(entryId);
  }

  return {
    replacedEntryIds,
    entryHasOpenEditor: Object.values(editors).some(ids => ids.has(entryId)),
  };
}
