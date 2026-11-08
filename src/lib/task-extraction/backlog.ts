import { randomUUID } from "node:crypto";
import { atomicJson, event, Ledger, validateRecord } from "./ledger";

export class BacklogConflictError extends Error {}

// The caller holds the ledger lock. Back up every selected record before any
// mutation; a partially interrupted batch can safely resume with the same IDs.
export async function skipBacklog(ledger: Ledger, ids: string[], reason: string) {
  const records = await Promise.all(ids.map(async id => {
    const record = await ledger.record(id);
    if (!record) throw new BacklogConflictError(`Recording not found: ${id}`);
    if (!["pending", "failed", "skipped"].includes(record.status) || record.tasks.some(task => ["sending", "needs_review"].includes(task.status))) {
      throw new BacklogConflictError(`Only pending or failed recordings without uncertain deliveries can be skipped: ${record.id}`);
    }
    return record;
  }));
  const selected = records.filter(record => record.status !== "skipped");
  if (!selected.length) return { skipped: ids, backup: null };
  const at = new Date().toISOString();
  const backup = `backlog-skip-${randomUUID()}.json`;
  await atomicJson(ledger.path(backup), { schema: 1, at, reason, records: selected });
  for (const record of selected) {
    const previousStatus = record.status;
    record.status = "skipped";
    record.skip = { at, reason, backup };
    event(record, "backlog_skipped", JSON.stringify({ previousStatus, reason, backup }));
    validateRecord(record);
    await ledger.saveRecord(record);
  }
  return { skipped: ids, backup };
}
