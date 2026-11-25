"use client";

import { prepareDescriptionUpload } from "@/lib/description-sync";

import { apiFetch, togglRetryAt } from "@/lib/api-fetch";
import { TogglRateLimitError } from "@/lib/toggl-rate-limit";

import * as React from "react";
import { entryMutations } from "@/lib/entry-mutations";
import { AlertTriangle, HardDrive, Loader2, History, Check, X, Download } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useEncryptionContext } from "./encryption-context";
import { encryptDescription, decryptDescription } from "@/lib/encryption";
import { isEncryptedDescription } from "@/lib/ai-summary";
import { needsDescriptionUpload, acknowledgeDraft, refreshDescriptionConflict, resolveEditedDescription, type DescriptionDraft, type DescriptionHistory } from "@/lib/description-sync";
import { changeDraft, listDrafts, listHistory } from "@/lib/description-draft-store";
import { bindingFromEvent } from "@/lib/keyboard-shortcuts";
import { downloadSyncDiagnostics, draftDiagnostic, recordSyncDiagnostic, setSyncDiagnosticAccount } from "@/lib/sync-diagnostics";

type DraftContext = {
  drafts: Map<number, DescriptionDraft>;
  syncing: Set<number>;
  save: (id: number, base: string, text: string, notify?: boolean, undoDescription?: string, start?: string) => Promise<void>;
  decode: (text: string, id: number) => string;
  getDescription: (id: number, fallback: string) => string;
  hasPendingDescriptionToast: (id: number) => boolean;
  commit: (id: number) => void;
  open: (id: number) => void;
  ready: boolean;
};
const Context = React.createContext<DraftContext | null>(null);
export const useDescriptionDrafts = () => React.useContext(Context);

export function DescriptionDraftsProvider({ children }: { children: React.ReactNode }) {
  const encryption = useEncryptionContext();
  const [account, setAccount] = React.useState("");
  const [drafts, setDrafts] = React.useState(new Map<number, DescriptionDraft>());
  // Reads must see keystrokes before IndexedDB finishes persisting them.
  const savingDescriptions = React.useRef(new Map<number, { text: string; persisted?: Promise<unknown> }>());
  // Toast lifetime is independent of background upload status. Register before
  // persistence so immediately reopening the editor also resumes its caret.
  const pendingDescriptionToasts = React.useRef(new Map<number, symbol>());
  const hasPendingDescriptionToast = React.useCallback((id: number) => pendingDescriptionToasts.current.has(id), []);
  const draftsRef = React.useRef(drafts);
  draftsRef.current = drafts;
  const [syncing, setSyncing] = React.useState(new Set<number>());
  const [selected, setSelected] = React.useState<number | null>(null);
  const [reviewMode, setReviewMode] = React.useState<"single" | "queue">("single");
  const reviewRef = React.useRef<HTMLElement>(null);
  const choiceRefs = React.useRef<Partial<Record<"mine" | "toggl", HTMLButtonElement | null>>>({});
  const [selectedChoice, setSelectedChoice] = React.useState<"mine" | "toggl">("mine");
  const [merge, setMerge] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const navigationRevision = React.useRef(0);
  const [history, setHistory] = React.useState<DescriptionHistory[] | null>(null);
  const [storageError, setStorageError] = React.useState("");
  const owner = React.useRef("");
  const failedDrafts = React.useRef(new Map<number, DescriptionDraft>());
  const accountRef = React.useRef("");
  const timelineReady = React.useRef(false);
  const tokenRef = React.useRef("");
  const channel = React.useRef<BroadcastChannel | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictChecks = React.useRef(new Map<string, number>());
  const work = React.useRef<() => Promise<void>>(async () => {});
  const encryptionRef = React.useRef(encryption);
  encryptionRef.current = encryption;
  const pending = React.useMemo(() => [...drafts.values()]
    .filter(d => d.status !== "synced")
    .sort((a, b) => b.updatedAt - a.updatedAt || b.entryId - a.entryId), [drafts]);

  const refresh = React.useCallback(async () => {
    const active = accountRef.current;
    if (!active) return;
    const items = await listDrafts(active);
    if (active === accountRef.current) {
      const next = new Map(items.map(d => [d.entryId, d]));
      for (const [id, draft] of failedDrafts.current) if (draft.account === active) next.set(id, draft);
      draftsRef.current = next;
      setDrafts(next);
    }
  }, []);
  const publish = React.useCallback(async () => {
    await refresh();
    channel.current?.postMessage("changed");
  }, [refresh]);
  const schedule = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void work.current(), 1200);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    owner.current = sessionStorage.getItem("deeplog-draft-tab") ?? crypto.randomUUID();
    sessionStorage.setItem("deeplog-draft-tab", owner.current);
    async function identify() {
      const token = localStorage.getItem("toggl_session_token") ?? "";
      if (token !== tokenRef.current) {
        setSyncDiagnosticAccount("");
        timelineReady.current = false;
        accountRef.current = "";
        savingDescriptions.current.clear();
        pendingDescriptionToasts.current.clear();
        draftsRef.current = new Map();
        setAccount(""); setDrafts(new Map()); setSelected(null); setHistory(null);
      }
      tokenRef.current = token;
      if (!token) return;
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        const key = "deeplog-draft-account:" + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
        const cached = localStorage.getItem(key);
        if (cached && !cancelled && token === tokenRef.current) {
          setSyncDiagnosticAccount(cached);
          accountRef.current = cached; setAccount(cached); await refresh();
        }
        const response = await apiFetch("/api/validate-session-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionToken: token }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || token !== tokenRef.current) return;
        const identity = `${data.user.id}:${data.workspace.id}`;
        localStorage.setItem(key, identity);
        accountRef.current = identity; setAccount(identity);
        setSyncDiagnosticAccount(identity);
        recordSyncDiagnostic({ event: "browser.ready", account: identity, fields: { tabId: owner.current, online: navigator.onLine } });
        for (const draft of await listDrafts(identity)) {
          if (draft.status === "error") await changeDraft(draft.key, current => current && ({ ...current, retryAt: undefined }));
        }
        await refresh(); schedule();
      } catch { /* A previously verified account can keep drafting while offline. */ }
    }
    void identify();
    const onTimelineReady = () => {
      if (timelineReady.current) return;
      timelineReady.current = true;
      schedule();
    };
    window.addEventListener("deeplog-timeline-ready", onTimelineReady);
    const online = () => { conflictChecks.current.clear(); void identify(); };
    const visible = () => {
      if (document.visibilityState === "visible") { conflictChecks.current.clear(); schedule(); }
    };
    const storage = (event: StorageEvent) => { if (event.key === "toggl_session_token") void identify(); };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storage);
    const interval = setInterval(() => {
      if (localStorage.getItem("toggl_session_token") !== tokenRef.current || !accountRef.current) void identify();
      else void work.current();
    }, 30000);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("deeplog-description-drafts");
      channel.current.onmessage = () => {
        recordSyncDiagnostic({ event: "browser.other-tab-notification", account: accountRef.current, fields: { tabId: owner.current } });
        void refresh().then(schedule).catch(() => {});
      };
    }
    return () => {
      cancelled = true; clearInterval(interval); if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("deeplog-timeline-ready", onTimelineReady);
      window.removeEventListener("online", online); window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
      channel.current?.close();
    };
  }, [refresh, schedule]);

  const decode = React.useCallback((text: string, id: number) => {
    if (!isEncryptedDescription(text)) return text;
    const key = encryptionRef.current.getSessionKey();
    if (!key || !encryptionRef.current.isUnlocked) throw new Error("Unlock encryption to access this draft.");
    return decryptDescription(text, key, id);
  }, []);
  const getDescription = React.useCallback((id: number, fallback: string) => {
    const saving = savingDescriptions.current.get(id);
    if (saving) return saving.text;
    const draft = draftsRef.current.get(id);
    if (draft && draft.status !== "synced") {
      try { return decode(draft.local, id); } catch { /* Preserve locked content. */ }
    }
    return fallback;
  }, [decode]);
  const encode = React.useCallback((text: string, id: number, base: string) => {
    const enc = encryptionRef.current;
    if (!enc.isE2EEEnabled && !isEncryptedDescription(base)) return text;
    const key = enc.getSessionKey();
    if (!key || !enc.isUnlocked) throw new Error("Unlock encryption before editing descriptions.");
    const result = encryptDescription(text, key, id);
    enc.markEntryEncrypted(id);
    return result;
  }, []);
  const request = React.useCallback(async (draft: DescriptionDraft, reviewOnly = false, queued = true) => {
    if (draft.account !== accountRef.current || localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed; reopen the app before syncing.");
    const requestId = crypto.randomUUID();
    const queuedAt = Date.now();
    recordSyncDiagnostic({ event: "request.queued", account: draft.account, entryId: draft.entryId, requestId,
      ...draftDiagnostic(draft), fields: { ...draftDiagnostic(draft).fields, tabId: owner.current, reviewOnly } });
    const send = async () => {
      if (draft.account !== accountRef.current || localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed; reopen the app before syncing.");
      const started = Date.now();
      let responseStatus: number | undefined;
      recordSyncDiagnostic({ event: "request.started", account: draft.account, entryId: draft.entryId, requestId, fields: { tabId: owner.current, reviewOnly, queueWaitMs: started - queuedAt, revision: draft.revision } });
      try {
        const response = await apiFetch(`/api/time-entries/${draft.entryId}/description`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-toggl-session-token": tokenRef.current,
            "x-deeplog-sync-request-id": requestId, "x-deeplog-tab-id": owner.current, "x-deeplog-revision": String(draft.revision ?? 0) },
          body: JSON.stringify({ account: draft.account, base: draft.base, local: draft.local, reviewOnly, ...(draft.uncertainUploads ? { uncertainUploads: draft.uncertainUploads } : {}) }), signal: AbortSignal.timeout(20000),
        });
        responseStatus = response.status;
        const data = await response.json();
        recordSyncDiagnostic({ event: "request.finished", account: draft.account, entryId: draft.entryId, requestId,
          fields: { status: response.status, reviewOnly, durationMs: Date.now() - started, deleted: !!data.deleted,
            remoteMatchesBase: data.description === draft.base, remoteMatchesLocal: data.description === draft.local, remoteMatchesSent: typeof data.description === "string" && data.description === draft.sent },
          texts: { base: draft.base, local: draft.local, remote: typeof data.description === "string" ? data.description : undefined, sent: draft.sent } });
        if (response.status !== 409 && !response.ok) throw new Error(data.error ?? `Sync failed (${response.status})`);
        return { requestId, conflict: response.status === 409, remote: data.description as string | undefined, deleted: !!data.deleted, deletionConfirmed: !!data.deletionConfirmed, start: data.start as string | undefined };
      } catch (error) {
        recordSyncDiagnostic({ event: "request.failed", account: draft.account, entryId: draft.entryId, requestId,
          fields: { status: error instanceof TogglRateLimitError ? error.status : responseStatus, durationMs: Date.now() - started, errorType: error instanceof Error ? error.name : "Unknown", reviewOnly } });
        throw error;
      }
    };
    return queued ? entryMutations.run([draft.entryId], send) : send();
  }, []);
  const notifySynced = (id: number, description: string) => window.dispatchEvent(new CustomEvent("deeplog-description-synced", { detail: { id, description } }));

  // Reserve immediately, before split/combine reserves its dependent write.
  // Waiting inside that later mutation would put the upload behind itself.
  const commit = React.useCallback((id: number) => {
    if (id < 0) return;
    const active = accountRef.current;
    const persistence = savingDescriptions.current.get(id)?.persisted;
    const operation = entryMutations.reserve([id], async () => {
      await persistence;
      if (active !== accountRef.current) throw new Error("Account changed; reopen the entry.");
      if (failedDrafts.current.has(id)) throw new Error("Save the description locally before continuing.");
      const draft = (await listDrafts(active)).find(draft => draft.entryId === id);
      if (!draft || draft.status === "synced") return;
      if (draft.status === "conflict") throw new Error("Resolve the description conflict before continuing.");
      try {
        const snapshot = await changeDraft(draft.key, current => current && prepareDescriptionUpload(current));
        if (!snapshot || snapshot.status === "conflict") throw new Error("Description changed; review it before continuing.");
        const result = await request(snapshot, false, false);
        if (result.conflict) {
          await changeDraft(snapshot.key, current => current && ({ ...current, status: "conflict", remote: result.remote, deleted: result.deleted, deletionConfirmed: result.deletionConfirmed, sent: undefined }));
          throw new Error("Resolve the description conflict before continuing.");
        }
        await changeDraft(snapshot.key, current => current && acknowledgeDraft(current, snapshot, result.remote!));
        notifySynced(id, result.remote!);
      } finally {
        await publish();
      }
    });
    void operation.run().catch(error => toast.error(error instanceof Error ? error.message : "Description sync failed"));
  }, [request, publish]);

  work.current = async () => {
    const active = accountRef.current;
    if (!active || !timelineReady.current || !navigator.onLine || !navigator.locks || togglRetryAt(tokenRef.current) > Date.now()) return;
    await navigator.locks.request(`deeplog-description-sync:${active}`, { ifAvailable: true }, async lock => {
      if (!lock) return;
      for (const draft of await listDrafts(active)) {
        // Reconcile matching conflicts read-only, with a bounded check interval.
        if (draft.status === "conflict" && active === accountRef.current) {
          // Conflicts are read-only here. Recheck without making the user open
          // the review, but do not poll every keystroke or retry after a choice.
          if (Date.now() - (conflictChecks.current.get(draft.key) ?? 0) < 300000) continue;
          conflictChecks.current.set(draft.key, Date.now());
          try {
            const check = await request(draft, true);
            const updated = await changeDraft(draft.key, current => current && refreshDescriptionConflict(current, draft, check));
            if (updated?.status === "synced") notifySynced(draft.entryId, updated.local);
            await publish();
          } catch { /* Keep the draft and last comparison until a read succeeds. */ }
          continue;
        }
        if (!needsDescriptionUpload(draft) || failedDrafts.current.has(draft.entryId) || active !== accountRef.current) continue;
        const id = draft.entryId;
        setSyncing(old => new Set(old).add(id));
        try {
          // The API reconciles an uncertain prior upload with its one fresh
          // conflict read, instead of doing a separate review request first.
          const snapshot = await changeDraft(draft.key, current => current && current.status !== "conflict" ? prepareDescriptionUpload(current) : current);
          if (!snapshot || snapshot.status === "conflict") continue;
          const result = await request(snapshot);
          if (result.conflict) {
            await changeDraft(snapshot.key, current => current && ({ ...current, status: "conflict", remote: result.remote, deleted: result.deleted, deletionConfirmed: result.deletionConfirmed, start: result.start ?? current.start, sent: undefined, uncertainUploads: undefined, error: undefined }));
          } else {
            const acknowledged = await changeDraft(snapshot.key, current => current && acknowledgeDraft(current, snapshot, result.remote!));
            recordSyncDiagnostic({ event: "upload.acknowledged", account: active, entryId: id, requestId: result.requestId, ...draftDiagnostic(acknowledged),
              fields: { ...draftDiagnostic(acknowledged).fields, uploadedRevision: snapshot.revision, newerEditPresent: acknowledged?.revision !== snapshot.revision,
                remoteMatchesCurrentLocal: result.remote === acknowledged?.local }, texts: { ...draftDiagnostic(acknowledged).texts, uploaded: snapshot.local, returned: result.remote } });
            notifySynced(id, result.remote!);
          }
        } catch (error) {
          await changeDraft(draft.key, current => current && current.status !== "conflict" ? { ...current, status: "error", attempts: (current.attempts ?? 0) + 1, retryAt: error instanceof TogglRateLimitError ? error.retryAt : Date.now() + Math.min(300000, 30000 * 2 ** (current.attempts ?? 0)), error: error instanceof Error ? error.message : "Waiting to retry" } : current);
          if (error instanceof TogglRateLimitError) break;
        } finally {
          setSyncing(old => { const next = new Set(old); next.delete(id); return next; });
          await publish();
          // An edit can arrive while this upload owns the lock; its timer may
          // already have fired. Explicitly drain that newer revision next.
          if ((await listDrafts(active)).some(d => d.status === "local")) schedule();
        }
      }
    }).catch(error => setStorageError(error instanceof Error ? error.message : "Local storage unavailable"));
  };

  const save = React.useCallback(async (entryId: number, base: string, text: string, notify = false, undoDescription?: string, start?: string) => {
    const active = accountRef.current;
    const toastSession = notify ? Symbol() : undefined;
    if (toastSession) pendingDescriptionToasts.current.set(entryId, toastSession);
    const finishToast = () => {
      if (pendingDescriptionToasts.current.get(entryId) === toastSession) {
        pendingDescriptionToasts.current.delete(entryId);
      }
    };
    recordSyncDiagnostic({ event: "edit.requested", account: active, entryId,
      fields: { tabId: owner.current, notify, encryptionEnabled: encryptionRef.current.isE2EEEnabled, inputMatchesBase: base === text }, texts: { suppliedBase: base, input: text } });
    const saving: { text: string; persisted?: Promise<unknown> } = { text };
    try {
      if (localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed. Reopen the app before editing.");
      if (!active) throw new Error("Connect once to verify your account before saving offline drafts.");
      const local = encode(text, entryId, base);
      savingDescriptions.current.set(entryId, saving);
      const saved = await (saving.persisted = changeDraft(`${active}:${entryId}`, old => {
        if (old && decode(old.local, entryId) === text && (old.status !== "synced" || old.base === base)) return { ...old, start: start ?? old.start };
        return resolveEditedDescription({ ...old, key: `${active}:${entryId}`, account: active, entryId, start: start ?? old?.start, base: old && old.status !== "synced" ? old.base : base,
          local, owner: owner.current, revision: (old?.revision ?? 0) + 1, updatedAt: Date.now(), status: old?.status === "conflict" ? "conflict" : "local", error: undefined, attempts: 0, retryAt: undefined });
      }));
      recordSyncDiagnostic({ event: "edit.saved", account: active, entryId, ...draftDiagnostic(saved), fields: { ...draftDiagnostic(saved).fields, tabId: owner.current } });
      failedDrafts.current.delete(entryId);
      if (saved?.status === "conflict") conflictChecks.current.delete(saved.key);
      setStorageError(""); await publish(); schedule();
      if (notify && saved) {
        const submitted = saved;
        const undoText = undoDescription ?? decode(base, entryId);
        const configuredDuration = Number(localStorage.getItem("toast_duration") ?? 4000);
        toast("Description updated.", {
          id: `description-submit-${entryId}`,
          duration: Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : 4000,
          onDismiss: finishToast,
          onAutoClose: finishToast,
          submitAction: () => {
            if (accountRef.current !== active || localStorage.getItem("toggl_session_token") !== tokenRef.current) {
              toast.error("Account changed. Reopen the entry before syncing.");
              return false;
            }
            // Use the same immediate-submit action as the other Undo toasts.
            // The worker preserves offline drafts and skips already-synced ones.
            finishToast();
            void work.current();
            return true;
          },
          action: {
            label: "Undo (⌘Z)",
            onClick: () => {
              finishToast();
              void (async () => {
                try {
                  if (accountRef.current !== active || localStorage.getItem("toggl_session_token") !== tokenRef.current) {
                    throw new Error("Account changed. Reopen the entry before undoing.");
                  }
                  const restored = encode(undoText, entryId, submitted.local);
                  let changed = false;
                  await changeDraft(submitted.key, current => {
                    // Sync acknowledgements may advance the base, but a newer
                    // edit (including another tab's) must never be overwritten.
                    if (!current || current.revision !== submitted.revision || current.local !== submitted.local) return current;
                    changed = true;
                    return { ...current, local: restored, owner: owner.current,
                      revision: current.revision + 1, updatedAt: Date.now(),
                      status: current.status === "conflict" ? "conflict" : "local",
                      error: undefined, attempts: 0, retryAt: undefined };
                  });
                  if (!changed) throw new Error("Description changed again. Undo skipped to preserve the newer edit.");
                  await publish();
                  schedule();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not undo description.");
                }
              })();
            },
          },
        });
      } else if (notify) {
        finishToast();
      }
    } catch (error) {
      finishToast();
      const message = error instanceof Error ? error.message : "Local storage is unavailable";
      const failed: DescriptionDraft = { key: `${active}:${entryId}`, account: active, entryId, base, local: text, start, revision: 0, updatedAt: Date.now(), status: "error", error: `NOT SAVED LOCALLY: ${message}` };
      failedDrafts.current.set(entryId, failed);
      draftsRef.current = new Map(draftsRef.current).set(entryId, failed);
      setDrafts(draftsRef.current);
      setStorageError(message); toast.error(message, { id: "description-storage-error" });
    } finally {
      if (savingDescriptions.current.get(entryId) === saving) savingDescriptions.current.delete(entryId);
    }
  }, [encode, decode, publish, schedule]);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (failedDrafts.current.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const navigateToEntry = React.useCallback(async (id: number, reveal = false) => {
    const revision = ++navigationRevision.current;
    const draft = drafts.get(id);
    const navigate = (start?: string, deleted = false) => {
      const event = new CustomEvent("deeplog-description-navigate", { cancelable: true, detail: { id, start, deleted } });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    // Reviewing or advancing drafts may highlight an already loaded entry, but
    // only the explicit Go action may change the user's timeline range.
    if (!reveal) return navigate();
    if (navigate() || (draft?.start && !draft.deleted && navigate(draft.start))) return true;
    try {
      const check = await request({ account: accountRef.current, entryId: id, base: "", local: "" } as DescriptionDraft, true);
      if (revision !== navigationRevision.current) return false;
      const start = check.start ?? (check.deleted ? draft?.start : undefined);
      if (start) {
        if (draft) {
          await changeDraft(draft.key, current => current && refreshDescriptionConflict(current, draft, { ...check, start }));
          await publish();
        }
        return navigate(start, check.deleted);
      }
      if (reveal) toast.error(check.deleted
        ? "Toggl could not find this entry ID, and its original time wasn't saved. Its place in the timeline is unavailable."
        : "The original entry time is unavailable. Please try again when connected.");
    } catch (error) { if (reveal && revision === navigationRevision.current) toast.error(error instanceof Error ? error.message : "Could not locate entry"); }
    return false;
  }, [drafts, request, publish]);
  const openHistory = (index: number) => {
    setHistoryIndex(index); setSelected(null);
    if (history?.[index]) void navigateToEntry(history[index].entryId);
  };
  const openDraft = React.useCallback(async (id: number, mode: "single" | "queue" = "single") => {
    recordSyncDiagnostic({ event: "review.opened", account: accountRef.current, entryId: id, fields: { mode, tabId: owner.current } });
    setReviewMode(mode); setSelectedChoice("mine"); setSelected(id); setHistory(null); setMerge(null); void navigateToEntry(id);
    const draft = drafts.get(id);
    if (draft?.status === "conflict" && navigator.onLine) {
      try {
        const check = await request(draft, true);
        const updated = await changeDraft(draft.key, current => current && refreshDescriptionConflict(current, draft, check));
        if (updated?.status === "synced") {
          notifySynced(id, updated.local);
          setSelected(current => current === id ? null : current);
          toast("This description is already synced with Toggl.");
        }
        await publish();
      } catch (e) { toast.error((e as Error).message); }
    }
  }, [drafts, request, publish, navigateToEntry]);

  React.useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing ||
          document.documentElement.hasAttribute("data-settings-open") ||
          document.documentElement.hasAttribute("data-shortcut-recording") ||
          bindingFromEvent(event) !== "Mod+;") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy || event.repeat) return;
      const conflicts = pending.filter(d => d.status === "conflict");
      if (!conflicts.length) {
        toast("No local description conflicts.", { id: "description-no-conflicts" });
        return;
      }
      const index = conflicts.findIndex(d => d.entryId === selected);
      void openDraft(conflicts[(index + 1) % conflicts.length].entryId, "queue");
    };
    // Window capture normalizes customized shortcuts before this listener runs.
    // Document capture also works inside editors and the review panel.
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [busy, pending, selected, openDraft]);
  const retry = async (draft: DescriptionDraft) => {
    if (failedDrafts.current.has(draft.entryId)) {
      await save(draft.entryId, draft.base, draft.local);
    } else {
      await changeDraft(draft.key, current => current && ({ ...current, retryAt: undefined }));
      await work.current();
    }
  };
  const selectedDraft = selected === null ? undefined : drafts.get(selected);
  React.useEffect(() => {
    if (selected === null || busy) return;
    // Editors can have a focus request queued for the current frame.
    const frame = requestAnimationFrame(() => (choiceRefs.current.mine ?? reviewRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [selected, selectedDraft?.status, selectedDraft?.deleted, selectedDraft?.remote, busy]);
  const safeDecode = (text: string | undefined, id: number) => { try { return decode(text ?? "", id); } catch { return "Unlock encryption to view this description."; } };
  const resolve = async (choice: "mine" | "toggl" | "complete") => {
    if (!selectedDraft || busy || !navigator.locks) return;
    setBusy(true);
    recordSyncDiagnostic({ event: "review.choice", account: selectedDraft.account, entryId: selectedDraft.entryId,
      fields: { choice, mode: reviewMode, revision: selectedDraft.revision } });
    try {
      await navigator.locks.request(`deeplog-description-sync:${selectedDraft.account}`, async () => {
        const shown = selectedDraft;
        if (shown.account !== accountRef.current || localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed; reopen the app before resolving drafts.");
        const latest = (await listDrafts(shown.account)).find(d => d.key === shown.key);
        if (!latest || latest.revision !== shown.revision) throw new Error("Your local draft changed. Review the updated comparison.");
        if (choice === "complete") {
          if (navigator.onLine) {
            const check = await request(shown, true);
            if (!check.deleted) {
              const updated = await changeDraft(shown.key, current => current && refreshDescriptionConflict(current, shown, check));
              if (updated?.status === "synced") notifySynced(shown.entryId, updated.local);
              throw new Error("This entry is available in Toggl. The comparison has been refreshed; your draft was kept.");
            }
          }
          // Archive and clear atomically, including offline. A failed history
          // write must leave the pending draft available for recovery.
          await changeDraft(shown.key, current => {
            if (!current?.deleted || current.revision !== shown.revision) throw new Error("Draft changed");
            return undefined;
          }, { key: crypto.randomUUID(), account: shown.account, entryId: shown.entryId, local: shown.local, remote: shown.remote, at: Date.now() });
        } else {
          const check = await request(shown, true);
          if (check.deleted || check.remote !== shown.remote) {
            await changeDraft(shown.key, current => current && refreshDescriptionConflict(current, shown, check));
            throw new Error(check.deleted ? "Toggl could not find this entry. Your draft is available to copy." : "Toggl changed again. Review the updated comparison.");
          }
          const local = choice === "toggl" ? check.remote! : shown.local;
          const updated = await changeDraft(shown.key, current => {
            if (!current || current.revision !== shown.revision) throw new Error("Draft changed");
            return { ...current, base: check.remote!, local, status: choice === "toggl" ? "synced" : "local", revision: current.revision + 1, remote: undefined, sent: undefined, uncertainUploads: undefined, deleted: false, error: undefined };
          }, { key: crypto.randomUUID(), account: shown.account, entryId: shown.entryId, local: shown.local, remote: check.remote, at: Date.now() });
          if (updated?.status === "synced") notifySynced(shown.entryId, local);
        }
        const remaining = pending.filter(d => d.entryId !== shown.entryId);
        if (reviewMode === "queue" && remaining.length) void openDraft(remaining[0].entryId, "queue");
        else { setSelected(null); setMerge(null); }
        schedule();
      });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not resolve conflict"); }
    finally { await publish(); setBusy(false); }
  };
  return <Context.Provider value={{ drafts, syncing, save, decode, getDescription, hasPendingDescriptionToast, commit, open: id => { void openDraft(id); }, ready: !!account }}>
    {children}
    <div role="group" aria-label="Pending description drafts" className="fixed bottom-16 right-4 z-40 flex max-w-[calc(100vw-2rem)] max-h-32 flex-wrap items-center gap-2 overflow-auto rounded-md border bg-background p-2 shadow-sm">
      {storageError && <span role="alert" className="max-w-xs text-xs text-destructive">Not saved: {storageError}</span>}
      {pending.map(d => <DescriptionDraftIcon key={d.entryId} entryId={d.entryId} onOpen={() => { if (!busy) void openDraft(d.entryId, "queue"); }} />)}
      <button aria-label="Download sync diagnostics" title="Download sync diagnostics" disabled={!account} className="p-1 text-muted-foreground" onClick={() => void downloadSyncDiagnostics(account).catch(() => toast.error("Could not export sync diagnostics"))}><Download className="h-4 w-4" /></button>
      <button aria-label="Description recovery history" title="Description recovery history" className="p-1 text-muted-foreground" onClick={() => void listHistory(account).then(items => { setSelected(null); setHistoryIndex(0); setHistory(items); if (items[0]) void navigateToEntry(items[0].entryId); }).catch(() => toast.error("Could not read recovery history"))}><History className="h-4 w-4" /></button>
    </div>
    {selected !== null && <section ref={reviewRef} tabIndex={-1} role="dialog" aria-labelledby="description-review-title" className="fixed bottom-16 right-4 z-50 w-[calc(100%-2rem)] max-w-xl max-h-[65vh] overflow-y-auto rounded-xl border bg-background p-5 shadow-xl" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !busy) { setSelected(null); navigationRevision.current++; }
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target !== event.currentTarget && !target.closest("[data-description-choice]")) return;
      if (busy) { event.preventDefault(); return; }
      if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const choice = selectedChoice === "mine" ? "toggl" : "mine";
        choiceRefs.current[choice]?.focus();
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (!event.repeat) choiceRefs.current[selectedChoice]?.click();
      }
    }}>
        <button aria-label="Close review" disabled={busy} className="absolute right-4 top-4" onClick={() => { setSelected(null); navigationRevision.current++; }}><X className="h-4 w-4" /></button>
        <h2 id="description-review-title" className="pr-6 text-lg font-semibold">{selectedDraft?.status === "conflict" ? "Choose a description" : "Local description"}</h2>
        <p className="my-2 text-sm text-muted-foreground">Entry {selected} · {selectedDraft?.status === "synced" ? "Synced" : selectedDraft?.status === "conflict" ? "Conflict" : "Waiting to sync"}</p>
        <Button variant="outline" size="sm" className="mb-3" disabled={busy} onClick={() => {
          void navigateToEntry(selected, true).then(located => {
            if (located) { setSelected(current => current === selected ? null : current); setMerge(null); }
          });
        }}>Go to time entry</Button>
        <Button variant="ghost" size="sm" className="mb-3 ml-2" disabled={!account} onClick={() => void downloadSyncDiagnostics(account, selected).catch(() => toast.error("Could not export sync diagnostics"))}>Download entry logs</Button>
        {reviewMode === "queue" && <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={busy || pending.findIndex(d => d.entryId === selected) <= 0} onClick={() => void openDraft(pending[pending.findIndex(d => d.entryId === selected) - 1].entryId, "queue")}>Previous</Button>
          <span className="text-xs text-muted-foreground">{Math.max(0, pending.findIndex(d => d.entryId === selected) + 1)} of {pending.length} pending</span>
          <Button variant="outline" size="sm" disabled={busy || pending.findIndex(d => d.entryId === selected) < 0 || pending.findIndex(d => d.entryId === selected) >= pending.length - 1} onClick={() => void openDraft(pending[pending.findIndex(d => d.entryId === selected) + 1].entryId, "queue")}>Next</Button>
        </div>}
        {selectedDraft && <>
          {selectedDraft.error && <p role="alert" className="text-sm text-destructive">{selectedDraft.error}</p>}
          {selectedDraft.deleted && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">{selectedDraft.deletionConfirmed ? "Toggl confirms this entry was deleted." : "Toggl could not find this entry ID. This does not confirm deletion; a combined or replacement entry may have a different ID."} Click the Toggl copy to mark complete. Your draft will remain in recovery history.</p>}
          {selectedDraft.status === "conflict" && !selectedDraft.deleted && selectedDraft.remote !== undefined && <p className="mb-3 text-xs text-muted-foreground">Use arrow keys to select a copy. Press Enter to keep it.</p>}
          <div className="grid gap-3 sm:grid-cols-2" aria-busy={busy}>
            {(["mine", "toggl"] as const).map(choice => {
              const isLocal = choice === "mine";
              const available = isLocal || selectedDraft.remote !== undefined;
              const canChoose = selectedDraft.deleted ? !isLocal : selectedDraft.status === "conflict" && selectedDraft.remote !== undefined;
              const text = isLocal ? safeDecode(selectedDraft.local, selectedDraft.entryId) : selectedDraft.deleted ? selectedDraft.deletionConfirmed ? "Entry deleted" : "Entry not found" : !available ? "Not fetched yet" : safeDecode(selectedDraft.remote, selectedDraft.entryId);
              const label = isLocal ? "Local" : "Toggl";
              const content = <>
                <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">{label}{canChoose && selectedChoice === choice && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}</span>
                <span id={isLocal ? "local-description" : "remote-description"} className="block whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{text || <span className="italic text-muted-foreground">No description</span>}</span>
              </>;
              const className = "flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/20 p-4 text-left transition-colors";
              return canChoose ? <button key={choice} ref={node => { choiceRefs.current[choice] = node; }} data-description-choice={choice} type="button" aria-label={isLocal ? "Keep mine" : "Keep Toggl"} aria-pressed={selectedChoice === choice} disabled={busy} onFocus={() => setSelectedChoice(choice)} onClick={() => void resolve(selectedDraft.deleted ? "complete" : choice)} className={`${className} ${selectedChoice === choice ? "border-primary bg-primary/5 ring-2 ring-primary/40" : ""} cursor-pointer hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50`}>{content}</button> : <div key={choice} className={`${className} select-text`}>{content}</div>;
            })}
          </div>
          {merge !== null && <div><label htmlFor="merged-description" className="text-sm font-medium">Merged description (Markdown)</label><textarea id="merged-description" autoFocus disabled={busy} value={merge} onChange={e => setMerge(e.target.value)} className="mt-2 min-h-32 w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" /></div>}
          {selectedDraft.status !== "conflict" && !selectedDraft.deleted && <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { try { setMerge(decode(selectedDraft.local, selectedDraft.entryId)); } catch (e) { toast.error((e as Error).message); } }}>Edit draft</Button>
            {merge !== null ? <Button size="sm" onClick={() => void save(selectedDraft.entryId, selectedDraft.base, merge).then(() => setMerge(null))}>Save draft</Button> : <Button size="sm" disabled={busy || !account} onClick={() => void retry(selectedDraft)}>Retry sync</Button>}
          </div>}
        </>}
    </section>}
    {history !== null && <section role="dialog" aria-labelledby="recovery-title" className="fixed bottom-16 right-4 z-50 w-[calc(100%-2rem)] max-w-xl max-h-[65vh] overflow-y-auto rounded-xl border bg-background p-5 shadow-xl" onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { setHistory(null); navigationRevision.current++; } }}>
      <button aria-label="Close history" className="absolute right-4 top-4" onClick={() => { setHistory(null); navigationRevision.current++; }}><X className="h-4 w-4" /></button>
      <h2 id="recovery-title" className="pr-6 text-lg font-semibold">Description recovery history</h2>
      <p className="my-2 text-sm text-muted-foreground">Saved copies from resolved conflicts. Stored only in this browser.</p>
      {history.length === 0 ? <p className="text-sm">No resolved conflicts yet.</p> : <>
        <div className="my-3 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={historyIndex === 0} onClick={() => openHistory(historyIndex - 1)}>Previous</Button>
          <span className="text-xs">{historyIndex + 1} of {history.length}</span>
          <Button variant="outline" size="sm" disabled={historyIndex >= history.length - 1} onClick={() => openHistory(historyIndex + 1)}>Next</Button>
        </div>
        <p className="mb-3 text-sm">Entry {history[historyIndex].entryId} · Recovered {new Date(history[historyIndex].at).toLocaleString()}</p>
        <div className="grid gap-3 sm:grid-cols-2">{(["local", "remote"] as const).map(side => <label key={side} className="text-sm">{side === "local" ? "Local copy" : "Toggl copy"}<textarea readOnly className="mt-1 min-h-32 w-full rounded border bg-background p-2" value={safeDecode(history[historyIndex][side], history[historyIndex].entryId)} /></label>)}</div>
      </>}
    </section>}
  </Context.Provider>;
}

export function DescriptionDraftIcon({ entryId, rowStatus, onRetry, onOpen }: {
  entryId: number;
  rowStatus?: "pending" | "syncing" | "synced" | "error";
  onRetry?: (id: number) => void;
  onOpen?: () => void;
}) {
  const context = useDescriptionDrafts();
  const draft = context?.drafts.get(entryId);
  const syncing = context?.syncing.has(entryId) ?? false;
  const previousStatus = React.useRef(draft?.status);
  const [recentlySynced, setRecentlySynced] = React.useState(false);

  // A persisted success is quiet on load. Only a new acknowledgement flashes.
  React.useEffect(() => {
    const justSynced = draft?.status === "synced" &&
      previousStatus.current !== undefined && previousStatus.current !== "synced";
    previousStatus.current = draft?.status;
    if (!justSynced) {
      if (draft?.status !== "synced") setRecentlySynced(false);
      return;
    }
    setRecentlySynced(true);
    const timeout = setTimeout(() => setRecentlySynced(false), 2000);
    return () => clearTimeout(timeout);
  }, [draft?.status]);

  // Problems and unfinished work take priority over either success signal.
  const warning = draft?.status === "conflict" || draft?.status === "error";
  const descriptionPending = !!draft && draft.status !== "synced";
  let title: string;
  let icon: React.ReactNode;
  let action: (() => void) | undefined;
  if (warning) {
    title = draft.status === "conflict" ? "Description conflict — click to resolve" :
      draft.error?.startsWith("NOT SAVED") ? draft.error : `Saved locally · ${draft.error ?? "Description sync failed"}`;
    icon = <AlertTriangle className="h-4 w-4 text-amber-500" />;
    action = onOpen ?? (() => context?.open(entryId));
  } else if (rowStatus === "error") {
    title = "Changes failed to sync — click to retry";
    icon = <AlertTriangle className="h-4 w-4 text-amber-500" />;
    action = () => onRetry?.(entryId);
  } else if (syncing || rowStatus === "syncing") {
    title = "Syncing changes";
    icon = <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  } else if (descriptionPending || rowStatus === "pending") {
    title = descriptionPending ? "Saved locally · Waiting to sync" : "Pending changes · Waiting to sync";
    icon = <HardDrive className="h-4 w-4 text-muted-foreground" />;
    if (descriptionPending) action = onOpen ?? (() => context?.open(entryId));
  } else if (recentlySynced || rowStatus === "synced") {
    title = "Changes synced";
    icon = <Check className="h-4 w-4 text-green-500" />;
  } else {
    return null;
  }
  return action ? <button type="button" title={title} aria-label={title} onClick={e => { e.stopPropagation(); action(); }} className="inline-flex shrink-0 items-center p-0.5">{icon}</button> :
    <span title={title} aria-label={title} className="inline-flex shrink-0 items-center p-0.5">{icon}</span>;
}
