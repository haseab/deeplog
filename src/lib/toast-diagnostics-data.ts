export const TOAST_DIAGNOSTIC_EVENTS = [
  "editor.report", "editor.clear", "editor.mounted", "editor.unmounted", "description.edit", "description.submit",
  "mutation.queue", "toast.arm", "toast.created", "toast.cancel",
  "toast.undo", "toast.submit", "toast.rendered", "toast.dismissed", "mutation.started", "mutation.succeeded", "mutation.failed",
] as const;
export type ToastDiagnosticEvent = {
  event: typeof TOAST_DIAGNOSTIC_EVENTS[number];
  sequence: number;
  at: number;
  entry?: number;
  toast?: number;
  editor?: "description" | "duration" | "project" | "tags" | "time";
  open?: boolean;
  changed?: boolean;
  active?: boolean;
  pending?: boolean;
  notify?: boolean;
  count?: number;
  reason?: "active-editor" | "no-transaction" | "ready" | "cancelled" | "too-late" | "programmatic" | "user-dismiss" | "auto-close";
};
export type ToastDiagnosticReport = {
  version: 1;
  pageId: string;
  dropped: number;
  events: ToastDiagnosticEvent[];
};

/** Strict allowlist: no content, real entry IDs, toast messages or exception text. */
export function parseToastDiagnostics(input: unknown): ToastDiagnosticReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["version", "pageId", "dropped", "events"].includes(key))) return null;
  if (value.version !== 1 || typeof value.pageId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.pageId)) return null;
  if (!Number.isSafeInteger(value.dropped) || (value.dropped as number) < 0) return null;
  if (!Array.isArray(value.events) || !value.events.length || value.events.length > 64) return null;
  for (const event of value.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    if (!(TOAST_DIAGNOSTIC_EVENTS as readonly unknown[]).includes(event.event)) return null;
    if (![event.sequence, event.at].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
    for (const [key, field] of Object.entries(event)) {
      if (["event", "sequence", "at"].includes(key)) continue;
      if (["entry", "toast", "count"].includes(key)) {
        if (!Number.isSafeInteger(field) || (field as number) < 0 || (field as number) > 1_000_000) return null;
      } else if (["open", "changed", "active", "pending", "notify"].includes(key)) {
        if (typeof field !== "boolean") return null;
      } else if (key === "editor") {
        if (!["description", "duration", "project", "tags", "time"].includes(field as string)) return null;
      } else if (key === "reason") {
        if (!["active-editor", "no-transaction", "ready", "cancelled", "too-late", "programmatic", "user-dismiss", "auto-close"].includes(field as string)) return null;
      } else return null;
    }
  }
  return value as ToastDiagnosticReport;
}
