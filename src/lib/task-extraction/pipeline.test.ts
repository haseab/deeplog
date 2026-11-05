import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger, LedgerBusyError, type Transcript } from './ledger';
import { discover, ingest, processRecording, reprocessRecording, RejectedDelivery, resolveDelivery, status, type Providers } from './pipeline';

const transcript = (id = 'rec/one', content = 'Send Alex the contract tomorrow.'): Transcript => ({
  id, startTime: '2026-11-01T10:00:00Z', contents: [{ type: 'blockquote', content }],
});
const providers = (overrides: Partial<Providers> = {}): Providers => ({
  page: async () => ({ transcripts: [], nextCursor: null }),
  extract: async () => ['Send Alex the contract tomorrow.'],
  project: async () => 'project', create: async task => `todoist-${task.id}`, ...overrides,
});
async function fixture(run: (ledger: Ledger) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'deeplog-ledger-'));
  try { await run(new Ledger(directory)); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function record(ledger: Ledger, id = 'rec/one') { return (await ledger.record(id))!; }

test('three-day catch-up inventories all pages, survives restart and does not depend on the old timestamp', () => fixture(async ledger => {
  const cursors: Array<string | null> = [];
  const p = providers({ page: async (_start, _end, cursor) => {
    cursors.push(cursor);
    return { transcripts: [transcript(cursor ? 'second' : 'first')], nextCursor: cursor ? null : 'page2' };
  }});
  const range = { startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-04T00:00:00.000Z' };
  await discover(ledger, p, { ...range, maxPages: 1 });
  const scan = await discover(new Ledger(ledger.directory), p, { ...range, maxPages: 5 });
  assert.equal(scan.status, 'completed');
  assert.deepEqual(cursors, [null, 'page2', null, 'page2', null, 'page2']);
  assert.equal((await ledger.list('record-')).length, 2);
  assert.equal((await record(ledger, 'first')).status, 'pending');
}));

test('failed fetch retains its page; default runs resume unfinished backfills', () => fixture(async ledger => {
  const range = { startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-11-02T00:00:00.000Z' };
  await discover(ledger, providers({ page: async () => ({ transcripts: [transcript()], nextCursor: 'next' }) }), { ...range, maxPages: 1 });
  await assert.rejects(discover(ledger, providers({ page: async () => { throw Error('offline'); } }), range));
  let resumed: string | null = null;
  const scan = await discover(ledger, providers({ page: async (_s, _e, cursor) => { resumed = cursor; return { transcripts: [], nextCursor: null }; } } ), {});
  assert.equal(resumed, 'next');
  assert.equal(scan.status, 'completed');
}));

test('rolling scan revisits seven days and catches outages longer than seven days', () => fixture(async ledger => {
  const now = Date.parse('2026-11-04T00:00:00Z');
  const first = await discover(ledger, providers(), { now, maxPages: 20 });
  assert.equal(first.start, '2026-10-28T00:00:00.000Z');
  const next = await discover(ledger, providers(), { now: now + 12 * 86400000, maxPages: 1 });
  assert.equal(next.start, '2026-11-03T00:00:00.000Z');
}));

test('invalid/repeated pagination never marks a scan complete', () => fixture(async ledger => {
  await assert.rejects(discover(ledger, providers({ page: async () => ({ transcripts: [transcript()], nextCursor: 'same' }) }), { maxPages: 3 }), /pagination/);
  const report = await status(ledger);
  assert.equal(report.scans[0].status, 'pending');
  assert.equal(report.scans[0].cursor, 'same');
}));

test('recordings with no trigger phrase are analyzed and completed recordings are not re-extracted', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  let extracted = 0, created = 0;
  const p = providers({ extract: async text => { extracted++; assert.match(text, /Send Alex/); return ['Send Alex the contract tomorrow.']; },
    create: async task => { created++; const saved = await record(ledger); assert.equal(saved.tasks[0].status, 'sending'); return task.id; } });
  await processRecording(ledger, await record(ledger), p);
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), p);
  assert.equal((await record(ledger)).status, 'completed');
  assert.equal(extracted, 1); assert.equal(created, 1);
}));

test('partial task rejection retries only failed delivery without another AI call', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  const delivered: string[] = [];
  let calls = 0;
  await processRecording(ledger, await record(ledger), providers({ extract: async () => ['Task one', 'Task two'], create: async task => {
    if (++calls === 2) throw new RejectedDelivery('429');
    delivered.push(task.content); return task.id;
  }}));
  assert.equal((await record(ledger)).status, 'failed');
  await processRecording(ledger, await record(ledger), providers({ extract: async () => { throw Error('must not re-extract'); }, create: async task => { delivered.push(task.content); return task.id; } }));
  assert.deepEqual(delivered, ['Task one', 'Task two']);
  assert.equal((await record(ledger)).status, 'completed');
}));

test('ambiguous deliveries are held for review until explicitly resolved', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers({ create: async () => { throw Error('timeout'); } }));
  let saved = await record(ledger);
  assert.equal(saved.status, 'needs_review');
  await processRecording(ledger, saved, providers({ create: async () => { assert.fail('must not retry'); } }));
  await resolveDelivery(ledger, { recordingId: saved.id, taskId: saved.tasks[0].id, todoistId: 'already-created' });
  await processRecording(ledger, await record(ledger), providers({ create: async () => { assert.fail('must not retry'); } }));
  saved = await record(ledger);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.tasks[0].todoistId, 'already-created');
}));

test('crash after write-ahead status never blindly repeats task creation', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers(), { draftOnly: true });
  const saved = await record(ledger); saved.tasks[0].status = 'sending'; await ledger.saveRecord(saved);
  await processRecording(new Ledger(ledger.directory), await record(ledger), providers({ create: async () => { assert.fail('duplicate'); } }));
  assert.equal((await record(ledger)).tasks[0].status, 'needs_review');
}));

test('changed transcripts preserve previous results and hold unmatched wording for review', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers());
  await ingest(ledger, transcript('rec/one', 'Also send another contract.'));
  await processRecording(ledger, await record(ledger), providers({ extract: async () => ['Send Alex the contract tomorrow.', 'Send the additional contract.'], create: async () => { assert.fail('changed wording must be reviewed'); } }));
  const saved = await record(ledger);
  assert.equal(saved.versions.length, 2);
  assert.equal(saved.tasks.length, 2);
  assert.equal(saved.tasks[0].status, 'delivered');
  assert.equal(saved.tasks[1].status, 'needs_review');
  assert.equal(saved.versions[0].chunks[0].tasks?.length, 1);
}));

test('malformed extraction stays failed; explicit no-task result can complete', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers({ extract: async () => undefined as unknown as string[] }));
  assert.equal((await record(ledger)).status, 'failed');
  await processRecording(ledger, await record(ledger), providers({ extract: async () => [] }));
  const saved = await record(ledger);
  assert.equal(saved.status, 'completed'); assert.equal(saved.versions[0].chunks[0].attempts, 2);
}));

test('empty transcripts wait for source data instead of being completed', () => fixture(async ledger => {
  await ingest(ledger, transcript('empty', ''));
  assert.equal((await record(ledger, 'empty')).status, 'awaiting_transcript');
  await ingest(ledger, transcript('empty', 'Now available.'));
  assert.equal((await record(ledger, 'empty')).status, 'pending');
}));

test('long recordings are fully chunked, overlap and resume without repeating finished chunks', () => fixture(async ledger => {
  await ingest(ledger, transcript('long', 'a'.repeat(30000) + 'TAIL'));
  const saved = await record(ledger, 'long');
  const chunks = saved.versions[0].chunks;
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].text.slice(-1000), chunks[1].text.slice(0, 1000));
  assert.match(chunks[2].text, /TAIL$/);
  let count = 0;
  await processRecording(ledger, saved, providers({ extract: async () => { if (++count === 2) throw Error('fail second chunk'); return []; } }));
  let resumed = 0;
  await processRecording(ledger, await record(ledger, 'long'), providers({ extract: async () => { resumed++; return []; } }));
  assert.equal(resumed, 2);
  assert.equal((await record(ledger, 'long')).status, 'completed');
}));

test('atomic lock excludes competing runs, releases on error, and corruption is never reset', () => fixture(async ledger => {
  await ledger.withLock(async () => {
    await assert.rejects(new Ledger(ledger.directory).withLock(async () => {}), LedgerBusyError);
  });
  await assert.rejects(ledger.withLock(async () => { throw Error('fail'); }));
  await ledger.withLock(async () => {});
  await ingest(ledger, transcript());
  const name = (await readdir(ledger.directory)).find(name => name.startsWith('record-'))!;
  await writeFile(join(ledger.directory, name), '{bad json');
  await assert.rejects(ingest(ledger, transcript()), SyntaxError);
}));

test('storage failure happens before external delivery', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers(), { draftOnly: true });
  const broken = new Ledger(ledger.directory);
  broken.saveRecord = async () => { throw Error('disk full'); };
  await assert.rejects(processRecording(broken, await record(ledger), providers({ create: async () => { assert.fail('must not send without durable save'); } })), /disk full/);
}));

test('draft migration links existing Todoist IDs and immediately completes without delivery', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers(), { draftOnly: true });
  const saved = await record(ledger);
  await resolveDelivery(ledger, { recordingId: saved.id, taskId: saved.tasks[0].id, todoistId: 'legacy-id' });
  assert.equal((await record(ledger)).status, 'completed');
  assert.equal((await record(ledger)).tasks[0].todoistId, 'legacy-id');
}));

test('manual reprocessing preserves past attempts and is not undone by a rescan', () => fixture(async ledger => {
  await ingest(ledger, transcript());
  await processRecording(ledger, await record(ledger), providers({ extract: async () => [] }));
  await reprocessRecording(ledger, 'rec/one');
  const queued = await record(ledger);
  await ingest(ledger, transcript());
  assert.equal((await record(ledger)).currentVersion, queued.currentVersion);
  await processRecording(ledger, await record(ledger), providers());
  const saved = await record(ledger);
  assert.equal(saved.versions.length, 2);
  assert.deepEqual(saved.versions[0].chunks[0].tasks, []);
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.status, 'completed');
}));
