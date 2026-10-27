// All API requests are mocked; this test never uses a real Toggl account.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('toggl_session_token', 'conflict-shortcut-test'));
  let writes = 0;
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/validate-session-token') return route.fulfill({ json: { user: { id: 1 }, workspace: { id: 2 } } });
    if (path.endsWith('/description')) {
      if (!route.request().postDataJSON().reviewOnly) writes++;
      return route.fulfill({ json: { description: 'Remote' } });
    }
    if (path === '/api/time-entries') return route.fulfill({ json: {
      timeEntries: [{ id: 3, description: 'Remote', project_id: null, project_name: '', project_color: '#666666', start: new Date(Date.now()-3600000).toISOString(), stop: new Date().toISOString(), duration: 3600, tags: [], tag_ids: [] }],
      projects: [], tags: [], pagination: { page: 0, limit: 50, total: 1, hasMore: false }, profileTimeZone: 'UTC',
    } });
    return route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  await page.goto(process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000');
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('deeplog-draft-account:')));
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('drafts', 'readwrite');
      for (const id of [3, 4]) tx.objectStore('drafts').put({ key: `1:2:${id}`, account: '1:2', entryId: id, base: 'Original', local: `Local ${id}`, remote: 'Remote', status: 'conflict', revision: 1, updatedAt: Date.now() });
      tx.oncomplete = () => { r.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Description conflict — click to resolve' }).first().waitFor();
  // The shortcut must work while focus is in an editor, without editing text.
  await page.locator('[data-testid="expandable-description"]:visible').first().click();
  await page.locator('[contenteditable="true"]:visible').focus();
  await page.keyboard.press('Meta+;');
  const review = page.getByRole('dialog', { name: 'Choose a description' });
  await review.waitFor();
  assert.match(await review.innerText(), /Entry 3/);
  assert.equal(await review.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Meta+;');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 4');
  await page.keyboard.press('Meta+;');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 3');
  await page.keyboard.press('Escape');
  await review.waitFor({ state: 'detached' });
  // Rebinding disables Cmd+; and routes the custom binding to the same action.
  await page.evaluate(() => {
    localStorage.setItem('deeplog_keyboard_shortcuts', JSON.stringify({ 'resolve-conflicts': 'Mod+g' }));
    window.dispatchEvent(new Event('shortcuts-changed'));
  });
  await page.keyboard.press('Meta+;');
  assert.equal(await review.count(), 0);
  await page.keyboard.press('Meta+g');
  await review.waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.documentElement.setAttribute('data-settings-open', 'true'));
  await page.keyboard.press('Meta+g');
  assert.equal(await review.count(), 0);
  assert.equal(writes, 0, 'Reviewing must never choose a version or upload changes');
  await page.evaluate(() => new Promise((resolve, reject) => {
    localStorage.removeItem('deeplog_keyboard_shortcuts');
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').clear();
      tx.oncomplete = () => { r.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }));
  await page.reload();
  await page.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  await page.keyboard.press('Meta+;');
  await page.getByText('No local description conflicts.', { exact: true }).waitFor();
  assert.equal(await review.count(), 0);
  console.log('PASS: Cmd+; from editor, conflict cycling, keyboard focus, Escape, customization, settings isolation, no writes, empty state');
} finally {
  await browser.close();
}
