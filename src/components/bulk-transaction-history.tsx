"use client";
import { format, parseISO } from "date-fns";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import type { BulkBatch, BulkRow, BulkTransactions } from "@/lib/bulk-transactions";

export function BulkTransactionHistory({ open, onOpenChange, batches, store, restore, description }: {
  open: boolean; onOpenChange: (open: boolean) => void; batches: BulkBatch[]; store: BulkTransactions;
  restore: (batch: string, entry?: number) => void; description: (text: string, id: number) => string;
}) {
  const actionClass = "h-7 rounded-md px-2 text-xs font-normal";
  const status = (row: BulkRow) => ({ pending: "Waiting", saving: "Saving", saved: row.delete ? "Deleted" : "Saved", failed: row.uncertain ? "Check status" : "Needs review", undone: "Undone" })[row.status];
  const safe = (text: string, id: number) => { try { return description(text, id) || "No description"; } catch { return "Encrypted entry"; } };
  const changes = (row: BulkRow) => row.delete ? "Delete entry" : row.patch.description !== undefined ? `Description: ${safe(row.before.description, row.id)} → ${safe(row.patch.description, row.id)}`
    : row.patch.tags ? `Tags: ${row.before.tags.join(", ") || "No tags"} → ${row.patch.tags.join(", ") || "No tags"}`
    : `Project: ${row.before.project_name || "No project"} → ${row.patch.project_name || "No project"}`;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden rounded-2xl border-border/60 p-6 sm:max-w-2xl">
    <DialogHeader className="shrink-0 text-left"><DialogTitle className="font-medium">Bulk edit history</DialogTitle><DialogDescription>Undo individual entries or whole batches. The 30-second window pauses while you review.</DialogDescription></DialogHeader>
    <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-muted-foreground"><span>{batches.length} {batches.length === 1 ? "batch" : "batches"}</span><Button variant="outline" className={actionClass} disabled={!batches.some(batch => store.canUndo(batch.id))} onClick={() => store.undoAll()}><RotateCcw className="mr-1 h-3 w-3" />Undo all uncommitted</Button></div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      {batches.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Bulk edits will appear here.</p>}
      {[...batches].reverse().map(batch => {
        const saved = batch.rows.filter(row => row.status === "saved").length;
        const waiting = batch.rows.filter(row => row.status === "pending").length;
        const failed = batch.rows.filter(row => row.status === "failed").length;
        return <section key={batch.id} className="overflow-hidden rounded-xl border border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/25 px-4 py-3">
            <div><p className="text-sm font-medium">{batch.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{format(new Date(batch.createdAt), "h:mm:ss a")} · {batch.rows.length} entries{waiting ? ` · ${waiting} waiting` : ""}{saved ? ` · ${saved} saved` : ""}{failed ? ` · ${failed} need review` : ""}</p></div>
            <div className="flex flex-wrap gap-1">
              {store.canUndo(batch.id) && <Button variant="ghost" className={actionClass} onClick={() => store.undo(batch.id)}>Undo batch</Button>}
              {batch.phase !== "committing" && batch.rows.some(row => row.status === "failed" && !row.uncertain && !row.conflict) && <Button variant="ghost" className={actionClass} onClick={() => void store.retry(batch.id)}>Retry failed now</Button>}
              {batch.phase !== "committing" && batch.rows.some(row => row.status === "saved" && !row.delete) && <Button variant="ghost" className={actionClass} onClick={() => restore(batch.id)}>Restore saved entries</Button>}
            </div>
          </div>
          {batch.rows.map(row => <div key={row.id} className="space-y-1.5 border-t border-border/50 px-4 py-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm" title={safe(row.before.description, row.id)}>{safe(row.before.description, row.id)}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{format(parseISO(row.before.start), "MMM d, yyyy · h:mm a")}</p></div><span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{row.status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}{row.status === "saved" && <Check className="h-3 w-3" />}{status(row)}</span></div>
            <p className="break-words text-xs text-muted-foreground">{changes(row)}</p>
            {row.error && row.status === "failed" && <p className="text-xs text-amber-700 dark:text-amber-400">{row.error}</p>}
            <div className="flex flex-wrap gap-1">
              {store.canUndo(batch.id, row.id) && <Button variant="ghost" className={actionClass} onClick={() => store.undo(batch.id, row.id)}>Undo entry</Button>}
              {row.status === "failed" && row.uncertain && <Button variant="outline" className={actionClass} onClick={() => void store.check(batch.id, row.id)}>Check status</Button>}
              {row.status === "failed" && !row.uncertain && !row.conflict && batch.phase !== "committing" && <Button variant="ghost" className={actionClass} onClick={() => void store.retry(batch.id, row.id)}>Retry now</Button>}
              {row.status === "saved" && !row.delete && <Button variant="ghost" className={actionClass} onClick={() => restore(batch.id, row.id)}>Restore entry</Button>}
            </div>
          </div>)}
        </section>;
      })}
    </div>
    <div className="shrink-0 space-y-3 border-t border-border/60 pt-3"><p className="text-xs leading-relaxed text-muted-foreground">Closing the preview toast commits its remaining changes. Deletions can only be undone before the commit starts. Restoring a saved edit creates a new 30-second preview.</p><div className="flex justify-end"><Button variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>Done reviewing</Button></div></div>
  </DialogContent></Dialog>;
}
