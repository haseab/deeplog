"use client";
import * as React from "react";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "@/lib/toast";
import { TogglRateLimitError } from "@/lib/toggl-rate-limit";
import { BulkTransactions, BulkWriteError, BULK_UNDO_DURATION, type BulkBatch, type BulkPatch, type BulkRow, type BulkWriteResult } from "@/lib/bulk-transactions";
import type { TimeEntry } from "@/types";

const empty: BulkBatch[] = [];
const wireKeys = ["description", "project_id", "tag_ids"] as const;
function wire(entry: BulkPatch) {
  return Object.fromEntries(wireKeys.filter(key => entry[key] !== undefined).map(key => [key, key === "tag_ids" ? entry.tag_ids!.map(Number) : key === "project_id" ? entry.project_id === null ? null : Number(entry.project_id) : entry[key]]));
}

export function useBulkTransactions({ account, reviewing, current, applied }: {
  account: string; reviewing: boolean; current: () => TimeEntry[];
  applied: (row: BulkRow, remote?: BulkPatch) => void;
}) {
  const runtime = React.useRef({ account, reviewing, current, applied });
  runtime.current = { account, reviewing, current, applied };
  const toasts = React.useRef(new Map<string, { id: string; version: symbol }>());
  const armRef = React.useRef<(batch: BulkBatch) => void>(() => {});
  const [store] = React.useState(() => new BulkTransactions({
    async write(batch, row, reviewOnly) {
      const patch = wire(row.patch);
      const expected = row.delete ? {
        ...wire({ description: row.before.description, project_id: row.before.project_id, tag_ids: row.before.tag_ids }), start: row.before.start, stop: row.before.stop || null,
      } : wire(Object.fromEntries(Object.keys(patch).map(key => [key, row.before[key as keyof TimeEntry]])));
      try {
        const response = await apiFetch("/api/time-entries/bulk", {
          method: "POST", headers: { "Content-Type": "application/json", "x-toggl-session-token": localStorage.getItem("toggl_session_token") || "" },
          body: JSON.stringify({ account: batch.account, id: row.id, expected, patch, operation: row.delete ? "delete" : "update", reviewOnly }),
        });
        const result = await response.json();
        if (!response.ok) throw new BulkWriteError(result.error || "Could not save this entry.", response.status !== 409, !!result.uncertain, result.current, response.status === 409);
        if (!["applied", "unchanged", "conflict"].includes(result.state)) throw new BulkWriteError("Could not confirm this update. Check its status before retrying.", true, true);
        return result as BulkWriteResult;
      } catch (error) {
        if (error instanceof BulkWriteError) throw error;
        if (error instanceof TogglRateLimitError) throw new BulkWriteError(error.message, true, false);
        throw new BulkWriteError("Could not confirm this update. Check its status before undoing or retrying.", true, true);
      }
    },
    applied: (row, remote) => runtime.current.applied(row, remote),
    settled(batch) {
      const owned = toasts.current.get(batch.id);
      if (owned) { toasts.current.delete(batch.id); toast.dismiss(owned.id); }
      const saved = batch.rows.filter(row => row.status === "saved").length;
      const failed = batch.rows.filter(row => row.status === "failed").length;
      if (failed) toast.error(`${saved} saved, ${failed} need attention. Results and recovery snapshots are retained.`);
      else if (saved) toast.success(`${saved} ${saved === 1 ? "entry" : "entries"} saved`);
    },
  }));
  const batches = React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => empty);
  const arm = React.useCallback((batch: BulkBatch) => {
    if (batch.phase !== "staged" || !batch.rows.some(row => row.status === "pending")) return;
    const id = `bulk-preview-${batch.id}`, version = Symbol();
    toasts.current.set(batch.id, { id, version });
    const close = () => {
      if (toasts.current.get(batch.id)?.version !== version) return;
      if (runtime.current.reviewing) { armRef.current(store.getSnapshot().find(item => item.id === batch.id)!); return; }
      void store.commit(batch.id);
    };
    toast("Bulk edit preview", {
      id, duration: runtime.current.reviewing ? Infinity : BULK_UNDO_DURATION,
      description: runtime.current.reviewing ? "Undo window paused while reviewing. No writes sent." : "Changes commit when this 30-second Undo toast closes.",
      action: { label: "Undo batch (⌘Z)", onClick: () => { store.undo(batch.id); } },
      // No submitAction: Cmd+Enter in another editor cannot commit this batch early.
      onAutoClose: close, onDismiss: close,
    });
  }, [store]);
  armRef.current = arm;
  React.useEffect(() => {
    for (const batch of store.getSnapshot()) if (batch.phase === "staged") arm(batch);
  }, [reviewing, arm, store]);
  React.useEffect(() => {
    store.activate();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (store.hasUnsettled()) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    const owned = toasts.current;
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      for (const value of owned.values()) toast.dismiss(value.id);
      owned.clear(); store.dispose();
    };
  }, [store]);
  const stage = (label: string, changes: { before: TimeEntry; patch?: BulkPatch; delete?: boolean }[]) => {
    const batch = store.stage(runtime.current.account, label, changes); arm(batch); return batch;
  };
  const restore = (batchId: string, id?: number) => {
    const plan = store.restoration(batchId, runtime.current.current(), id);
    if (plan.account !== runtime.current.account) throw new Error("Account changed. Reopen these entries before restoring.");
    return stage("Restore previous values", plan.changes);
  };
  return { store, batches, stage, restore };
}
