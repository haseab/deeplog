import type { NextRequest } from "next/server";
import { setupSessionApi, createErrorResponse } from "../session-utils";
import { togglFetch } from "@/lib/toggl-fetch";
import { TogglRateLimitError } from "@/lib/toggl-rate-limit";

type Wire = { description?: string; project_id?: number | null; tag_ids?: number[]; start?: string; stop?: string | null };
const queues = new Map<string, Promise<void>>();
async function serialize<T>(key: string, operation: () => Promise<T>) {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => {}).then(() => gate);
  queues.set(key, tail); await previous.catch(() => {});
  try { return await operation(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}
const validWire = (value: unknown, allowTimes: boolean): value is Wire => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Wire;
  const allowed = ["description", "project_id", "tag_ids", ...(allowTimes ? ["start", "stop"] : [])];
  return Object.keys(item).length > 0 && Object.keys(item).every(key => allowed.includes(key))
    && (item.description === undefined || typeof item.description === "string")
    && (item.project_id === undefined || item.project_id === null || (Number.isSafeInteger(item.project_id) && item.project_id > 0))
    && (item.tag_ids === undefined || (Array.isArray(item.tag_ids) && item.tag_ids.every(id => Number.isSafeInteger(id) && id > 0)))
    && (item.start === undefined || (typeof item.start === "string" && Number.isFinite(Date.parse(item.start))))
    && (item.stop === undefined || item.stop === null || (typeof item.stop === "string" && Number.isFinite(Date.parse(item.stop))));
};
function same(expected: Wire, current: Wire) {
  return (Object.keys(expected) as (keyof Wire)[]).every(key => {
    if (key === "tag_ids") return JSON.stringify([...(expected.tag_ids ?? [])].sort((a, b) => a - b)) === JSON.stringify([...(current.tag_ids ?? [])].sort((a, b) => a - b));
    if (key === "start" || key === "stop") return (expected[key] ? Date.parse(expected[key]!) : null) === (current[key] ? Date.parse(current[key]!) : null);
    return (expected[key] ?? (key === "description" ? "" : null)) === (current[key] ?? (key === "description" ? "" : null));
  });
}

/** Each entry is checked just before its one write. This is not an atomic upstream transaction. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return createErrorResponse("Invalid bulk entry change", 400);
    const { id, expected, patch, operation, account, reviewOnly } = body;
    if (!Number.isSafeInteger(id) || id <= 0 || !["update", "delete"].includes(operation) || !validWire(expected, operation === "delete")
      || (operation === "update" && (!validWire(patch, false) || Object.keys(expected).sort().join() !== Object.keys(patch).sort().join()))
      || (operation === "delete" && !["description", "project_id", "tag_ids", "start", "stop"].every(key => key in expected))
      || (reviewOnly !== undefined && typeof reviewOnly !== "boolean")) return createErrorResponse("Invalid bulk entry change", 400);
    if (patch?.description?.length > 3000) return createErrorResponse("Description exceeds Toggl's 3000-character limit.", 400);
    const { sessionToken, userId, workspaceId } = await setupSessionApi(request);
    if (account !== `${userId}:${workspaceId}`) return createErrorResponse("Account changed. Reopen the entries before committing.", 403);
    return await serialize(`${userId}:${workspaceId}:${id}`, async () => {
      if (request.signal.aborted) return createErrorResponse("Bulk commit was cancelled before its write", 499);
      const headers = { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" };
      const read = await togglFetch(`https://track.toggl.com/api/v9/me/time_entries/${id}`, { headers, cache: "no-store", signal: request.signal });
      if (read.status === 404) return operation === "delete" ? Response.json({ state: "applied" }) : createErrorResponse("Entry was deleted in Toggl. Undo the preview or refresh.", 409);
      if (!read.ok) return createErrorResponse("Could not check the current entry. No write was attempted.", read.status === 401 ? 401 : 502);
      const entry = await read.json();
      if (Number(entry.workspace_id ?? entry.wid) !== workspaceId || Number(entry.user_id ?? entry.uid) !== userId) return createErrorResponse("Entry belongs to another account or workspace", 403);
      const current: Wire = { description: entry.description ?? "", project_id: entry.project_id ?? entry.pid ?? null, tag_ids: entry.tag_ids ?? [], start: entry.start, stop: entry.stop ?? null };
      if (entry.server_deleted_at) return operation === "delete" ? Response.json({ state: "applied" }) : createErrorResponse("Entry was deleted in Toggl. Undo the preview or refresh.", 409);
      const applied = operation === "update" && same(patch, current);
      const unchanged = same(expected, current);
      const fields = Object.fromEntries(Object.keys(operation === "update" ? patch : expected).filter(key => !["start", "stop"].includes(key)).map(key => [key, current[key as keyof Wire]]));
      if (reviewOnly) return Response.json({ state: applied ? "applied" : unchanged ? "unchanged" : "conflict", current: fields });
      // Lost acknowledgements are verified by a read, never by replaying a write.
      if (applied) return Response.json({ state: "applied" });
      if (!unchanged) return Response.json({ error: "Entry changed in Toggl. Undo the preview to show its latest values.", state: "conflict", current: fields }, { status: 409 });
      if (request.signal.aborted) return createErrorResponse("Bulk commit was cancelled before its write", 499);
      const write = await togglFetch(`https://track.toggl.com/api/v9/workspaces/${workspaceId}/time_entries/${id}`, {
        method: operation === "delete" ? "DELETE" : "PUT", headers,
        ...(operation === "update" ? { body: JSON.stringify(patch) } : {}), signal: request.signal,
      });
      if (!write.ok) return Response.json({ error: `Toggl rejected the change (${write.status}). Results and recovery snapshots are retained.`, uncertain: write.status >= 500 }, { status: write.status });
      // A successful status is enough; a missing JSON acknowledgement must not cause a replay.
      return Response.json({ state: "applied" });
    });
  } catch (error) {
    if (error instanceof TogglRateLimitError) return error.response();
    if (error instanceof SyntaxError) return createErrorResponse("Invalid bulk entry change", 400);
    if (error instanceof Error && error.message === "Toggl session token is required") return createErrorResponse(error.message, 400);
    if (error instanceof Error && error.message.includes("reauthenticate")) return createErrorResponse(error.message, 401);
    return Response.json({ error: "Could not confirm this change. Check its status before undoing or retrying.", uncertain: true }, { status: 503 });
  }
}
