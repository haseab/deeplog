import type { DescriptionDraft, DescriptionHistory } from "./description-sync";
import { draftDiagnostic, recordSyncDiagnostic } from "./sync-diagnostics";
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("deeplog-description-drafts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("drafts", { keyPath: "key" });
      request.result.createObjectStore("history", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error("Close other DeepLog tabs to upgrade local storage.")); };
  });
}
export async function listDrafts(account: string): Promise<DescriptionDraft[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction("drafts").objectStore("drafts").getAll();
    req.onsuccess = () => resolve(req.result.filter((d: DescriptionDraft) => d.account === account));
    req.onerror = () => reject(req.error);
  });
}
/** Read/modify/write within one transaction prevents lost browser-tab updates. */
export async function changeDraft(key: string, change: (old?: DescriptionDraft) => DescriptionDraft | undefined, history?: DescriptionHistory) {
  const db = await open();
  return new Promise<DescriptionDraft | undefined>((resolve, reject) => {
    const tx = db.transaction(["drafts", "history"], "readwrite");
    const store = tx.objectStore("drafts");
    let result: DescriptionDraft | undefined;
    let previous: DescriptionDraft | undefined;
    let crossTabConflict = false;
    const req = store.get(key);
    req.onsuccess = () => {
      try {
        previous = req.result as DescriptionDraft | undefined;
        result = change(req.result);
        if (previous && result && previous.owner !== result.owner && previous.local !== result.local && previous.status !== "synced") {
          crossTabConflict = true;
          tx.objectStore("history").put({ key: crypto.randomUUID(), account: previous.account, entryId: previous.entryId, local: previous.local, remote: previous.remote, at: Date.now() });
          result = { ...result, status: "conflict", remote: undefined, error: "Another browser tab edited this draft. Its version is preserved in recovery history." };
        }
        if (previous?.status === "conflict" && result?.status === "local" && !history) {
          tx.objectStore("history").put({ key: crypto.randomUUID(), account: previous.account, entryId: previous.entryId, local: previous.local, remote: previous.remote, at: Date.now() });
        }
        if (result) store.put(result); else store.delete(key);
        if (history) tx.objectStore("history").put(history);
      } catch { tx.abort(); }
    };
    tx.oncomplete = () => {
      const identity = result ?? previous;
      const before = draftDiagnostic(previous, "before"), after = draftDiagnostic(result, "after");
      if (identity) recordSyncDiagnostic({ event: crossTabConflict ? "draft.cross-tab-conflict" : "draft.persisted", account: identity.account, entryId: identity.entryId,
        fields: { ...before.fields, ...after.fields, archived: !!history, removed: !result, ownerChanged: previous?.owner !== result?.owner }, texts: { ...before.texts, ...after.texts } });
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      const identity = result ?? previous;
      if (identity) recordSyncDiagnostic({ event: "draft.storage-failed", account: identity.account, entryId: identity.entryId, fields: { errorType: tx.error?.name ?? "TransactionAborted" } });
      reject(tx.error ?? new Error("Local draft could not be saved."));
    };
  });
}
export async function listHistory(account: string): Promise<DescriptionHistory[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction("history").objectStore("history").getAll();
    req.onsuccess = () => resolve(req.result.filter((d: DescriptionHistory) => d.account === account).sort((a: DescriptionHistory, b: DescriptionHistory) => b.at - a.at));
    req.onerror = () => reject(req.error);
  });
}
