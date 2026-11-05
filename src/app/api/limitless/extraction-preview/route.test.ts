import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from './route';

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3020/api/limitless/extraction-preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}
test('preview requires both user keys; unknown delivery flags are rejected before network access', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw Error('Unexpected network access'); };
  try {
    assert.equal((await POST(request({}))).status, 401);
    assert.equal((await POST(request({}, { 'x-limitless-api-key': 'test' }))).status, 401);
    for (const body of [{ createTestTasks: true }, { draftOnly: false }, { resolveDelivery: {} }, { runId: '../../production' }]) {
      assert.equal((await POST(request(body, { 'x-limitless-api-key': 'test', 'x-openai-api-key': 'test' }))).status, 400);
    }
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
});
