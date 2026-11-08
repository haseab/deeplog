import { BacklogConflictError, skipBacklog } from "@/lib/task-extraction/backlog";
import { hasUnfinishedAnalysis } from "@/lib/task-extraction/quality";
import { NextRequest } from "next/server";
import { Ledger, LedgerBusyError, ledgerDirectory, type Recording } from "@/lib/task-extraction/ledger";
import { discover, processRecording, reprocessRecording, resolveDelivery, status } from "@/lib/task-extraction/pipeline";
import { createProviders } from "@/lib/task-extraction/providers";

export const runtime = "nodejs";
export const maxDuration = 300;
const json = (body: unknown, code = 200) => Response.json(body, { status: code, headers: { "Cache-Control": "no-store" } });
const authorized = (request: NextRequest) => Boolean(process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`);
const failure = (error: unknown) => json({ success: false, error: error instanceof Error ? error.message : String(error) }, (error instanceof LedgerBusyError || error instanceof BacklogConflictError) ? 409 : 500);

export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  try {
    const ledger = new Ledger(ledgerDirectory());
    return await ledger.withLock(async () => {
      const id = request.nextUrl.searchParams.get("recordingId");
      if (id) {
        const record = await ledger.record(id);
        return record ? json(record) : json({ error: "Recording not found" }, 404);
      }
      return json(await status(ledger));
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Expected a JSON object" }, 400);
    if (body.skipRecordingIds !== undefined) {
      if (!Array.isArray(body.skipRecordingIds) || !body.skipRecordingIds.length || body.skipRecordingIds.length > 100 ||
        body.skipRecordingIds.some((id: unknown) => typeof id !== "string" || !id.trim()) || new Set(body.skipRecordingIds).size !== body.skipRecordingIds.length ||
        typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 1000 ||
        Object.keys(body).some(key => !["skipRecordingIds", "reason"].includes(key))) {
        return json({ error: "Provide 1–100 distinct skipRecordingIds and a reason, without other operations" }, 400);
      }
    }
    for (const flag of ["discoveryOnly", "draftOnly", "createTestTasks"]) {
      if (body[flag] !== undefined && typeof body[flag] !== "boolean") return json({ error: `${flag} must be a boolean` }, 400);
    }
    if (body.createTestTasks) return json({ error: "Synthetic task creation is no longer supported" }, 400);
    if (body.endDate && !body.startDate) return json({ error: "endDate requires startDate" }, 400);
    for (const key of ["startDate", "endDate"]) {
      if (body[key] !== undefined && (typeof body[key] !== "string" || !Number.isFinite(Date.parse(body[key])))) return json({ error: `${key} must be a valid ISO timestamp` }, 400);
    }
    if (body.startDate && Date.parse(body.startDate) >= Date.parse(body.endDate || new Date().toISOString())) return json({ error: "startDate must precede endDate" }, 400);
    const keys = { limitless: process.env.LIMITLESS_API_KEY || "", openai: process.env.OPENAI_API_KEY || "", todoist: process.env.TODOIST_API_KEY || "" };
    const providers = createProviders(keys);
    if (body.testTranscript !== undefined) {
      if (typeof body.testTranscript !== "string" || !body.testTranscript.trim() || body.testTranscript.length > 20_000) return json({ error: "testTranscript must contain 1–20,000 characters" }, 400);
      if (!keys.openai) return json({ error: "OPENAI_API_KEY is required" }, 400);
      return json({ success: true, dryRun: true, extractedTasks: await providers.extract(body.testTranscript) });
    }
    const ledger = new Ledger(ledgerDirectory());
    return await ledger.withLock(async () => {
      if (body.skipRecordingIds !== undefined) {
        const result = await skipBacklog(ledger, body.skipRecordingIds, body.reason.trim());
        return json({ success: true, ...result, ...(await status(ledger)) });
      }
      if (body.reprocessRecordingId !== undefined) {
        if (typeof body.reprocessRecordingId !== "string" || !body.reprocessRecordingId) return json({ error: "reprocessRecordingId must be a recording ID" }, 400);
        await reprocessRecording(ledger, body.reprocessRecordingId);
        return json({ success: true, ...(await status(ledger)) });
      }
      if (body.resolveDelivery !== undefined) {
        const input = body.resolveDelivery;
        if (!input || typeof input !== "object" || typeof input.recordingId !== "string" || typeof input.taskId !== "string" ||
          (input.todoistId !== undefined && (typeof input.todoistId !== "string" || !input.todoistId.trim())) ||
          Boolean(input.todoistId) === (input.confirmNotCreated === true)) return json({ error: "Provide recordingId, taskId, and either todoistId or confirmNotCreated: true" }, 400);
        await resolveDelivery(ledger, input);
        return json({ success: true, ...(await status(ledger)) });
      }
      if (!keys.limitless || (!body.discoveryOnly && !keys.openai) || (!body.discoveryOnly && !body.draftOnly && !keys.todoist)) return json({ error: "Missing required API keys" }, 400);
      const deadline = Date.now() + 210_000;
      let discoveryError: string | undefined;
      try { await discover(ledger, providers, { startDate: body.startDate, endDate: body.endDate, deadline }); }
      catch (error) { discoveryError = String(error); }
      // Known pending/failed recordings remain eligible regardless of age or scan range.
      if (!body.discoveryOnly) {
        const records = (await ledger.list<Recording>("record-")).filter(record => {
          const version = record.versions.find(item => item.hash === record.currentVersion);
          return record.status !== "completed" && record.status !== "skipped" && (record.status === "failed" || (version && hasUnfinishedAnalysis(version)) ||
            record.tasks.some(task => task.status === "sending" || (task.status === "pending" && task.version === record.currentVersion)));
        })
          .sort((a, b) => (a.events.at(-1)?.at ?? "").localeCompare(b.events.at(-1)?.at ?? ""));
        for (const record of records.slice(0, 10)) {
          if (Date.now() >= deadline) break;
          await processRecording(ledger, record, providers, { deadline, draftOnly: body.draftOnly === true });
        }
      }
      const report = await status(ledger);
      const success = !discoveryError && report.counts.failed === 0 && report.counts.needs_review === 0;
      return json({ success, discoveryError, ...report }, success ? 200 : 503);
    });
  } catch (error) { return failure(error); }
}
