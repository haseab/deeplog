"use client";

import * as React from "react";
import { AlertTriangle, HardDrive, Loader2, History, Check, Cloud, ArrowUpRight, Pencil, GitCompareArrows } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useEncryptionContext } from "./encryption-context";
import { encryptDescription, decryptDescription } from "@/lib/encryption";
import { isEncryptedDescription } from "@/lib/ai-summary";
import { acknowledgeDraft, type DescriptionDraft, type DescriptionHistory } from "@/lib/description-sync";
import { changeDraft, listDrafts, listHistory } from "@/lib/description-draft-store";

type DraftContext = {
  drafts: Map<number, DescriptionDraft>;
  syncing: Set<number>;
  save: (id: number, base: string, text: string, notify?: boolean, undoDescription?: string) => Promise<void>;
  decode: (text: string, id: number) => string;
  open: (id: number) => void;
  ready: boolean;
};
const Context = React.createContext<DraftContext | null>(null);
export const useDescriptionDrafts = () => React.useContext(Context);

export function DescriptionDraftsProvider({ children }: { children: React.ReactNode }) {
  const encryption = useEncryptionContext();
  const [account, setAccount] = React.useState("");
  const [drafts, setDrafts] = React.useState(new Map<number, DescriptionDraft>());
  const [syncing, setSyncing] = React.useState(new Set<number>());
  const [selected, setSelected] = React.useState<number | null>(null);
  const [merge, setMerge] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [history, setHistory] = React.useState<DescriptionHistory[] | null>(null);
  const [storageError, setStorageError] = React.useState("");
  const owner = React.useRef("");
  const failedDrafts = React.useRef(new Map<number, DescriptionDraft>());
  const accountRef = React.useRef("");
  const tokenRef = React.useRef("");
  const channel = React.useRef<BroadcastChannel | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const work = React.useRef<() => Promise<void>>(async () => {});
  const encryptionRef = React.useRef(encryption);
  encryptionRef.current = encryption;

  const refresh = React.useCallback(async () => {
    const active = accountRef.current;
    if (!active) return;
    const items = await listDrafts(active);
    if (active === accountRef.current) {
      const next = new Map(items.map(d => [d.entryId, d]));
      for (const [id, draft] of failedDrafts.current) if (draft.account === active) next.set(id, draft);
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
        accountRef.current = "";
        setAccount(""); setDrafts(new Map()); setSelected(null); setHistory(null);
      }
      tokenRef.current = token;
      if (!token) return;
      try {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        const key = "deeplog-draft-account:" + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
        const cached = localStorage.getItem(key);
        if (cached && !cancelled && token === tokenRef.current) {
          accountRef.current = cached; setAccount(cached); await refresh();
        }
        const response = await fetch("/api/validate-session-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionToken: token }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || token !== tokenRef.current) return;
        const identity = `${data.user.id}:${data.workspace.id}`;
        localStorage.setItem(key, identity);
        accountRef.current = identity; setAccount(identity);
        for (const draft of await listDrafts(identity)) {
          if (draft.status === "error") await changeDraft(draft.key, current => current && ({ ...current, retryAt: undefined }));
        }
        await refresh(); schedule();
      } catch { /* A previously verified account can keep drafting while offline. */ }
    }
    void identify();
    const online = () => { void identify(); };
    const storage = (event: StorageEvent) => { if (event.key === "toggl_session_token") void identify(); };
    window.addEventListener("online", online);
    window.addEventListener("storage", storage);
    const interval = setInterval(() => {
      if (localStorage.getItem("toggl_session_token") !== tokenRef.current || !accountRef.current) void identify();
      else void work.current();
    }, 30000);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("deeplog-description-drafts");
      channel.current.onmessage = () => { void refresh().then(schedule).catch(() => {}); };
    }
    return () => {
      cancelled = true; clearInterval(interval); if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", online); window.removeEventListener("storage", storage);
      channel.current?.close();
    };
  }, [refresh, schedule]);

  const decode = React.useCallback((text: string, id: number) => {
    if (!isEncryptedDescription(text)) return text;
    const key = encryptionRef.current.getSessionKey();
    if (!key || !encryptionRef.current.isUnlocked) throw new Error("Unlock encryption to access this draft.");
    return decryptDescription(text, key, id);
  }, []);
  const encode = React.useCallback((text: string, id: number, base: string) => {
    const enc = encryptionRef.current;
    if (!enc.isE2EEEnabled && !isEncryptedDescription(base)) return text;
    const key = enc.getSessionKey();
    if (!key || !enc.isUnlocked) throw new Error("Unlock encryption before editing descriptions.");
    const result = encryptDescription(text, key, id);
    enc.markEntryEncrypted(id);
    return result;
  }, []);
  const request = React.useCallback(async (draft: DescriptionDraft, reviewOnly = false) => {
    if (draft.account !== accountRef.current || localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed; reopen the app before syncing.");
    const response = await fetch(`/api/time-entries/${draft.entryId}/description`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-toggl-session-token": tokenRef.current },
      body: JSON.stringify({ account: draft.account, base: draft.base, local: draft.local, reviewOnly }), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (response.status !== 409 && !response.ok) throw new Error(data.error ?? `Sync failed (${response.status})`);
    return { conflict: response.status === 409, remote: data.description as string | undefined, deleted: !!data.deleted };
  }, []);
  const notifySynced = (id: number, description: string) => window.dispatchEvent(new CustomEvent("deeplog-description-synced", { detail: { id, description } }));

  work.current = async () => {
    const active = accountRef.current;
    if (!active || !navigator.onLine || !navigator.locks) return;
    await navigator.locks.request(`deeplog-description-sync:${active}`, { ifAvailable: true }, async lock => {
      if (!lock) return;
      for (let draft of await listDrafts(active)) {
        if (draft.status === "conflict" || draft.status === "synced" || (draft.retryAt ?? 0) > Date.now() || failedDrafts.current.has(draft.entryId) || active !== accountRef.current) continue;
        const id = draft.entryId;
        setSyncing(old => new Set(old).add(id));
        try {
          // Recover an upload whose response was lost, even if more typing followed it.
          if (draft.sent !== undefined) {
            const check = await request(draft, true);
            if (!check.deleted && check.remote === draft.sent) {
              const previous = draft;
              draft = (await changeDraft(draft.key, current => current && ({ ...current, base: check.remote!, sent: undefined, status: current.local === previous.sent ? "synced" : "local" })))!;
              if (draft.status === "synced") { notifySynced(id, check.remote!); continue; }
            }
          }
          const snapshot = await changeDraft(draft.key, current => current && current.status !== "conflict" ? { ...current, sent: current.local } : current);
          if (!snapshot || snapshot.status === "conflict") continue;
          const result = await request(snapshot);
          if (result.conflict) {
            await changeDraft(snapshot.key, current => current && ({ ...current, status: "conflict", remote: result.remote, deleted: result.deleted, sent: undefined, error: undefined }));
          } else {
            await changeDraft(snapshot.key, current => current && acknowledgeDraft(current, snapshot, result.remote!));
            notifySynced(id, result.remote!);
          }
        } catch (error) {
          await changeDraft(draft.key, current => current && current.status !== "conflict" ? { ...current, status: "error", attempts: (current.attempts ?? 0) + 1, retryAt: Date.now() + Math.min(300000, 30000 * 2 ** (current.attempts ?? 0)), error: error instanceof Error ? error.message : "Waiting to retry" } : current);
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

  const save = React.useCallback(async (entryId: number, base: string, text: string, notify = false, undoDescription?: string) => {
    const active = accountRef.current;
    try {
      if (localStorage.getItem("toggl_session_token") !== tokenRef.current) throw new Error("Account changed. Reopen the app before editing.");
      if (!active) throw new Error("Connect once to verify your account before saving offline drafts.");
      const local = encode(text, entryId, base);
      const saved = await changeDraft(`${active}:${entryId}`, old => {
        if (old && decode(old.local, entryId) === text && (old.status !== "synced" || old.base === base)) return old;
        return { ...old, key: `${active}:${entryId}`, account: active, entryId, base: old && old.status !== "synced" ? old.base : base,
          local, owner: owner.current, revision: (old?.revision ?? 0) + 1, updatedAt: Date.now(), status: old?.status === "conflict" ? "conflict" : "local", error: undefined, attempts: 0, retryAt: undefined };
      });
      failedDrafts.current.delete(entryId);
      setStorageError(""); await publish(); schedule();
      if (notify && saved) {
        const submitted = saved;
        const undoText = undoDescription ?? decode(base, entryId);
        const configuredDuration = Number(localStorage.getItem("toast_duration") ?? 4000);
        toast("Description updated.", {
          id: `description-submit-${entryId}`,
          duration: Number.isFinite(configuredDuration) && configuredDuration > 0 ? configuredDuration : 4000,
          action: {
            label: "Undo (⌘Z)",
            onClick: () => {
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Local storage is unavailable";
      const failed: DescriptionDraft = { key: `${active}:${entryId}`, account: active, entryId, base, local: text, revision: 0, updatedAt: Date.now(), status: "error", error: `NOT SAVED LOCALLY: ${message}` };
      failedDrafts.current.set(entryId, failed);
      setDrafts(old => new Map(old).set(entryId, failed));
      setStorageError(message); toast.error(message, { id: "description-storage-error" });
    }
  }, [encode, decode, publish, schedule]);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (failedDrafts.current.size) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const openDraft = async (id: number) => {
    setSelected(id); setMerge(null);
    const draft = drafts.get(id);
    if (draft?.status === "conflict" && draft.remote === undefined && !draft.deleted && navigator.onLine) {
      try {
        const check = await request(draft, true);
        await changeDraft(draft.key, current => current && ({ ...current, remote: check.remote, deleted: check.deleted }));
        await publish();
      } catch (e) { toast.error((e as Error).message); }
    }
  };
  const retry = async (draft: DescriptionDraft) => {
    if (failedDrafts.current.has(draft.entryId)) {
      await save(draft.entryId, draft.base, draft.local);
    } else {
      await changeDraft(draft.key, current => current && ({ ...current, retryAt: undefined }));
      await work.current();
    }
  };
  const selectedDraft = selected === null ? undefined : drafts.get(selected);
  const safeDecode = (text: string | undefined, id: number) => { try { return decode(text ?? "", id); } catch { return "Unlock encryption to view this description."; } };
  const resolve = async (choice: "mine" | "toggl" | "merge") => {
    if (!selectedDraft || busy || !navigator.locks) return;
    setBusy(true);
    try {
      await navigator.locks.request(`deeplog-description-sync:${selectedDraft.account}`, async () => {
        const shown = selectedDraft;
        const latest = (await listDrafts(shown.account)).find(d => d.key === shown.key);
        if (!latest || latest.revision !== shown.revision) throw new Error("Your local draft changed. Review the updated comparison.");
        const check = await request(shown, true);
        if (check.deleted || check.remote !== shown.remote) {
          await changeDraft(shown.key, current => current && ({ ...current, status: "conflict", remote: check.remote, deleted: check.deleted }));
          throw new Error(check.deleted ? "This entry was deleted. Your draft is available to copy." : "Toggl changed again. Review the updated comparison.");
        }
        const local = choice === "toggl" ? check.remote! : choice === "merge" ? encode(merge ?? "", shown.entryId, shown.local) : shown.local;
        const updated = await changeDraft(shown.key, current => {
          if (!current || current.revision !== shown.revision) throw new Error("Draft changed");
          return { ...current, base: check.remote!, local, status: choice === "toggl" ? "synced" : "local", revision: current.revision + 1, remote: undefined, sent: undefined, deleted: false, error: undefined };
        }, { key: crypto.randomUUID(), account: shown.account, entryId: shown.entryId, local: shown.local, remote: check.remote, at: Date.now() });
        if (updated?.status === "synced") notifySynced(shown.entryId, local);
        setSelected(null); setMerge(null); schedule();
      });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not resolve conflict"); }
    finally { await publish(); setBusy(false); }
  };
  const pending = [...drafts.values()].filter(d => d.status !== "synced");
  return <Context.Provider value={{ drafts, syncing, save, decode, open: id => { void openDraft(id); }, ready: !!account }}>
    {children}
    <div className="fixed bottom-16 right-4 z-40 flex max-w-[calc(100vw-2rem)] max-h-32 flex-wrap items-center gap-2 overflow-auto rounded-md border bg-background p-2 shadow-sm">
      {storageError && <span role="alert" className="max-w-xs text-xs text-destructive">Not saved: {storageError}</span>}
      {pending.map(d => <DescriptionDraftIcon key={d.entryId} entryId={d.entryId} />)}
      <button aria-label="Description recovery history" title="Description recovery history" className="p-1 text-muted-foreground" onClick={() => void listHistory(account).then(setHistory).catch(() => toast.error("Could not read recovery history"))}><History className="h-4 w-4" /></button>
    </div>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) { setSelected(null); setMerge(null); } }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl max-h-[85vh] overflow-y-auto rounded-xl p-5 sm:p-6" onKeyDown={event => event.stopPropagation()} onOpenAutoFocus={event => { event.preventDefault(); document.getElementById("description-review-title")?.focus(); }}>
        <div className="flex items-center gap-3 pr-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <GitCompareArrows className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle id="description-review-title" tabIndex={-1} className="outline-none">{selectedDraft?.status === "conflict" ? "Choose a description" : "Local description"}</DialogTitle>
            <DialogDescription>{selectedDraft?.status === "conflict" && !selectedDraft.deleted ? "Two versions of this entry. Click the one to keep." : "Review your saved description."}</DialogDescription>
          </div>
        </div>
        {selectedDraft && <>
          {selectedDraft.error && <p role="alert" className="text-sm text-destructive">{selectedDraft.error}</p>}
          {selectedDraft.deleted && <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">This entry was deleted in Toggl. Copy your draft below to recover it; it will not be recreated automatically.</p>}
          <div className="grid gap-3 sm:grid-cols-2" aria-busy={busy}>
            {(["mine", "toggl"] as const).map(choice => {
              const isLocal = choice === "mine";
              const available = isLocal || selectedDraft.remote !== undefined;
              const canChoose = selectedDraft.status === "conflict" && !selectedDraft.deleted && available;
              const text = isLocal ? safeDecode(selectedDraft.local, selectedDraft.entryId) : selectedDraft.deleted ? "Entry deleted" : !available ? "Not fetched yet" : safeDecode(selectedDraft.remote, selectedDraft.entryId);
              const label = isLocal ? "Your local draft" : "Current Toggl description";
              const Icon = isLocal ? HardDrive : Cloud;
              const content = <>
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{label}</span>
                  {canChoose && <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-focus-visible:-translate-y-0.5 group-focus-visible:translate-x-0.5" />}
                </span>
                <span id={isLocal ? "local-description" : "remote-description"} className="block whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{text || <span className="italic text-muted-foreground">No description</span>}</span>
                <span className="mt-auto flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground group-hover:text-primary group-focus-visible:text-primary">
                  {canChoose ? <><Check className="h-3.5 w-3.5" />Keep this description</> : isLocal ? "Saved on this device" : "Toggl version"}
                </span>
              </>;
              const className = "group flex min-h-40 min-w-0 flex-col gap-4 rounded-lg border bg-muted/20 p-4 text-left transition-colors";
              return canChoose ? <button key={choice} type="button" aria-label={isLocal ? "Keep mine" : "Keep Toggl"} disabled={busy} onClick={() => void resolve(choice)} className={`${className} cursor-pointer hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50`}>{content}</button> : <div key={choice} className={`${className} select-text`}>{content}</div>;
            })}
          </div>
          {merge !== null && <div><label htmlFor="merged-description" className="text-sm font-medium">Merged description (Markdown)</label><textarea id="merged-description" autoFocus disabled={busy} value={merge} onChange={e => setMerge(e.target.value)} className="mt-2 min-h-32 w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" /></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">{busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking latest version…</> : <>Your draft stays saved until you choose.</>}</p>
            <div className="flex flex-wrap gap-2">
              {selectedDraft.status === "conflict" && !selectedDraft.deleted ? <>
                {merge === null ? <Button variant="ghost" size="sm" aria-label="Merge/edit" disabled={busy} onClick={() => { try { setMerge(decode(selectedDraft.local, selectedDraft.entryId)); } catch (e) { toast.error((e as Error).message); } }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit instead</Button> : <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMerge(null)}>Cancel edit</Button>
                  <Button size="sm" disabled={busy} onClick={() => void resolve("merge")}>Save merged description</Button>
                </>}
              </> : !selectedDraft.deleted && <>
                <Button variant="ghost" size="sm" onClick={() => { try { setMerge(decode(selectedDraft.local, selectedDraft.entryId)); } catch (e) { toast.error((e as Error).message); } }}>Edit draft</Button>
                {merge !== null ? <Button size="sm" onClick={() => void save(selectedDraft.entryId, selectedDraft.base, merge).then(() => setMerge(null))}>Save draft</Button> : <Button size="sm" disabled={busy || !account} onClick={() => void retry(selectedDraft)}>Retry sync</Button>}
              </>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground/70">Entry {selected} · Edited locally {new Date(selectedDraft.updatedAt).toLocaleString()}</p>
        </>}
      </DialogContent>
    </Dialog>
    <Dialog open={history !== null} onOpenChange={open => { if (!open) setHistory(null); }}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogTitle>Description recovery history</DialogTitle><DialogDescription>Copies preserved when resolving conflicts. Select text to copy it. Stored only in this browser.</DialogDescription>
      {history?.length === 0 && <p className="text-sm text-muted-foreground">No resolved conflicts yet.</p>}
      {history?.map(item => <div key={item.key} className="space-y-2 border-t pt-3"><p className="text-sm">Entry {item.entryId} · {new Date(item.at).toLocaleString()}</p><div className="grid gap-3 sm:grid-cols-2"><textarea aria-label="Recovered local description" readOnly className="min-h-32 w-full rounded border bg-background p-2 text-sm" value={safeDecode(item.local, item.entryId)} /><textarea aria-label="Recovered Toggl description" readOnly className="min-h-32 w-full rounded border bg-background p-2 text-sm" value={safeDecode(item.remote, item.entryId)} /></div></div>)}
    </DialogContent></Dialog>
  </Context.Provider>;
}

export function DescriptionDraftIcon({ entryId, rowStatus, onRetry }: {
  entryId: number;
  rowStatus?: "pending" | "syncing" | "synced" | "error";
  onRetry?: (id: number) => void;
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
    action = () => context?.open(entryId);
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
    if (descriptionPending) action = () => context?.open(entryId);
  } else if (recentlySynced || rowStatus === "synced") {
    title = "Changes synced";
    icon = <Check className="h-4 w-4 text-green-500" />;
  } else {
    return null;
  }
  return action ? <button type="button" title={title} aria-label={title} onClick={e => { e.stopPropagation(); action(); }} className="inline-flex shrink-0 items-center p-0.5">{icon}</button> :
    <span title={title} aria-label={title} className="inline-flex shrink-0 items-center p-0.5">{icon}</span>;
}
