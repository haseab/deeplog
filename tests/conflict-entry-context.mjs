// Isolated profile; every API request is mocked and no real Toggl data is changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ timezoneId: 'UTC' });
  await context.addInitScript(() => localStorage.setItem('toggl_session_token', 'entry-context-test'));
  const liveStart = '2026-01-15T10:00:00Z';
  const deletedStart = '2026-01-16T10:00:00Z';
  let writes = 0;
  const entry = (id, start) => ({ id, start, description: `Entry ${id}`, stop: new Date(Date.parse(start) + 3600000).toISOString(), duration: 3600, project_id: null, project_name: '', project_color: '#666666', tags: [], tag_ids: [] });
  await context.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/validate-session-token') return route.fulfill({ json: { user: { id: 1 }, workspace: { id: 2 } } });
    if (url.pathname.endsWith('/description')) {
      if (!route.request().postDataJSON().reviewOnly) writes++;
      const id = Number(url.pathname.split('/')[3]);
      return id === 3 ? route.fulfill({ json: { description: 'Remote', start: liveStart } }) : route.fulfill({ status: 409, json: { deleted: true } });
    }
    if (url.pathname === '/api/time-entries') {
      const day = url.searchParams.get('from_date');
      const entries = day === '2026-01-15' ? [entry(3, liveStart)] : day === '2026-01-16' ? [entry(8, '2026-01-16T11:00:00Z')] : [entry(9, new Date().toISOString())];
      return route.fulfill({ json: { timeEntries: entries, projects: [], tags: [], pagination: { page: 0, limit: 100, total: entries.length, hasMore: false }, profileTimeZone: 'UTC' } });
    }
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000');
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('deeplog-draft-account:')));
  await page.evaluate(deletedStart => new Promise((resolve, reject) => {
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('drafts', 'readwrite');
      for (const id of [3, 4, 5]) tx.objectStore('drafts').put({ key: `1:2:${id}`, account: '1:2', entryId: id, base: 'Original', local: `Local ${id}`, remote: id === 3 ? 'Remote' : undefined, deleted: id !== 3, start: id === 4 ? deletedStart : undefined, status: 'conflict', revision: 1, updatedAt: 1000-id });
      tx.oncomplete = () => { r.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }), deletedStart);
  await page.reload();
  await page.getByRole('button', { name: 'Description conflict — click to resolve' }).first().waitFor();
  const review = page.getByRole('dialog', { name: 'Choose a description' });
  await page.keyboard.press('Meta+;');
  await review.waitFor();
  await page.getByRole('button', { name: 'Go to time entry', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  await page.locator('tr[data-entry-id="3"]:visible').waitFor();
  assert.match(page.url(), /from=2026-01-15|from_date=2026-01-15/);
  await page.keyboard.press('Meta+;');
  await review.waitFor();
  await review.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByText('Entry deleted', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Go to time entry', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  await page.locator('tr[data-entry-id="8"]:visible').waitFor();
  await page.getByText('This entry was deleted. Showing the nearest entry from its original day.', { exact: true }).waitFor();
  // Older deleted drafts without a timestamp remain recoverable in the review.
  await page.keyboard.press('Meta+;');
  await review.waitFor();
  await review.getByRole('button', { name: 'Next', exact: true }).click();
  await review.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Go to time entry', exact: true }).click();
  await page.getByText("This entry was deleted, and its original time wasn't saved. Its place in the timeline is unavailable.", { exact: true }).waitFor();
  assert.equal(await review.count(), 1);
  assert.equal(writes, 0);
  await review.getByRole('button', { name: 'Close review', exact: true }).click();
  await page.locator('[data-testid="expandable-description"]:visible').first().click();
  await page.locator('[contenteditable="true"]:visible').fill('Save original entry time with this draft');
  await page.waitForFunction(() => new Promise(resolve => {
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('drafts').objectStore('drafts').get('1:2:8');
      q.onsuccess = () => { resolve(q.result?.start === '2026-01-16T11:00:00Z'); r.result.close(); };
    };
  }));
  console.log('PASS: jump to live entry outside current range, deleted entry day and neighbor, legacy missing-time feedback, no writes, original time persisted with new drafts');
} finally {
  await browser.close();
}
