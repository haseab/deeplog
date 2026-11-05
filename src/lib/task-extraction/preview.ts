import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicJson, hash, Ledger, readJson, type Recording } from "./ledger";
import { discover, processRecording, type Providers } from "./pipeline";

const ROOT = join(tmpdir(), "deeplog-extraction-previews");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL = 24 * 60 * 60 * 1000;
interface Manifest {
  owner: string;
  startDate: string;
  endDate: string;
  expiresAt: number;
  discoveryComplete: boolean;
}
export class PreviewError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

// No production ledger or Todoist capability is passed into this test runner.
export async function previewBatch(input: { runId?: string; startDate?: string; endDate?: string },
  sourceKey: string, reader: Pick<Providers, "page" | "extract">,
  options: { root?: string; maxPages?: number; maxRecordings?: number; budgetMs?: number; discoveryOnly?: boolean } = {}) {
  const root = options.root ?? ROOT;
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (input.runId && !UUID.test(input.runId)) throw new PreviewError("Invalid preview run ID");
  if (!input.runId && (!input.startDate || !input.endDate || !Number.isFinite(Date.parse(input.startDate)) ||
    !Number.isFinite(Date.parse(input.endDate)) || Date.parse(input.startDate) >= Date.parse(input.endDate))) {
    throw new PreviewError("Choose a valid start and end time");
  }
  const runId = input.runId ?? randomUUID();
  const ledger = new Ledger(join(root, runId));
  if (input.runId) {
    const manifest = await readJson<Manifest>(ledger.path("preview.json"));
    if (!manifest || manifest.owner !== hash(sourceKey)) throw new PreviewError("Preview not found for this account; start a new test", 404);
    if (manifest.expiresAt < Date.now()) throw new PreviewError("Preview expired; start a new test", 410);
  } else {
    // Remove expired temporary test data only; production storage is never read.
    for (const name of await readdir(root)) {
      if (!UUID.test(name)) continue;
      const directory = join(root, name);
      const age = Date.now() - (await stat(directory)).mtimeMs;
      if (age > TTL) await rm(directory, { recursive: true, force: true });
    }
  }
  const safeProviders: Providers = {
    page: (...args) => reader.page(...args), extract: text => reader.extract(text),
    project: async () => { throw new Error("Todoist is disabled in extraction previews"); },
    create: async () => { throw new Error("Todoist is disabled in extraction previews"); },
  };
  return ledger.withLock(async () => {
    let manifest = await readJson<Manifest>(ledger.path("preview.json"));
    if (!manifest) {
      manifest = { owner: hash(sourceKey), startDate: input.startDate!, endDate: input.endDate!, expiresAt: Date.now() + TTL, discoveryComplete: false };
      await atomicJson(ledger.path("preview.json"), manifest);
    }
    // Recheck under the lock; a run can only be resumed with its original account.
    if (manifest.owner !== hash(sourceKey)) throw new PreviewError("Preview not found", 404);
    const deadline = Date.now() + (options.budgetMs ?? 150_000);
    let discoveryError: string | undefined;
    if (!manifest.discoveryComplete) {
      try {
        const scan = await discover(ledger, safeProviders, { startDate: manifest.startDate, endDate: manifest.endDate, maxPages: options.maxPages ?? 8, deadline });
        manifest.discoveryComplete = scan.status === "completed";
        await atomicJson(ledger.path("preview.json"), manifest);
      } catch (error) { discoveryError = String(error); }
    }
    const records = await ledger.list<Recording>("record-");
    if (!options.discoveryOnly) {
      const unfinished = records.filter(record => record.versions.find(version => version.hash === record.currentVersion)!.chunks.some(chunk => chunk.tasks === undefined))
        .sort((a, b) => (a.events.at(-1)?.at ?? "").localeCompare(b.events.at(-1)?.at ?? ""));
      for (const record of unfinished.slice(0, options.maxRecordings ?? 3)) {
        if (Date.now() >= deadline) break;
        await processRecording(ledger, record, safeProviders, { deadline, draftOnly: true });
      }
    }
    const recordings = records.map(record => {
      const version = record.versions.find(item => item.hash === record.currentVersion)!;
      const chunksDone = version.chunks.filter(chunk => chunk.tasks !== undefined).length;
      return { id: record.id, startTime: version.transcript.startTime, endTime: version.transcript.endTime,
        chunks: version.chunks.length, chunksDone,
        state: record.status === "failed" ? "failed" : !version.chunks.length ? "awaiting_transcript" : chunksDone === version.chunks.length ? "extracted" : "pending",
        errors: version.chunks.flatMap(chunk => chunk.error ? [chunk.error] : []),
        tasks: record.tasks.filter(task => task.version === record.currentVersion).map(task => task.content) };
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return {
      runId, dryRun: true as const, todoistEnabled: false as const,
      startDate: manifest.startDate, endDate: manifest.endDate,
      discoveryComplete: manifest.discoveryComplete, discoveryError,
      complete: !discoveryError && manifest.discoveryComplete && recordings.every(record => ["extracted", "awaiting_transcript"].includes(record.state)),
      totalRecordings: recordings.length,
      extractedRecordings: recordings.filter(record => record.state === "extracted").length,
      failedRecordings: recordings.filter(record => record.state === "failed").length,
      unavailableRecordings: recordings.filter(record => record.state === "awaiting_transcript").length,
      taskCount: recordings.reduce((sum, record) => sum + record.tasks.length, 0),
      recordings,
    };
  });
}
export type PreviewReport = Awaited<ReturnType<typeof previewBatch>>;
