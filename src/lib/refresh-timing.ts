import { parseRefreshTiming } from "./refresh-timing-data";

export type RefreshTiming = {
  requestId: string;
  started: number;
  response?: number;
  decoded?: number;
  committed?: number;
  status?: number;
  ready?: boolean;
  sent?: boolean;
};
export function startRefreshTiming(): RefreshTiming {
  return { requestId: crypto.randomUUID(), started: performance.now() };
}
export function reportRefreshTiming(
  sample: RefreshTiming,
  outcome: "paint-opportunity" | "hidden" | "paint-timeout" | "failed" | "aborted" | "superseded",
) {
  if (sample.sent) return;
  sample.sent = true;
  try {
    const duration = (end?: number, start = sample.started) =>
      end === undefined ? undefined : Math.max(0, Math.round(end - start));
    const value = parseRefreshTiming({
      requestId: sample.requestId,
      outcome,
      status: sample.status,
      requestMs: duration(sample.response),
      decodeMs:
        sample.response === undefined ? undefined : duration(sample.decoded, sample.response),
      commitMs:
        sample.decoded === undefined ? undefined : duration(sample.committed, sample.decoded),
      totalMs: duration(performance.now()),
      visible: document.visibilityState === "visible",
    });
    if (!value) return;
    console.info("[deeplog-refresh-client]", value);
    // Best effort and fire-and-forget: never delay a refresh or retry telemetry.
    void globalThis
      .fetch("/api/diagnostics/refresh-timing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
        keepalive: true,
      })
      .catch(() => {});
  } catch {
    /* Timing failures must not affect application state. */
  }
}
export function finishRefreshAfterPaint(sample: RefreshTiming) {
  sample.committed = performance.now();
  if (document.visibilityState !== "visible") {
    reportRefreshTiming(sample, "hidden");
    return;
  }
  let frame = 0;
  const timer = setTimeout(() => {
    cancelAnimationFrame(frame);
    reportRefreshTiming(sample, "paint-timeout");
  }, 5000);
  // Two frames approximate a paint opportunity; this does not claim GPU paint completion.
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      clearTimeout(timer);
      reportRefreshTiming(
        sample,
        document.visibilityState === "visible" ? "paint-opportunity" : "hidden",
      );
    });
  });
}
