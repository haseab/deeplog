import { TogglRateLimitError } from "@/lib/toggl-rate-limit";
import { togglFetch } from "@/lib/toggl-fetch";
import { NextRequest, NextResponse } from "next/server";
import { setupSessionApi } from "../../session-utils";
import { compareDescription } from "@/lib/description-sync";
import { makeSyncDiagnostic } from "@/lib/sync-diagnostics";

// This check is deliberately next to the write. Toggl does not document atomic
// conditional updates, so edits in other Toggl clients can still race this PUT.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const validId = (value: string | null) => value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
  const requestId = validId(request.headers.get("x-deeplog-sync-request-id")) ?? crypto.randomUUID();
  const tabId = validId(request.headers.get("x-deeplog-tab-id"));
  const revisionHeader = request.headers.get("x-deeplog-revision") ?? "";
  const revision = /^\d{1,10}$/.test(revisionHeader) ? Number(revisionHeader) : undefined;
  let entryId: number | undefined, account: string | undefined;
  let base: string | undefined, local: string | undefined, remote: string | undefined, returned: string | undefined;
  let reviewOnly = false;
  const reply = async (body: Record<string, unknown>, status: number, outcome: string, upstreamStatus?: number) => {
    try {
      const log = await makeSyncDiagnostic({ event: "api.description", account, entryId, requestId,
        fields: { tabId, revision, status, outcome, upstreamStatus, reviewOnly, durationMs: Date.now() - started,
          remoteMatchesBase: remote !== undefined && remote === base, remoteMatchesLocal: remote !== undefined && remote === local },
        texts: { base, local, remote, returned } });
      console.info("[description-sync]", JSON.stringify(log));
    } catch { /* Diagnostic failures must never change the sync result. */ }
    return NextResponse.json(body, { status, headers: { "x-deeplog-sync-request-id": requestId } });
  };
  try {
    const { id } = await params;
    if (/^\d+$/.test(id)) entryId = Number(id);
    const { sessionToken, userId, workspaceId } = await setupSessionApi(request);
    account = `${userId}:${workspaceId}`;
    const body = await request.json();
    if (body.account !== account) return reply({ error: "Account changed. Sign in to the draft's account." }, 403, "account-mismatch");
    if (!/^\d+$/.test(id) || typeof body.base !== "string" || typeof body.local !== "string") return reply({ error: "Invalid description update" }, 400, "invalid-input");
    base = body.base; local = body.local; reviewOnly = !!body.reviewOnly;
    const headers = { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" };
    const current = await togglFetch(`https://track.toggl.com/api/v9/me/time_entries/${id}`, { headers, cache: "no-store", signal: request.signal });
    if (current.status === 404) return reply({ deleted: true }, 409, "entry-not-found", 404);
    if (!current.ok) return reply({ error: "Could not read Toggl description" }, current.status, "read-rejected", current.status);
    const entry = await current.json();
    if ((entry.workspace_id ?? entry.wid) !== workspaceId || (entry.user_id ?? entry.uid) !== userId) return reply({ error: "Entry belongs to another account or workspace" }, 403, "entry-account-mismatch");
    if (entry.server_deleted_at) return reply({ deleted: true, deletionConfirmed: true, start: entry.start }, 409, "deletion-confirmed");
    remote = entry.description ?? "";
    if (reviewOnly) return reply({ description: remote, start: entry.start }, 200, "review-read");
    const comparison = compareDescription(body.base, body.local, remote!);
    if (comparison === "conflict") return reply({ description: remote, start: entry.start }, 409, "remote-changed");
    if (comparison === "synced") return reply({ description: remote }, 200, "already-matches");
    if (body.local.length > 3000) return reply({ error: "Description exceeds Toggl's 3000-character limit." }, 400, "description-too-long");
    const updated = await togglFetch(`https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${id}`, {
      method: "PUT", headers, body: JSON.stringify({ description: body.local }), signal: request.signal,
    });
    if (!updated.ok) return reply({ error: `Toggl rejected the description (${updated.status}). Your draft is retained.` }, updated.status, "write-rejected", updated.status);
    const result = await updated.json();
    returned = result.description ?? "";
    return reply({ description: result.description ?? "" }, 200, "uploaded", updated.status);
  } catch (error) {
    if (error instanceof TogglRateLimitError) {
      await reply({ error: error.message, code: error.code, retryAfter: error.retryAfter }, 429, "rate-limited", 429);
      return error.response({ "x-deeplog-sync-request-id": requestId });
    }
    const message = error instanceof Error ? error.message : "Description sync failed";
    return reply({ error: message }, /session|authenticate/i.test(message) ? 401 : 503, "request-failed");
  }
}
