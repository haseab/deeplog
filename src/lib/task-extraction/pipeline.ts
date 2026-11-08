import { randomUUID } from "node:crypto";
import { atomicJson, event, hash, Ledger, type Recording, type Transcript } from "./ledger";

import { approvedTasks, enumeratedCandidates, ENUMERATION_MODEL, normalizeTask, REVIEW_MODEL, transcriptText, validateQualityDecisions, type QualityDecision, type ReviewInput } from "./quality";

const DAY = 86_400_000;
const EXTRACTION_VERSION = "full-transcript-v1";
export interface Providers {
  page(start: string, end: string, cursor: string | null): Promise<{ transcripts: Transcript[]; nextCursor: string | null }>;
  extract(text: string): Promise<string[]>;
  review(input: ReviewInput): Promise<QualityDecision[]>;
  project(): Promise<string>;
  create(task: { id: string; content: string; projectId: string; recordingId: string; startTime: string }): Promise<string>;
}
// Only an explicit rejection is safe to retry automatically. Timeouts, 5xx,
// malformed success responses and process death leave delivery uncertain.
export class RejectedDelivery extends Error {}
interface Scan {
  schema: 1;
  id: string;
  kind: "rolling" | "backfill";
  start: string;
  end: string;
  windowStart: string;
  cursor: string | null;
  seenCursors: string[];
  pages: number;
  status: "pending" | "completed";
  completedAt?: string;
}

function splitTranscript(transcript: Transcript) {
  const text = transcriptText(transcript);
  const chunks = [];
  for (let offset = 0; offset < text.length; offset += 11_000) {
    chunks.push({ text: text.slice(offset, offset + 12_000), attempts: 0 });
    if (offset + 12_000 >= text.length) break;
  }
  return chunks;
}

export async function ingest(ledger: Ledger, transcript: Transcript) {
  if (typeof transcript.id !== "string" || !transcript.id || typeof transcript.startTime !== "string" || !Number.isFinite(Date.parse(transcript.startTime)) || !Array.isArray(transcript.contents)) {
    throw new Error("Invalid Limitless transcript; discovery progress was not advanced");
  }
  const chunks = splitTranscript(transcript);
  const versionHash = hash({ version: EXTRACTION_VERSION, chunks: chunks.map(chunk => chunk.text) });
  const record: Recording = await ledger.record(transcript.id) ?? {
    schema: 1, id: transcript.id, currentVersion: "", status: "pending", versions: [], tasks: [], events: [],
  };
  // An intentional skip applies to the source ID, including later source edits.
  // Only explicit manual reprocessing can reopen it.
  if (record.status === "skipped") return;
  if (record.versions.find(version => version.hash === record.currentVersion)?.sourceHash === versionHash) return;
  // Never replace a previous extraction or delivery history.
  const existing = record.versions.find(version => version.hash === versionHash);
  if (!existing) record.versions.push({ hash: versionHash, sourceHash: versionHash, transcript, discoveredAt: new Date().toISOString(), chunks });
  for (const task of record.tasks) {
    if (task.status === "pending") task.status = "superseded";
  }
  record.currentVersion = versionHash;
  record.status = record.tasks.some(task => task.status === "sending" || task.status === "needs_review")
    ? "needs_review" : chunks.length ? "pending" : "awaiting_transcript";
  event(record, "discovered_version", versionHash);
  await ledger.saveRecord(record);
}

export async function discover(ledger: Ledger, providers: Providers, options: {
  startDate?: string; endDate?: string; now?: number; maxPages?: number; deadline?: number;
}) {
  const now = options.now ?? Date.now();
  const scans = await ledger.list<Scan>("scan-");
  for (const item of scans) {
    if (item.schema !== 1 || !["rolling", "backfill"].includes(item.kind) ||
      !["pending", "completed"].includes(item.status) || !Array.isArray(item.seenCursors) ||
      !Number.isFinite(Date.parse(item.start)) || !Number.isFinite(Date.parse(item.end)) ||
      !Number.isFinite(Date.parse(item.windowStart)) ||
      (item.cursor !== null && typeof item.cursor !== "string")) throw new Error("Invalid discovery ledger; refusing to reset scan coverage");
  }
  const kind = options.startDate ? "backfill" : "rolling";
  let scan = scans.find(item => item.status === "pending" && item.kind === kind &&
    (kind === "rolling" || (item.start === options.startDate && (!options.endDate || item.end === options.endDate))));
  if (!scan && kind === "rolling") scan = scans.find(item => item.status === "pending" && item.kind === "backfill");
  if (!scan) {
    const lastEnd = scans.filter(item => item.kind === "rolling" && item.status === "completed")
      .reduce((latest, item) => Math.max(latest, Date.parse(item.end)), 0);
    const start = options.startDate ?? new Date(lastEnd ? Math.min(now - 7 * DAY, lastEnd - DAY) : now - 7 * DAY).toISOString();
    const end = options.endDate ?? new Date(now).toISOString();
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) >= Date.parse(end)) {
      throw new Error("Invalid scan date range");
    }
    scan = { schema: 1, id: randomUUID(), kind, start, end, windowStart: start, cursor: null, seenCursors: [], pages: 0, status: "pending" };
    await atomicJson(ledger.path(`scan-${scan.id}.json`), scan);
  }
  // Persist each page's recordings BEFORE advancing its pagination cursor.
  for (let count = 0; count < (options.maxPages ?? 8) && scan.status !== "completed"; count++) {
    if (Date.now() >= (options.deadline ?? Infinity)) break;
    const end = new Date(Math.min(Date.parse(scan.windowStart) + DAY, Date.parse(scan.end))).toISOString();
    // Include preceding lifelogs so recordings crossing a window boundary are revisited.
    const start = new Date(Date.parse(scan.windowStart) - DAY).toISOString();
    const page = await providers.page(start, end, scan.cursor);
    if (page.nextCursor && (scan.seenCursors.includes(page.nextCursor) || page.transcripts.length === 0)) {
      throw new Error("Invalid Limitless pagination; scan remains incomplete");
    }
    for (const transcript of page.transcripts) await ingest(ledger, transcript);
    scan.pages++;
    scan.cursor = page.nextCursor;
    if (page.nextCursor) scan.seenCursors.push(page.nextCursor);
    else {
      scan.windowStart = end;
      scan.seenCursors = [];
      if (Date.parse(end) >= Date.parse(scan.end)) {
        scan.status = "completed";
        scan.completedAt = new Date().toISOString();
      }
    }
    await atomicJson(ledger.path(`scan-${scan.id}.json`), scan);
  }
  return scan;
}

export async function processRecording(ledger: Ledger, record: Recording, providers: Providers, options: {
  deadline?: number; draftOnly?: boolean;
} = {}) {
  // Finished legacy imports are preserved; the new gate applies to unfinished
  // work and explicit reprocessing, never an automatic replay of history.
  if (record.status === "completed" || record.status === "skipped") return;
  const deadline = options.deadline ?? Infinity;
  const version = record.versions.find(item => item.hash === record.currentVersion);
  if (!version) throw new Error(`Missing transcript version for ${record.id}`);
  // A crash after the write-ahead save could have happened before or after creation.
  for (const task of record.tasks) {
    if (task.status === "sending") {
      task.status = "needs_review";
      task.error = "Previous delivery interrupted; check Todoist before retrying";
      event(record, "delivery_uncertain", task.id);
    }
  }
  try {
    for (const chunk of version.chunks) {
      if (chunk.tasks !== undefined) continue;
      if (Date.now() >= deadline) break;
      chunk.attempts++;
      event(record, "extraction_started", String(chunk.attempts));
      await ledger.saveRecord(record);
      try {
        const tasks = await providers.extract(chunk.text);
        if (!Array.isArray(tasks) || tasks.some(task => typeof task !== "string" || !task.trim())) {
          throw new Error("Invalid extracted tasks");
        }
        chunk.tasks = tasks;
        chunk.model = ENUMERATION_MODEL;
        delete chunk.error;
        event(record, "extraction_completed", String(tasks.length));
        await ledger.saveRecord(record);
      } catch (error) {
        chunk.error = String(error);
        throw error;
      }
    }
    if (version.chunks.length && version.chunks.every(chunk => chunk.tasks !== undefined)) {
      if (!version.qualityReview) {
        if (Date.now() >= deadline) { refreshStatus(record); await ledger.saveRecord(record); return; }
        version.reviewAttempts = (version.reviewAttempts ?? 0) + 1;
        event(record, "quality_review_started", String(version.reviewAttempts));
        await ledger.saveRecord(record);
        try {
          const input = { text: transcriptText(version.transcript), candidates: enumeratedCandidates(version) };
          const decisions = input.candidates.length ? await providers.review(input) : [];
          validateQualityDecisions(decisions, input);
          version.qualityReview = { model: REVIEW_MODEL, completedAt: new Date().toISOString(), decisions };
          delete version.reviewError;
          event(record, "quality_review_completed", `${decisions.filter(decision => decision.keep).length}/${decisions.length} kept`);
          await ledger.saveRecord(record);
        } catch (error) { version.reviewError = String(error); throw error; }
      }
      const approved = approvedTasks(version);
      const accepted = new Set(approved.map(normalizeTask));
      // Old unsent drafts also pass through the gate. Retain rejected drafts
      // for audit, while preserving delivered and uncertain delivery history.
      for (const task of record.tasks) {
        if (task.version === version.hash && task.status === "pending" && !accepted.has(normalizeTask(task.content))) {
          task.status = "filtered";
          task.error = "Excluded by the task relevance and actionability review";
        }
      }
      const previouslyDeliveredVersion = record.tasks.some(task => task.status === "delivered" && task.version !== version.hash);
      for (const content of approved) {
        const normalized = normalizeTask(content);
        const existing = record.tasks.find(task => normalizeTask(task.content) === normalized);
        if (existing) {
          existing.version = version.hash;
          if (existing.status === "superseded" || existing.status === "filtered") {
            existing.status = "pending";
            delete existing.error;
          }
          continue;
        }
        record.tasks.push({ id: randomUUID(), content: content.trim(), version: version.hash,
          status: previouslyDeliveredVersion ? "needs_review" : "pending",
          ...(previouslyDeliveredVersion ? { error: "Changed transcript: review new wording against previously delivered tasks" } : {}),
        });
      }
      await ledger.saveRecord(record);
      if (!options.draftOnly) {
        for (const task of record.tasks) {
          if (task.status !== "pending" || task.version !== version.hash || !accepted.has(normalizeTask(task.content)) || Date.now() >= deadline) continue;
          task.projectId ??= await providers.project();
          task.status = "sending";
          event(record, "delivery_started", `${task.id}:${version.hash}`);
          await ledger.saveRecord(record);
          try {
            const id = await providers.create({ ...task, projectId: task.projectId, recordingId: record.id, startTime: version.transcript.startTime });
            if (!id) throw new Error("Todoist returned no task ID");
            task.todoistId = id;
            task.status = "delivered";
            delete task.error;
            event(record, "delivered", `${task.id}:${id}`);
          } catch (error) {
            task.status = error instanceof RejectedDelivery ? "pending" : "needs_review";
            task.error = String(error);
            event(record, task.status === "pending" ? "delivery_rejected" : "delivery_uncertain", task.id);
          }
          // Failure to save here MUST abort, never continue sending more tasks.
          await ledger.saveRecord(record);
        }
      }
    }
    refreshStatus(record);
  } catch (error) {
    record.status = "failed";
    event(record, "failed", String(error));
  }
  await ledger.saveRecord(record);
}

function refreshStatus(record: Recording) {
  if (record.status === "skipped") return;
  const version = record.versions.find(item => item.hash === record.currentVersion)!;
  record.status = record.tasks.some(task => task.status === "needs_review" || task.status === "sending") ? "needs_review"
    : record.tasks.some(task => task.version === version.hash && task.status === "pending" && task.error) ? "failed"
    : !version.chunks.length ? "awaiting_transcript"
    : version.qualityReview && version.chunks.every(chunk => chunk.tasks !== undefined) && !record.tasks.some(task => task.version === version.hash && task.status !== "delivered" && task.status !== "filtered") ? "completed" : "pending";
}

export async function reprocessRecording(ledger: Ledger, id: string) {
  const record = await ledger.record(id);
  if (!record) throw new Error("Recording not found");
  const previous = record.versions.find(item => item.hash === record.currentVersion)!;
  const versionHash = hash({ previous: previous.hash, attempt: randomUUID() });
  record.versions.push({ hash: versionHash, sourceHash: previous.sourceHash, transcript: previous.transcript,
    discoveredAt: new Date().toISOString(), chunks: splitTranscript(previous.transcript) });
  for (const task of record.tasks) if (task.status === "pending") task.status = "superseded";
  record.currentVersion = versionHash;
  record.status = "pending";
  delete record.skip;
  refreshStatus(record);
  event(record, "manual_reprocessing_queued", versionHash);
  await ledger.saveRecord(record);
}

export async function status(ledger: Ledger) {
  const records = await ledger.list<Recording>("record-");
  const scans = await ledger.list<Scan>("scan-");
  return {
    totalRecordings: records.length,
    counts: Object.fromEntries(["pending", "completed", "failed", "needs_review", "awaiting_transcript", "skipped"].map(state => [state, records.filter(record => record.status === state).length])),
    deliveredTasks: records.reduce((sum, record) => sum + record.tasks.filter(task => task.status === "delivered").length, 0),
    scans,
    issues: records.filter(record => record.status !== "completed" && record.status !== "skipped").map(record => ({
      recordingId: record.id, status: record.status, lastEvent: record.events.at(-1),
      tasks: record.tasks.filter(task => task.status !== "delivered" && task.status !== "superseded" && task.status !== "filtered"),
    })),
  };
}

export async function resolveDelivery(ledger: Ledger, input: { recordingId: string; taskId: string; todoistId?: string; confirmNotCreated?: boolean }) {
  const record = await ledger.record(input.recordingId);
  const task = record?.tasks.find(item => item.id === input.taskId);
  if (!record || !task || (task.status !== "needs_review" && !(task.status === "pending" && input.todoistId))) {
    throw new Error("Task must need review, or be a pending draft being linked to an existing Todoist task");
  }
  if (Boolean(input.todoistId) === (input.confirmNotCreated === true)) throw new Error("Provide either todoistId or confirmNotCreated: true");
  if (input.todoistId) { task.todoistId = input.todoistId; task.status = "delivered"; }
  else { task.status = task.version === record.currentVersion ? "pending" : "superseded"; }
  delete task.error;
  refreshStatus(record);
  event(record, "manual_delivery_resolution", JSON.stringify(input));
  await ledger.saveRecord(record);
}
