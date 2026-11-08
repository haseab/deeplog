import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { ingest } from '@/lib/task-extraction/pipeline';
import { Ledger, ledgerDirectory } from '@/lib/task-extraction/ledger';

const envNames = ['CRON_SECRET', 'TASK_EXTRACTION_DATA_DIR', 'LIMITLESS_API_KEY', 'OPENAI_API_KEY', 'TODOIST_API_KEY', 'VERCEL', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_VOLUME_MOUNT_PATH'];
async function fixture(action: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'deeplog-route-'));
  const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  try {
    for (const name of envNames) delete process.env[name];
    Object.assign(process.env, { CRON_SECRET: 'test-secret', TASK_EXTRACTION_DATA_DIR: directory, LIMITLESS_API_KEY: 'test', OPENAI_API_KEY: 'test', TODOIST_API_KEY: 'test' });
    globalThis.fetch = async () => { throw Error('Unexpected network request'); };
    await action(directory);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    await rm(directory, { recursive: true, force: true });
  }
}
function request(body?: unknown, authorized = true, suffix = '') {
  return new NextRequest(`http://localhost:3020/api/cron/extract-tasks${suffix}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(authorized ? { Authorization: 'Bearer test-secret' } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('route rejects missing authentication, default secrets, malformed requests, flags and ranges', () => fixture(async () => {
  assert.equal((await GET(request(undefined, false))).status, 401);
  assert.equal((await POST(request({}, false))).status, 401);
  delete process.env.CRON_SECRET;
  assert.equal((await POST(request({}))).status, 401);
  process.env.CRON_SECRET = 'test-secret';
  for (const body of [null, [], { draftOnly: 'false' }, { startDate: 'bad' }, { endDate: '2026-11-01' }, { startDate: '2026-11-03', endDate: '2026-11-01' }, { testTranscript: '' }, { testTranscript: 'test', createTestTasks: true }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
}));

test('Railway must use its mounted volume; real extraction refuses Vercel', () => fixture(async directory => {
  process.env.VERCEL = '1';
  assert.equal((await POST(request({}))).status, 500);
  delete process.env.VERCEL;
  process.env.RAILWAY_ENVIRONMENT_ID = 'environment';
  assert.throws(ledgerDirectory, /attached Railway volume/);
  process.env.RAILWAY_VOLUME_MOUNT_PATH = directory;
  assert.equal(ledgerDirectory(), directory);
  delete process.env.TASK_EXTRACTION_DATA_DIR;
  assert.equal(ledgerDirectory(), join(directory, 'task-extraction'));
  process.env.TASK_EXTRACTION_DATA_DIR = `${directory}-different`;
  assert.throws(ledgerDirectory, /attached Railway volume/);
}));

test('discovery, draft review, legacy linking and subsequent delivery survive separate requests', () => fixture(async () => {
  let aiCalls = 0, creates = 0;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('limitless.ai')) return Response.json({ data: { lifelogs: [{ id: 'rec', startTime: '2026-11-01T12:00:00Z', contents: [{ type: 'blockquote', content: 'Send a contract.' }] }] } });
    if (path.includes('openai.com')) {
      aiCalls++;
      const payload = JSON.parse(String(init?.body));
      const result = payload.model === 'gpt-6-luna' ? { tasks: ['Send contract', 'Book review'] } : {
        decisions: [0, 1].map(candidate => ({ candidate, keep: true, reason: 'Pending commitment', evidence: 'Send a contract.' })),
      };
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
    }
    if (path.includes('projects/search')) return Response.json({ results: [{ name: 'task-extraction', id: 'project' }] });
    if (path.endsWith('/tasks')) { creates++; return Response.json({ id: 'created' }); }
    throw Error('unexpected URL');
  };
  assert.equal((await POST(request({ discoveryOnly: true }))).status, 200);
  assert.equal(aiCalls, 0); assert.equal(creates, 0);
  assert.equal((await POST(request({ draftOnly: true }))).status, 200);
  const report = await (await GET(request())).json();
  assert.equal(report.counts.pending, 1); assert.equal(aiCalls, 2); assert.equal(creates, 0);
  const task = report.issues[0].tasks[0];
  assert.equal((await POST(request({ resolveDelivery: { recordingId: 'rec', taskId: task.id, todoistId: 'legacy-task' } }))).status, 200);
  assert.equal((await POST(request({}))).status, 200);
  assert.equal((await POST(request({}))).status, 200);
  assert.equal(creates, 1); assert.equal(aiCalls, 2);
  const final = await GET(request(undefined, true, '?recordingId=rec'));
  assert.equal(final.headers.get('Cache-Control'), 'no-store');
  assert.equal((await final.json()).status, 'completed');
}));

test('route reports uncertain deliveries as failure and lock contention as 409', () => fixture(async directory => {
  const ledger = new Ledger(directory);
  await ledger.withLock(async () => {
    assert.equal((await GET(request())).status, 409);
    assert.equal((await POST(request({}))).status, 409);
  });
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('limitless')) return Response.json({ data: { lifelogs: [{ id: 'rec', startTime: '2026-11-01', contents: [{ type: 'blockquote', content: 'Task' }] }] } });
    if (String(url).includes('openai')) {
      const payload = JSON.parse(String(init?.body));
      const result = payload.model === 'gpt-6-luna' ? { tasks: ['Task'] } : {
        decisions: [{ candidate: 0, keep: true, reason: 'Pending commitment', evidence: 'Task' }],
      };
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] });
    }
    if (String(url).includes('projects/search')) return Response.json({ results: [{ name: 'task-extraction', id: 'project' }] });
    throw Error('lost response');
  };
  const response = await POST(request({}));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.success, false); assert.equal(body.counts.needs_review, 1);
}));

test('cron resumes pending quality review after enumeration and only delivers approved tasks', () => fixture(async directory => {
  const ledger = new Ledger(directory);
  await ingest(ledger, { id: 'quality', startTime: '2026-11-01', contents: [{ type: 'blockquote', content: 'Go to the room. I will send Alex the contract Friday.' }] });
  const record = (await ledger.record('quality'))!;
  record.versions[0].chunks[0].tasks = ['Go to the room.', 'Send Alex the contract Friday.'];
  await ledger.saveRecord(record);
  let reviews = 0;
  const created: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('limitless')) return Response.json({ data: { lifelogs: [] } });
    if (path.includes('openai')) {
      assert.equal(JSON.parse(String(init?.body)).model, 'gpt-6.1-sol'); reviews++;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ decisions: [
        { candidate: 0, keep: false, reason: 'Transient direction', evidence: '' },
        { candidate: 1, keep: true, reason: 'Concrete pending commitment', evidence: 'I will send Alex the contract Friday.' },
      ] }) } }] });
    }
    if (path.includes('projects/search')) return Response.json({ results: [{ name: 'task-extraction', id: 'project' }] });
    if (path.endsWith('/tasks')) { created.push(JSON.parse(String(init?.body)).content); return Response.json({ id: 'created' }); }
    throw Error('Unexpected network request');
  };
  const response = await POST(request({}));
  assert.equal(response.status, 200); assert.equal(reviews, 1);
  assert.deepEqual(created, ['Send Alex the contract Friday.']);
  assert.equal((await ledger.record('quality'))!.status, 'completed');
}));
