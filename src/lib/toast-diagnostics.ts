import { parseToastDiagnostics, type ToastDiagnosticEvent, type ToastDiagnosticReport } from "./toast-diagnostics-data";

type Input = Omit<ToastDiagnosticEvent, "sequence" | "at" | "entry" | "toast"> & {
  entryId?: number;
  toastId?: string | number;
};

/** Bounded, lossy diagnostics. Never retry, block an edit or send one request per key. */
export function createToastDiagnostics(
  send: (report: ToastDiagnosticReport) => void,
  schedule: (flush: () => void) => void = flush => { setTimeout(flush, 2000); },
) {
  let pageId: string | undefined;
  let sequence = 0;
  let dropped = 0;
  let scheduled = false;
  let events: ToastDiagnosticEvent[] = [];
  // Aliases exist only for this page and are never derived from real identifiers.
  const entries = new Map<number, number>();
  const toasts = new Map<string | number, number>();
  const alias = <T,>(map: Map<T, number>, key: T) => {
    if (!map.has(key) && map.size < 4096) map.set(key, map.size + 1);
    return map.get(key);
  };
  return (input: Input) => {
    // Responsive siblings can re-report unchanged state on every row render.
    // Keep the bounded buffer available for actual transitions and mutations.
    if (input.event === "editor.report" && input.changed === false) return;
    try {
      pageId ??= crypto.randomUUID();
      const event: ToastDiagnosticEvent = {
        event: input.event, sequence: ++sequence, at: Date.now(),
      };
      // Pick individual fields; runtime callers cannot smuggle content into logs.
      for (const key of ["editor", "open", "changed", "active", "pending", "notify", "count", "reason"] as const) {
        if (input[key] !== undefined) Object.assign(event, { [key]: input[key] });
      }
      if (input.entryId !== undefined) event.entry = alias(entries, input.entryId);
      if (input.toastId !== undefined) event.toast = alias(toasts, input.toastId);
      const report = { version: 1 as const, pageId, dropped, events: [event] };
      if (!parseToastDiagnostics(JSON.parse(JSON.stringify(report)))) return;
      if (events.length >= 64) dropped++;
      else events.push(event);
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        const batch = { version: 1 as const, pageId: pageId!, dropped, events };
        events = [];
        dropped = 0;
        try { send(batch); } catch { /* Diagnostics cannot affect mutations. */ }
      });
    } catch { /* Unavailable crypto/timers must not affect editing. */ }
  };
}

const record = createToastDiagnostics(report => {
  console.info("[deeplog-toast-client]", report);
  void fetch("/api/diagnostics/toast", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report), keepalive: true,
  }).catch(() => {});
});

export function recordToastDiagnostic(input: Input) {
  if (typeof window !== "undefined") record(input);
}
