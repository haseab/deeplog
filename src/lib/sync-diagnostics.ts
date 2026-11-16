import type { DescriptionDraft } from "./description-sync";

export const SYNC_LOG_LIMIT = 3000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = "deeplog-sync-diagnostics";
export type SyncDiagnosticInput = {
  event: string;
  entryId?: number;
  account?: string;
  requestId?: string;
  fields?: Record<string, string | number | boolean | null | undefined>;
  texts?: Record<string, string | undefined>;
};
export type SyncDiagnostic = {
  version: 1; id: string; at: number; sequence: number; pageId?: string;
  event: string; entryId?: number; account?: string; requestId?: string;
  fields: SyncDiagnosticInput["fields"];
  texts: Record<string, { hash: string; length: number; encrypted: boolean } | null>;
};
let sequence = 0;
let pageId: string | undefined;
let dbPromise: Promise<IDBDatabase> | undefined;
let pending = Promise.resolve();
let queued = 0;
let dropped = 0;
let storageFailed = false;
let activeAccount = "";
export function setSyncDiagnosticAccount(account: string) { activeAccount = account; }

export async function fingerprintSyncText(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return {
    hash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join(""),
    length: text.length,
    encrypted: /^[A-Za-z0-9+/]{16}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(text),
  };
}

function diagnosticHeader(input: SyncDiagnosticInput) {
  // Capture time/order before asynchronous hashing. Never spread input.texts
  // into the output: descriptions and ciphertext must never enter logs.
  return { version: 1 as const, id: crypto.randomUUID(), at: Date.now(), sequence: ++sequence,
    event: input.event, entryId: input.entryId, account: input.account, requestId: input.requestId,
    fields: { ...input.fields } };
}

async function describe(input: SyncDiagnosticInput, header: ReturnType<typeof diagnosticHeader>): Promise<SyncDiagnostic> {
  const texts = Object.fromEntries(await Promise.all(Object.entries(input.texts ?? {}).map(async ([name, text]) =>
    [name, text === undefined ? null : await fingerprintSyncText(text)])));
  return { ...header, texts };
}

export async function makeSyncDiagnostic(input: SyncDiagnosticInput): Promise<SyncDiagnostic> {
  return describe(input, diagnosticHeader(input));
}

function openLogs() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("events", { autoIncrement: true }).createIndex("at", "at");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
    request.onblocked = () => { dbPromise = undefined; reject(new Error("Diagnostic database blocked")); };
  });
}

async function persist(event: SyncDiagnostic) {
  const db = await openLogs();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("events", "readwrite");
    const events = tx.objectStore("events");
    events.add(event);
    const count = events.count();
    count.onsuccess = () => {
      let excess = count.result - SYNC_LOG_LIMIT;
      const cursor = events.index("at").openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item) return;
        if (excess > 0 || item.value.at < Date.now() - MAX_AGE) {
          item.delete(); excess--; item.continue();
        }
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

/** Best effort: logging never blocks or rejects an edit, sync, or IDB transaction. */
export function recordSyncDiagnostic(input: SyncDiagnosticInput): void {
  if (typeof window === "undefined") return;
  if (queued >= 128) { dropped++; return; }
  try {
    pageId ??= crypto.randomUUID();
    const snapshot = { ...input, account: input.account ?? activeAccount, texts: { ...input.texts },
      fields: { tabId: sessionStorage.getItem("deeplog-draft-tab") ?? undefined, ...input.fields } };
    const header = diagnosticHeader(snapshot);
    queued++;
    pending = pending.then(async () => {
      // Bound hash work as well as disk writes; rapid typing must not flood
      // the crypto worker pool or change event timestamps/order.
      const event = await describe(snapshot, header);
      await persist({ ...event, pageId });
    }).catch(() => { dropped++; storageFailed = true; }).finally(() => { queued--; });
  } catch { dropped++; storageFailed = true; }
}

export function draftDiagnostic(draft?: DescriptionDraft, prefix = "draft") {
  return {
    fields: { [`${prefix}Status`]: draft?.status, [`${prefix}Revision`]: draft?.revision,
      [`${prefix}Owner`]: draft?.owner, [`${prefix}Deleted`]: draft?.deleted ?? false,
      [`${prefix}Attempts`]: draft?.attempts, [`${prefix}RetryAt`]: draft?.retryAt },
    texts: { [`${prefix}Base`]: draft?.base, [`${prefix}Local`]: draft?.local,
      [`${prefix}Remote`]: draft?.remote, [`${prefix}Sent`]: draft?.sent },
  };
}

export async function readSyncDiagnostics(account: string, entryId?: number) {
  await pending;
  const db = await openLogs();
  const events = await new Promise<SyncDiagnostic[]>((resolve, reject) => {
    const request = db.transaction("events").objectStore("events").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return { version: 1, exportedAt: new Date().toISOString(), dropped, storageFailed,
    retention: { maxEvents: SYNC_LOG_LIMIT, maxDays: 7 },
    events: events.filter(e => e.account === account && (entryId === undefined || e.entryId === entryId) && e.at >= Date.now() - MAX_AGE)
      .sort((a, b) => a.at - b.at || (a.pageId === b.pageId ? a.sequence - b.sequence : a.id.localeCompare(b.id))) };
}

export async function downloadSyncDiagnostics(account: string, entryId?: number) {
  if (!account) throw new Error("Connect your account before exporting sync logs.");
  const report = await readSyncDiagnostics(account, entryId);
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `deeplog-sync-${entryId ?? "all"}-${Date.now()}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
