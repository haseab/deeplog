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
  error?: string;
  // Kept before sending, so an ambiguous timeout can be reconciled on the next attempt.
  sent?: string;
  owner?: string;
  attempts?: number;
  retryAt?: number;
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
  return {
    ...current,
    base: remote,
    status: current.status === "conflict" ? "conflict" : current.revision === sent.revision ? "synced" : "local",
    attempts: 0,
    retryAt: undefined,
    sent: undefined,
    error: undefined,
    remote: undefined,
  };
}
