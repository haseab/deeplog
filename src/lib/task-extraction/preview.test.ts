import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { previewBatch, type PreviewReport } from './preview';
import type { Providers } from './pipeline';

async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'deeplog-preview-test-'));
  try { await action(root); } finally { await rm(root, { recursive: true, force: true }); }
}
const review: Providers["review"] = async ({ text, candidates }) => candidates.map((_content, candidate) => ({ candidate, keep: true, reason: "Explicit commitment", evidence: text }));
const recording = (id: string) => ({ id, startTime: '2026-10-29T12:00:00Z', contents: [{ type: 'blockquote', content: `Send contract ${id}` }] });

test('arbitrary three-day preview follows every page and resumes without Todoist or production state', () => fixture(async root => {
  const sentinel = join(root, 'production.json');
  await writeFile(sentinel, '{"lastProcessedTimestamp":"unchanged"}');
  let fetches = 0, extracts = 0, creates = 0;
  const reader: Providers = {
    review,
    page: async (_start, end, cursor) => { fetches++; return { transcripts: [recording(`${end}:${cursor || 'first'}`)], nextCursor: cursor ? null : 'second' }; },
    extract: async text => { extracts++; return [`Candidate: ${text}`]; },
    project: async () => { creates++; throw Error('Todoist must not be available'); },
    create: async () => { creates++; throw Error('Todoist must not be available'); },
  };
  const options = { root: join(root, 'previews'), maxPages: 1, maxRecordings: 1 };
  let report = await previewBatch({ startDate: '2026-10-29T00:00:00Z', endDate: '2026-11-01T00:00:00Z' }, 'source-key', reader, options);
  assert.equal(report.complete, false);
  for (let batch = 0; !report.complete && batch < 20; batch++) report = await previewBatch({ runId: report.runId }, 'source-key', reader, options);
  assert.equal(report.complete, true); assert.equal(report.totalRecordings, 6);
  assert.equal(report.extractedRecordings, 6); assert.equal(report.taskCount, 6);
  assert.equal(fetches, 6); assert.equal(extracts, 6); assert.equal(creates, 0);
  await previewBatch({ runId: report.runId }, 'source-key', reader, options);
  assert.equal(fetches, 6); assert.equal(extracts, 6);
  assert.equal(await readFile(sentinel, 'utf8'), '{"lastProcessedTimestamp":"unchanged"}');
  assert.equal(report.dryRun, true); assert.equal(report.todoistEnabled, false);
  const manifest = await readFile(join(options.root, report.runId, 'preview.json'), 'utf8');
  assert.equal(manifest.includes('source-key'), false);
}));

test('preview failures stay partial and retry only unfinished extraction', () => fixture(async root => {
  let attempt = 0;
  const reader = { review, page: async () => ({ transcripts: [recording('one'), recording('two')], nextCursor: null }),
    extract: async () => { if (++attempt === 2) throw Error('temporary error'); return ['Task']; } };
  const first = await previewBatch({ startDate: '2026-10-29T00:00:00Z', endDate: '2026-10-30T00:00:00Z' }, 'key', reader, { root });
  assert.equal(first.failedRecordings, 1); assert.equal(first.complete, false);
  const retry = await previewBatch({ runId: first.runId }, 'key', reader, { root });
  assert.equal(retry.complete, true); assert.equal(retry.failedRecordings, 0); assert.equal(attempt, 3);
}));

test('preview ownership, range validation and path traversal fail closed', () => fixture(async root => {
  const reader = { review, page: async () => ({ transcripts: [], nextCursor: null }), extract: async () => [] };
  await assert.rejects(previewBatch({ runId: '../../production' }, 'key', reader, { root }), /Invalid preview/);
  await assert.rejects(previewBatch({ startDate: 'bad', endDate: 'bad' }, 'key', reader, { root }), /valid start/);
  const report = await previewBatch({ startDate: '2026-10-29T00:00:00Z', endDate: '2026-10-30T00:00:00Z' }, 'key', reader, { root });
  await assert.rejects(previewBatch({ runId: report.runId }, 'other-key', reader, { root }), /not found/);
  assert.deepEqual((await readdir(root)).length, 1);
}));

test('empty and unavailable recordings are distinguished from successful no-task extraction', () => fixture(async root => {
  const reader = { review, page: async () => ({ transcripts: [{ id: 'empty', startTime: '2026-10-29', contents: [] }, recording('no-tasks')], nextCursor: null }), extract: async () => [] };
  const report: PreviewReport = await previewBatch({ startDate: '2026-10-29T00:00:00Z', endDate: '2026-10-30T00:00:00Z' }, 'key', reader, { root });
  assert.equal(report.complete, true); assert.equal(report.unavailableRecordings, 1); assert.equal(report.extractedRecordings, 1);
  assert.equal(report.taskCount, 0);
}));

test('preview never exposes raw candidates and resumes a failed quality pass', () => fixture(async root => {
  let enumerations = 0, reviews = 0;
  const reader = {
    page: async () => ({ transcripts: [recording('quality')], nextCursor: null }),
    extract: async () => { enumerations++; return ['Go to the room.', 'Send contract quality']; },
    review: async () => {
      if (++reviews === 1) throw Error('quality review offline');
      return [
        { candidate: 0, keep: false, reason: 'Vague direction', evidence: '' },
        { candidate: 1, keep: true, reason: 'Concrete commitment', evidence: 'Send contract quality' },
      ];
    },
  };
  const first = await previewBatch({ startDate: '2026-10-29T00:00:00Z', endDate: '2026-10-30T00:00:00Z' }, 'key', reader, { root });
  assert.equal(first.complete, false); assert.equal(first.taskCount, 0);
  assert.equal(first.recordings[0].chunksDone, first.recordings[0].chunks);
  assert.match(first.recordings[0].errors.join(' '), /quality review offline/);
  const retry = await previewBatch({ runId: first.runId }, 'key', reader, { root });
  assert.equal(retry.complete, true); assert.equal(retry.taskCount, 1);
  assert.deepEqual(retry.recordings[0].tasks, ['Send contract quality']);
  assert.equal(enumerations, 1); assert.equal(reviews, 2);
}));
