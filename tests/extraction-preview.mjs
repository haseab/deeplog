// All service requests are mocked. No real recordings or tasks are changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('limitless_api_key', 'preview-test-source');
    localStorage.setItem('openai_api_key', 'preview-test-ai');
  });
  const requests = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const report = { runId: 'test-run', dryRun: true, todoistEnabled: false, startDate: '2026-09-01T00:00:00Z', endDate: '2026-10-01T00:00:00Z', discoveryComplete: false, complete: false, totalRecordings: 1, extractedRecordings: 0, failedRecordings: 0, unavailableRecordings: 0, taskCount: 0, recordings: [{ id: 'example', startTime: '2026-09-15T10:00:00Z', chunks: 1, chunksDone: 0, state: 'pending', errors: [], tasks: [] }] };
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/limitless') return route.fulfill({ json: { data: { lifelogs: [] } } });
    assert.equal(url.pathname, '/api/limitless/extraction-preview', 'unexpected service mutation');
    requests.push(route.request().postDataJSON());
    if (requests.length === 2) { await gate; return route.fulfill({ json: { ...report, discoveryComplete: true } }); }
    if (requests.length >= 3) return route.fulfill({ json: { ...report, discoveryComplete: true, complete: true, extractedRecordings: 1, taskCount: 1, recordings: [{ ...report.recordings[0], state: 'extracted', chunksDone: 1, tasks: ['Send the example contract.'] }] } });
    return route.fulfill({ json: report });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3020/pendant');
  await page.getByRole('button', { name: 'Test extraction', exact: true }).click();
  await page.getByLabel('Test range start').fill('2026-09-01T00:00');
  await page.getByLabel('Test range end').fill('2026-10-01T00:00');
  await page.getByRole('button', { name: 'Run test', exact: true }).click();
  await page.getByText(/Partial results: 1 recordings/).waitFor();
  await page.getByRole('button', { name: 'Stop after this batch' }).click();
  release();
  await page.getByRole('button', { name: 'Resume test' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Resume test' }).click();
  await page.getByText(/Test complete: 1 recordings found/).waitFor();
  assert.equal(requests.length, 3);
  assert.equal(requests[0].startDate, new Date('2026-09-01T00:00').toISOString());
  assert.equal(requests[0].endDate, new Date('2026-10-01T00:00').toISOString());
  assert.deepEqual(requests[1], { runId: 'test-run' });
  assert.deepEqual(requests[2], { runId: 'test-run' });
  await page.locator('summary').filter({ hasText: '1 candidates' }).click();
  await page.getByText('Send the example contract.').waitFor();
  await page.screenshot({ path: '/private/tmp/deeplog-extraction-preview.png', fullPage: true });
  console.log('PASS: arbitrary dates, partial progress, stop/resume, candidate results, and preview-only requests');
} finally { await browser.close(); }
