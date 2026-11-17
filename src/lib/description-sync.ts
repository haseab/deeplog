/** Pure reconciliation rules shared by the browser and API. Never use wall clocks to pick a winner. */
export function compareDescription(base: string, local: string, remote: string) {
  if (remote === local) return "synced";
  if (remote === base) return "upload";
  return "conflict";
}

export interface DescriptionDraft {
  key: string;
  account: string;
  entryId: number;
  base: string;
  local: string;
  revision: number;
  updatedAt: number;
  status: "local" | "conflict" | "error" | "synced";
  remote?: string;
  deleted?: boolean;
  deletionConfirmed?: boolean;
  // Original entry time allows timeline navigation after deletion in Toggl.
  start?: string;
  error?: string;
  // Kept before sending, so an ambiguous timeout can be reconciled on the next attempt.
  sent?: string;
  owner?: string;
  attempts?: number;
  retryAt?: number;
}
/** Resolved comparisons wait for explicit review; only unsent changes need background work. */
export function needsDescriptionUpload(draft: DescriptionDraft, now = Date.now()): boolean {
  return (draft.status === "local" || draft.status === "error") && (draft.retryAt ?? 0) <= now;
}

export interface DescriptionCheck {
  remote?: string;
  deleted: boolean;
  deletionConfirmed?: boolean;
  start?: string;
}

/** Refresh evidence without choosing between differing descriptions or discarding edits. */
export function refreshDescriptionConflict(current: DescriptionDraft, shown: DescriptionDraft, check: DescriptionCheck): DescriptionDraft {
  if (current.revision !== shown.revision || current.local !== shown.local || current.status !== "conflict") return current;
  if (!check.deleted && check.remote !== undefined && current.local === check.remote) {
    return { ...acknowledgeDraft(current, shown, check.remote), status: "synced", deleted: false, deletionConfirmed: false, start: check.start ?? current.start };
  }
  return { ...current, remote: check.remote, deleted: check.deleted, deletionConfirmed: !!check.deletionConfirmed, start: check.start ?? current.start, error: undefined };
}
export interface DescriptionHistory {
  key: string;
  account: string;
  entryId: number;
  local: string;
  remote?: string;
  at: number;
}

/** A new edit supersedes the known conflict; the server still checks this base. */
export function resolveEditedDescription(draft: DescriptionDraft): DescriptionDraft {
  if (draft.status !== "conflict" || draft.deleted || draft.remote === undefined) return draft;
  return {
    ...draft,
    base: draft.remote,
    status: "local",
    remote: undefined,
    sent: undefined,
    error: undefined,
    attempts: 0,
    retryAt: undefined,
  };
}

export function acknowledgeDraft(current: DescriptionDraft, sent: DescriptionDraft, remote: string): DescriptionDraft {
  if (current.key !== sent.key) return current;
  // A conflict can appear in another tab while this request is in flight.
  // The returned value is evidence of success only for text it actually matches.
  const matched = current.local === remote;
  return {
    ...current,
    base: remote,
    status: matched ? "synced" : current.status === "conflict" ? "conflict" : "local",
    attempts: 0,
    retryAt: undefined,
    sent: undefined,
    error: undefined,
    remote: !matched && current.status === "conflict" ? remote : undefined,
    deleted: matched ? false : current.deleted,
    deletionConfirmed: matched ? false : current.deletionConfirmed,
  };
}
