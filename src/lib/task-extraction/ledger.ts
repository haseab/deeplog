import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { enumeratedCandidates, REVIEW_MODEL, transcriptText, validateQualityDecisions, type QualityReview } from "./quality";

export const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function ledgerDirectory() {
  if (process.env.VERCEL) throw new Error("Task extraction requires a persistent Railway volume; it cannot run on Vercel.");
  const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const directory = process.env.TASK_EXTRACTION_DATA_DIR || (volumeMount ? join(volumeMount, "task-extraction") : undefined);
  if (directory && isAbsolute(directory)) {
    if (process.env.RAILWAY_ENVIRONMENT_ID) {
      const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
      const withinMount = mount && relative(resolve(mount), resolve(directory));
      if (!mount || withinMount === ".." || withinMount?.startsWith("../") || isAbsolute(withinMount || "")) {
        throw new Error("TASK_EXTRACTION_DATA_DIR must be inside the attached Railway volume (RAILWAY_VOLUME_MOUNT_PATH).");
      }
    }
    return directory;
  }
  if (directory || process.env.NODE_ENV === "production") {
    throw new Error("Set TASK_EXTRACTION_DATA_DIR to an absolute path on a persistent volume (for example /data/task-extraction).");
  }
  return join(process.cwd(), "data", "task-extraction");
}

export class LedgerBusyError extends Error {}

// Missing files are allowed. Corrupt or unreadable state must never be reset.
export async function readJson<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2));
    await handle.sync();
  } finally { await handle.close(); }
  await rename(temporary, file);
  // Persist the rename too, before any external side effect is allowed.
  const parent = await open(join(file, ".."), "r");
  try { await parent.sync(); } finally { await parent.close(); }
}

export class Ledger {
  constructor(readonly directory: string) {}
  path(name: string) { return join(this.directory, name); }
  async withLock<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = this.path("run.lock");
    try { await mkdir(lock); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new LedgerBusyError("Extraction is locked. If the previous process crashed, stop the extractor before manually removing run.lock.");
      }
      throw error;
    }
    try {
      await atomicJson(join(lock, "owner.json"), { pid: process.pid, startedAt: new Date().toISOString() });
      return await action();
    } finally { await rm(lock, { recursive: true }); }
  }
  async list<T>(prefix: string): Promise<T[]> {
    const files = (await readdir(this.directory)).filter(name => name.startsWith(prefix) && name.endsWith(".json")).sort();
    return Promise.all(files.map(async name => {
      const value = await readJson<T>(this.path(name));
      if (!value) throw new Error(`Ledger file disappeared: ${name}`);
      if (prefix === "record-") validateRecord(value as unknown as Recording);
      return value;
    }));
  }
  async saveRecord(record: Recording) {
    await atomicJson(this.path(`record-${hash(record.id)}.json`), record);
  }
  async record(id: string) {
    const record = await readJson<Recording>(this.path(`record-${hash(id)}.json`));
    if (record) validateRecord(record, id);
    return record;
  }
}

function validReview(version: Version) {
  if (version.reviewAttempts !== undefined && (!Number.isInteger(version.reviewAttempts) || version.reviewAttempts < 0)) return false;
  if (version.reviewError !== undefined && typeof version.reviewError !== "string") return false;
  if (version.qualityReview === undefined) return true; // Existing ledger versions remain readable.
  try {
    if (!version.qualityReview || version.qualityReview.model !== REVIEW_MODEL ||
      !Number.isFinite(Date.parse(version.qualityReview.completedAt)) || version.chunks.some(chunk => chunk.tasks === undefined)) return false;
    validateQualityDecisions(version.qualityReview.decisions, { text: transcriptText(version.transcript), candidates: enumeratedCandidates(version) });
    return true;
  } catch { return false; }
}

export function validateRecord(record: Recording, expectedId = record.id) {
  if (record.schema !== 1 || record.id !== expectedId || typeof record.currentVersion !== "string" ||
    !["pending", "completed", "failed", "needs_review", "awaiting_transcript", "skipped"].includes(record.status) ||
    (record.status === "skipped" && (!record.skip || typeof record.skip.at !== "string" || !Number.isFinite(Date.parse(record.skip.at)) ||
      typeof record.skip.reason !== "string" || !record.skip.reason.trim() || typeof record.skip.backup !== "string" || !record.skip.backup)) ||
    !Array.isArray(record.versions) || !Array.isArray(record.tasks) || !Array.isArray(record.events) ||
    !record.versions.some(version => version.hash === record.currentVersion) ||
    record.versions.some(version => typeof version.hash !== "string" || typeof version.sourceHash !== "string" ||
      !Array.isArray(version.chunks) || !version.transcript || version.transcript.id !== record.id ||
      version.chunks.some(chunk => typeof chunk.text !== "string" || !Number.isInteger(chunk.attempts) || chunk.attempts < 0 ||
        (chunk.tasks !== undefined && (!Array.isArray(chunk.tasks) || chunk.tasks.some(task => typeof task !== "string" || !task.trim())))) || !validReview(version)) ||
    record.tasks.some(task => typeof task.id !== "string" || typeof task.content !== "string" ||
      !["pending", "sending", "delivered", "needs_review", "superseded", "filtered"].includes(task.status) ||
      !record.versions.some(version => version.hash === task.version) ||
      (task.status === "delivered" && !task.todoistId)) ||
    (record.status === "completed" && (record.tasks.some(task => task.status === "sending" || task.status === "needs_review" || (task.version === record.currentVersion && task.status !== "delivered" && task.status !== "filtered")) ||
      record.versions.find(version => version.hash === record.currentVersion)!.chunks.some(chunk => chunk.tasks === undefined)))) {
    throw new Error(`Invalid recording ledger: ${expectedId}; refusing to reset or process it`);
  }
}

export interface Transcript {
  id: string;
  startTime: string;
  endTime?: string;
  updatedAt?: string;
  contents?: Array<{ type: string; content?: string; startTime?: string; endTime?: string }>;
}
export interface Candidate {
  id: string;
  content: string;
  version: string;
  status: "pending" | "sending" | "delivered" | "needs_review" | "superseded" | "filtered";
  todoistId?: string;
  projectId?: string;
  error?: string;
}
export interface Version {
  hash: string;
  sourceHash: string;
  transcript: Transcript;
  discoveredAt: string;
  chunks: Array<{ text: string; tasks?: string[]; attempts: number; model?: string; error?: string }>;
  qualityReview?: QualityReview;
  reviewAttempts?: number;
  reviewError?: string;
}
export interface Recording {
  schema: 1;
  id: string;
  currentVersion: string;
  status: "pending" | "completed" | "failed" | "needs_review" | "awaiting_transcript" | "skipped";
  skip?: { at: string; reason: string; backup: string };
  versions: Version[];
  tasks: Candidate[];
  events: Array<{ at: string; action: string; detail?: string }>;
}

export function event(record: Recording, action: string, detail?: string) {
  record.events.push({ at: new Date().toISOString(), action, detail });
}
