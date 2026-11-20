export type RefreshTimingReport = {
  requestId: string;
  outcome: "paint-opportunity" | "hidden" | "paint-timeout" | "failed" | "aborted" | "superseded";
  requestMs?: number;
  decodeMs?: number;
  commitMs?: number;
  totalMs: number;
  status?: number;
  visible: boolean;
};

export function isRefreshRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Strict allowlist: never accept entry content, URLs, dates, accounts or credentials. */
export function parseRefreshTiming(input: unknown): RefreshTimingReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const allowed = ["requestId", "outcome", "requestMs", "decodeMs", "commitMs", "totalMs", "status", "visible"];
  if (Object.keys(value).some(key => !allowed.includes(key))) return null;
  if (!isRefreshRequestId(value.requestId) || typeof value.visible !== "boolean") return null;
  if (!["paint-opportunity", "hidden", "paint-timeout", "failed", "aborted", "superseded"].includes(String(value.outcome))) return null;
  for (const key of ["requestMs", "decodeMs", "commitMs", "totalMs"]) {
    const ms = value[key];
    if (ms === undefined && key !== "totalMs") continue;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0 || ms > 3_600_000) return null;
  }
  if (value.status !== undefined && (typeof value.status !== "number" || !Number.isInteger(value.status) || value.status < 100 || value.status > 599)) return null;
  return value as RefreshTimingReport;
}
