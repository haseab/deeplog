export const createRowEditorState = () => ({
  description: new Map<number, Set<string>>(),
  duration: new Map<number, Set<string>>(),
  project: new Map<number, Set<string>>(),
  tags: new Map<number, Set<string>>(),
  time: new Map<number, Set<string>>(),
});

export type RowEditorState = ReturnType<typeof createRowEditorState>;
export type RowEditorType = keyof RowEditorState;

// Responsive layouts mount multiple controls of the same type for one entry.
// A closed or unmounted sibling must never release another instance's editor.
export function updateRowEditorState(
  editors: RowEditorState,
  entryId: number,
  type: RowEditorType,
  open: boolean,
  instanceId = "default",
) {
  const active = editors[type];
  const instances = active.get(entryId);
  if ((instances?.has(instanceId) ?? false) === open) return null;

  if (!open) {
    instances!.delete(instanceId);
    if (instances!.size > 0) return null;
    active.delete(entryId);
  } else if (instances) {
    instances.add(instanceId);
    return null;
  }

  const replacedEntryIds = new Set<number>();
  if (open) {
    // Recover orphaned registrations when moving to another row. Keep other
    // controls on this row until they report closed: close/open order varies.
    Object.values(editors).forEach(ids => {
      ids.forEach((_instances, id) => {
        if (id !== entryId) {
          replacedEntryIds.add(id);
          ids.delete(id);
        }
      });
    });
    active.set(entryId, new Set([instanceId]));
  }

  return {
    replacedEntryIds,
    entryHasOpenEditor: Object.values(editors).some(ids => ids.has(entryId)),
  };
}

export function remapRowEditorEntry(editors: RowEditorState, from: number, to: number) {
  if (from === to) return;
  for (const active of Object.values(editors)) {
    const instances = active.get(from);
    if (!instances) continue;
    const merged = new Set([...(active.get(to) ?? []), ...instances]);
    active.delete(from);
    active.set(to, merged);
  }
}
