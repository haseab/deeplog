import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from './providers';
import { RejectedDelivery } from './pipeline';

const keys = { limitless: 'test', openai: 'test', todoist: 'test' };
async function mock(responses: Response[], action: (calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw Error('Unexpected request');
    return response;
  };
  try { await action(calls); } finally { globalThis.fetch = original; }
}

test('content fetching uses small pages; larger live pages silently omit speech', async () => {
  await mock([Response.json({ data: { lifelogs: [] } })], async calls => {
    await createProviders(keys).page('start', 'end', null);
    const params = new URL(calls[0].url).searchParams;
    assert.equal(params.get('limit'), '20');
    assert.equal(params.get('includeContents'), 'true');
    assert.equal(params.get('includeHeadings'), 'true');
    assert.equal(params.get('includeMarkdown'), 'true');
  });
});

test('malformed Limitless pages and cursors fail instead of becoming empty success', async () => {
  for (const payload of [{}, { data: { lifelogs: [] }, meta: { lifelogs: { nextCursor: 123 } } }]) {
    await mock([Response.json(payload)], async () => {
      await assert.rejects(createProviders(keys).page('start', 'end', null));
    });
  }
});

test('AI must return a complete result and explicit tasks array', async () => {
  for (const [finish_reason, content] of [['stop', '{}'], ['length', '{"tasks":[]}'], ['stop', '{"tasks":[null]}'], ['stop', 'bad json']]) {
    await mock([Response.json({ choices: [{ finish_reason, message: { content } }] })], async () => {
      await assert.rejects(createProviders(keys).extract('recording'));
    });
  }
  await mock([Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"tasks":[]}' } }] })], async () => {
    assert.deepEqual(await createProviders(keys).extract('recording'), []);
  });
});

test('project lookup paginates and refuses ambiguous names', async () => {
  await mock([Response.json({ results: [], next_cursor: 'next' }), Response.json({ results: [{ name: 'task-extraction', id: 'project' }] })], async calls => {
    assert.equal(await createProviders(keys).project(), 'project');
    assert.match(calls[1].url, /cursor=next/);
  });
  await mock([Response.json({ results: [{ name: 'task-extraction', id: 'a' }, { name: 'task-extraction', id: 'b' }] })], async () => {
    await assert.rejects(createProviders(keys).project(), /exactly one/);
  });
});

test('delivery writes the reconciliation marker and distinguishes rejection from uncertainty', async () => {
  const task = { id: 'candidate-id', content: 'Send contract', recordingId: 'rec', startTime: '2026-11-01', projectId: 'project' };
  await mock([Response.json({ id: 'created-id' })], async calls => {
    assert.equal(await createProviders(keys).create(task), 'created-id');
    assert.match(JSON.parse(String(calls[0].init?.body)).description, /\[DeepLog:candidate-id\]/);
  });
  for (const code of [400, 401, 403, 404, 422, 429]) await mock([Response.json({}, { status: code })], async () => {
    await assert.rejects(createProviders(keys).create(task), RejectedDelivery);
  });
  for (const response of [Response.json({}, { status: 500 }), Response.json({})]) await mock([response], async () => {
    await assert.rejects(createProviders(keys).create(task), error => !(error instanceof RejectedDelivery));
  });
});
