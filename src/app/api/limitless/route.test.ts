import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from './route';

const request = (query: string, authenticated = true) => new NextRequest(`http://localhost:3020/api/limitless?${query}`, { headers: authenticated ? { 'x-limitless-api-key': 'test-key' } : {} });

test('recording deep links fetch the exact source ID and return one uncached recording', async () => {
  const original = globalThis.fetch;
  let called = '';
  globalThis.fetch = async (url, init) => {
    called = String(url);
    assert.equal(new Headers(init?.headers).get('X-API-Key'), 'test-key');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ data: { lifelog: { id: 'target-recording', contents: [{ type: 'blockquote', content: 'Source evidence' }] } } });
  };
  try {
    const response = await GET(request('lifelogId=target-recording&start=2026-01-01&cursor=unrelated'));
    assert.equal(response.status, 200);
    assert.equal(new URL(called).pathname, '/v1/lifelogs/target-recording');
    assert.equal(new URL(called).searchParams.has('cursor'), false);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.equal(data.data.lifelogs[0].id, 'target-recording');
    assert.equal(data.meta.lifelogs.nextCursor, null);
  } finally { globalThis.fetch = original; }
});

test('deep links validate IDs and authentication before network requests', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { assert.fail('Unexpected network request'); };
  try {
    assert.equal((await GET(request('lifelogId=target', false))).status, 401);
    for (const id of ['', '../private', 'target?cursor=x']) assert.equal((await GET(request(`lifelogId=${encodeURIComponent(id)}`))).status, 400);
  } finally { globalThis.fetch = original; }
});

test('a mismatched source recording fails rather than displaying unrelated history', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: { lifelog: { id: 'different', contents: [] } } });
  try { assert.equal((await GET(request('lifelogId=target'))).status, 502); }
  finally { globalThis.fetch = original; }
});
