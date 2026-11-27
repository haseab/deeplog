import type { TimeEntry } from "@/types";

export const BULK_UNDO_DURATION = 30_000;
export type BulkPatch = Partial<Pick<TimeEntry, "description" | "project_id" | "project_name" | "project_color" | "tags" | "tag_ids">>;
export type BulkRow = {
  id: number;
  before: TimeEntry;
  patch: BulkPatch;
  delete: boolean;
  status: "pending" | "saving" | "saved" | "failed" | "undone";
  error?: string;
  uncertain?: boolean;
  conflict?: boolean;
};
export type BulkBatch = {
  id: string;
  account: string;
  label: string;
  createdAt: number;
  phase: "staged" | "committing" | "settled";
  rows: BulkRow[];
};
export type BulkWriteResult = { state: "applied" | "unchanged" | "conflict"; current?: BulkPatch };
export class BulkWriteError extends Error {
  constructor(message: string, readonly stopBatch = true, readonly uncertain = false, readonly current?: BulkPatch, readonly conflict = false) { super(message); }
}

type Ports = {
  write: (batch: BulkBatch, row: BulkRow, reviewOnly: boolean) => Promise<BulkWriteResult>;
  applied: (row: BulkRow, current?: BulkPatch) => void;
  settled?: (batch: BulkBatch) => void;
};
const cloneEntry = (entry: TimeEntry): TimeEntry => ({ ...entry, tags: [...entry.tags], tag_ids: [...entry.tag_ids] });
const active = (row: BulkRow) => ["pending", "saving", "failed"].includes(row.status);

/** In-memory review ledger. It never owns a timer: only the toast's actual close starts writes. */
export class BulkTransactions {
  private batches: BulkBatch[] = [];
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(private readonly ports: Ports) {}
  activate() { this.disposed = false; }
  getSnapshot = () => this.batches;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { for (const listener of this.listeners) listener(); }
  private batch(id: string) { return this.batches.find(batch => batch.id === id); }
  private changeRow(batchId: string, id: number, patch: Partial<BulkRow>) {
    this.batches = this.batches.map(batch => batch.id === batchId ? { ...batch, rows: batch.rows.map(row => row.id === id ? { ...row, ...patch } : row) } : batch);
    this.publish();
  }
  private phase(id: string, phase: BulkBatch["phase"]) {
    this.batches = this.batches.map(batch => batch.id === id ? { ...batch, phase } : batch); this.publish();
  }
  isLocked(id: number) { return this.batches.some(batch => batch.rows.some(row => row.id === id && active(row))); }
  hasUnsettled() { return this.batches.some(batch => batch.rows.some(active)); }
  canUndo(batchId: string, id?: number) {
    const batch = this.batch(batchId);
    return !!batch && batch.phase !== "committing" && batch.rows.some(row => (id === undefined || row.id === id) && ["pending", "failed"].includes(row.status) && !row.uncertain);
  }
  stage(account: string, label: string, changes: { before: TimeEntry; patch?: BulkPatch; delete?: boolean }[]) {
    if (this.disposed) throw new Error("Reopen this view before editing.");
    if (!account || !changes.length) throw new Error("No changes to stage.");
    if (changes.some(change => !change.delete && !Object.keys(change.patch ?? {}).length)) throw new Error("No changes to stage.");
    const ids = changes.map(change => change.before.id);
    if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Sync new entries before bulk editing.");
    if (ids.some(id => this.isLocked(id))) throw new Error("Some selected entries already have pending bulk edits. Undo them or let them finish first.");
    const batch: BulkBatch = {
      id: crypto.randomUUID(), account, label, createdAt: Date.now(), phase: "staged",
      rows: changes.map(change => ({ id: change.before.id, before: cloneEntry(change.before), patch: { ...change.patch, ...(change.patch?.tags && { tags: [...change.patch.tags] }), ...(change.patch?.tag_ids && { tag_ids: [...change.patch.tag_ids] }) }, delete: !!change.delete, status: "pending" })),
    };
    this.batches = [...this.batches, batch]; this.publish(); return batch;
  }
  overlay(entries: TimeEntry[]): TimeEntry[] {
    const updates = new Map(this.batches.flatMap(batch => batch.rows.filter(active).map(row => [row.id, row] as const)));
    if (!updates.size) return entries;
    // Keep every result and its order, even for a pending deletion or failed write.
    return entries.map(entry => {
      const row = updates.get(entry.id);
      if (!row) return entry;
      return { ...entry, ...row.patch, bulkLocked: true, bulkPendingDelete: row.delete && row.status !== "failed", syncStatus: row.status === "failed" ? "error" : row.status === "saving" ? "syncing" : "pending" };
    });
  }
  undo(batchId: string, id?: number) {
    if (!this.canUndo(batchId, id)) return false;
    const batch = this.batch(batchId)!;
    this.batches = this.batches.map(candidate => candidate.id !== batchId ? candidate : {
      ...candidate, rows: candidate.rows.map(row => (id === undefined || row.id === id) && ["pending", "failed"].includes(row.status) && !row.uncertain ? { ...row, status: "undone" } : row),
    });
    if (!this.batch(batchId)!.rows.some(active)) this.phase(batchId, "settled"); else this.publish();
    if (!this.batch(batchId)!.rows.some(row => row.status === "pending")) this.ports.settled?.(this.batch(batchId)!);
    return batch !== this.batch(batchId);
  }
  undoAll() { let count = 0; for (const batch of [...this.batches].reverse()) if (this.undo(batch.id)) count++; return count; }
  async commit(batchId: string) {
    const batch = this.batch(batchId);
    if (this.disposed || !batch || batch.phase !== "staged") return;
    this.phase(batchId, "committing");
    for (const original of batch.rows) {
      if (this.disposed) break;
      const row = this.batch(batchId)!.rows.find(row => row.id === original.id)!;
      if (row.status !== "pending") continue;
      this.changeRow(batchId, row.id, { status: "saving" });
      try {
        const result = await this.ports.write(batch, row, false);
        if (result.state !== "applied") throw new BulkWriteError("Entry changed in Toggl. Undo the preview to keep the latest data.", false, false, result.current, true);
        if (!this.disposed) this.ports.applied(row);
        this.changeRow(batchId, row.id, { status: "saved", error: undefined, uncertain: false });
      } catch (error) {
        const failure = error instanceof BulkWriteError ? error : new BulkWriteError("Could not confirm the update. Check its status before undoing or retrying.", true, true);
        if (failure.current && !this.disposed) this.ports.applied(row, failure.current);
        this.changeRow(batchId, row.id, { status: "failed", error: failure.message, uncertain: failure.uncertain, conflict: failure.conflict });
        if (failure.stopBatch) {
          this.batches = this.batches.map(candidate => candidate.id !== batchId ? candidate : { ...candidate, rows: candidate.rows.map(item => item.status === "pending" ? { ...item, status: "failed", error: "Not attempted because the batch stopped. Retry explicitly when ready." } : item) });
          this.publish(); break;
        }
      }
    }
    this.phase(batchId, "settled");
    this.ports.settled?.(this.batch(batchId)!);
  }
  async retry(batchId: string, id?: number) {
    const batch = this.batch(batchId);
    if (!batch || batch.phase === "committing" || this.disposed) return;
    this.batches = this.batches.map(candidate => candidate.id !== batchId ? candidate : { ...candidate, phase: "staged", rows: candidate.rows.map(row => row.status === "failed" && !row.uncertain && !row.conflict && (id === undefined || row.id === id) ? { ...row, status: "pending", error: undefined } : row) });
    this.publish(); await this.commit(batchId);
  }
  async check(batchId: string, id: number) {
    const batch = this.batch(batchId), row = batch?.rows.find(row => row.id === id);
    if (!batch || !row || !row.uncertain || row.status !== "failed" || this.disposed || batch.phase === "committing") return;
    this.changeRow(batchId, id, { status: "saving" });
    try {
      const result = await this.ports.write(batch, row, true);
      if (result.state === "applied") {
        this.ports.applied(row); this.changeRow(batchId, id, { status: "saved", uncertain: false, error: undefined });
      } else {
        if (result.current && result.state === "conflict") this.ports.applied(row, result.current);
        this.changeRow(batchId, id, { status: "failed", uncertain: false, conflict: result.state === "conflict", error: result.state === "conflict" ? "Entry changed in Toggl. Undo the preview to show the latest data." : "No write was applied. You can undo or retry this entry." });
      }
    } catch { this.changeRow(batchId, id, { status: "failed", uncertain: true, error: "Could not verify this entry. Check its status again when connected." }); }
  }
  restoration(batchId: string, current: TimeEntry[], id?: number) {
    const batch = this.batch(batchId);
    if (!batch) throw new Error("Batch is no longer available.");
    const changes = batch.rows.filter(row => row.status === "saved" && !row.delete && (id === undefined || row.id === id)).map(row => {
      const entry = current.find(entry => entry.id === row.id);
      if (!entry) throw new Error("Load the affected entries before restoring this batch.");
      for (const key of Object.keys(row.patch) as (keyof BulkPatch)[]) {
        if (JSON.stringify(entry[key]) !== JSON.stringify(row.patch[key])) throw new Error("An entry changed after this batch. Review its current values before restoring.");
      }
      return { before: entry, patch: Object.fromEntries(Object.keys(row.patch).map(key => [key, row.before[key as keyof TimeEntry]])) as BulkPatch };
    });
    return { account: batch.account, changes };
  }
  dispose() {
    this.disposed = true;
    this.batches = this.batches.map(batch => ({ ...batch, rows: batch.rows.map(row => row.status === "pending" ? { ...row, status: "undone" } : row) }));
    this.listeners.clear();
  }
}
