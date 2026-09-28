import { NextRequest, NextResponse } from "next/server";
import { setupSessionApi } from "../../session-utils";
import { compareDescription } from "@/lib/description-sync";

// This check is deliberately next to the write. Toggl does not document atomic
// conditional updates, so edits in other Toggl clients can still race this PUT.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { sessionToken, userId, workspaceId } = await setupSessionApi(request);
    const body = await request.json();
    if (body.account !== `${userId}:${workspaceId}`) return NextResponse.json({ error: "Account changed. Sign in to the draft's account." }, { status: 403 });
    if (!/^\d+$/.test(id) || typeof body.base !== "string" || typeof body.local !== "string") return NextResponse.json({ error: "Invalid description update" }, { status: 400 });
    const headers = { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" };
    const current = await fetch(`https://track.toggl.com/api/v9/me/time_entries/${id}`, { headers, cache: "no-store", signal: request.signal });
    if (current.status === 404) return NextResponse.json({ deleted: true }, { status: 409 });
    if (!current.ok) return NextResponse.json({ error: "Could not read Toggl description" }, { status: current.status });
    const entry = await current.json();
    if (entry.server_deleted_at) return NextResponse.json({ deleted: true }, { status: 409 });
    if ((entry.workspace_id ?? entry.wid) !== workspaceId || (entry.user_id ?? entry.uid) !== userId) return NextResponse.json({ error: "Entry belongs to another account or workspace" }, { status: 403 });
    const remote = entry.description ?? "";
    if (body.reviewOnly) return NextResponse.json({ description: remote });
    const comparison = compareDescription(body.base, body.local, remote);
    if (comparison === "conflict") return NextResponse.json({ description: remote }, { status: 409 });
    if (comparison === "synced") return NextResponse.json({ description: remote });
    if (body.local.length > 3000) return NextResponse.json({ error: "Description exceeds Toggl's 3000-character limit." }, { status: 400 });
    const updated = await fetch(`https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${id}`, {
      method: "PUT", headers, body: JSON.stringify({ description: body.local }), signal: request.signal,
    });
    if (!updated.ok) return NextResponse.json({ error: `Toggl rejected the description (${updated.status}). Your draft is retained.` }, { status: updated.status });
    const result = await updated.json();
    return NextResponse.json({ description: result.description ?? "" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Description sync failed";
    return NextResponse.json({ error: message }, { status: /session|authenticate/i.test(message) ? 401 : 503 });
  }
}
