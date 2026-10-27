// All API requests are mocked; this test never uses a real Toggl account.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('toggl_session_token', 'conflict-shortcut-test'));
  let writes = 0;
  const remote = new Map([3, 4, 5].map(id => [id, 'Remote']));
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/validate-session-token') return route.fulfill({ json: { user: { id: 1 }, workspace: { id: 2 } } });
    if (path.endsWith('/description')) {
      const body = route.request().postDataJSON();
      const id = Number(path.split('/')[3]);
      if (!body.reviewOnly) { writes++; remote.set(id, body.local); }
      return route.fulfill({ json: { description: remote.get(id) } });
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
      // Deliberately differ from IndexedDB key order and entry ID order.
      for (const [id, age] of [[3, 3000], [4, 1000], [5, 2000]]) tx.objectStore('drafts').put({ key: `1:2:${id}`, account: '1:2', entryId: id, base: 'Original', local: `Local ${id}`, remote: 'Remote', status: 'conflict', revision: 1, updatedAt: Date.now() - age });
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
  const mine = review.getByRole('button', { name: 'Keep mine', exact: true });
  const toggl = review.getByRole('button', { name: 'Keep Toggl', exact: true });
  const assertSelected = async choice => {
    assert.equal(await choice.getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, await choice.getAttribute('aria-label'), { timeout: 5000 }).catch(async error => {
      console.error('Unexpected focus:', await page.evaluate(() => document.activeElement?.outerHTML));
      throw error;
    });
  };
  assert.match(await review.innerText(), /Entry 4/);
  await assertSelected(mine);
  await page.keyboard.press('ArrowRight');
  await assertSelected(toggl);
  await page.keyboard.press('ArrowLeft');
  await assertSelected(mine);
  await page.keyboard.press('ArrowDown');
  await assertSelected(toggl);
  await page.keyboard.press('ArrowUp');
  await assertSelected(mine);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Meta+;');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 5');
  await assertSelected(mine);
  await page.keyboard.press('Meta+;');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 3');
  await page.keyboard.press('Meta+;');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 4');
  await review.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 5');
  await assertSelected(mine);
  await review.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 4');
  await assertSelected(mine);
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
  await page.evaluate(() => document.documentElement.removeAttribute('data-settings-open'));
  await page.keyboard.press('Meta+g');
  await review.waitFor();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 5');
  await assertSelected(mine);
  assert.equal(writes, 0, 'Keeping Toggl must not upload changes');
  // Enter alone keeps the default Local copy and advances newest-first.
  const localUpload = page.waitForResponse(response => response.url().endsWith('/5/description') && !response.request().postDataJSON().reviewOnly);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 3');
  await assertSelected(mine);
  await localUpload;
  let copiesSaved = false;
  const deadline = Date.now() + 5000;
  while (!copiesSaved && Date.now() < deadline) {
    copiesSaved = await page.evaluate(() => new Promise(resolve => {
      const r = indexedDB.open('deeplog-description-drafts', 1);
      r.onsuccess = () => {
        const tx = r.result.transaction(['drafts', 'history']);
        const drafts = tx.objectStore('drafts').getAll();
        const history = tx.objectStore('history').getAll();
        tx.oncomplete = () => {
          r.result.close();
          resolve(drafts.result.find(d => d.entryId === 4)?.local === 'Remote' &&
            drafts.result.find(d => d.entryId === 5)?.status === 'synced' &&
            history.result.filter(h => h.entryId === 4 || h.entryId === 5).length === 2);
        };
      };
    }));
    if (!copiesSaved) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(copiesSaved, 'Both choices should persist and preserve recovery history');
  assert.equal(writes, 1);
  assert.equal(remote.get(5), 'Local 5');
  // Deleted entries remain recoverable, without allowing keyboard resolution.
  await page.evaluate(() => new Promise(resolve => {
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const draft = store.get('1:2:3');
      draft.onsuccess = () => store.put({ ...draft.result, deleted: true, remote: undefined });
      tx.oncomplete = () => { r.result.close(); resolve(); };
    };
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Description conflict — click to resolve' }).first().waitFor();
  await page.keyboard.press('Meta+g');
  await review.waitFor();
  await page.getByText('Entry deleted', { exact: true }).waitFor();
  assert.equal(await mine.count(), 0);
  assert.equal(await toggl.count(), 0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(writes, 1);
  assert.equal(await review.count(), 1);
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
  console.log('PASS: newest-first review and navigation, default Local selection, all arrow keys, Enter keeps either copy, recovery history, deleted-entry safety, Escape, customization, settings isolation, empty state');
} finally {
  await browser.close();
}
