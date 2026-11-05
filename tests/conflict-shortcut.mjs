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
    await choice.waitFor();
    await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, await choice.getAttribute('aria-label'));
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
  await assertSelected(mine);
  await page.keyboard.press('Escape');
  await review.waitFor({ state: 'detached' });
  await page.evaluate(() => document.documentElement.setAttribute('data-settings-open', 'true'));
  await page.keyboard.press('Meta+g');
  assert.equal(await review.count(), 0);
  assert.equal(writes, 0, 'Reviewing must never choose a version or upload changes');
  await page.evaluate(() => document.documentElement.removeAttribute('data-settings-open'));
  await page.keyboard.press('Meta+g');
  await review.waitFor();
  await assertSelected(mine);
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
  // Deleted entries require explicit completion and keep their recovery copy.
  await page.evaluate(() => new Promise(resolve => {
    const r = indexedDB.open('deeplog-description-drafts', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('drafts', 'readwrite');
      const store = tx.objectStore('drafts');
      const draft = store.get('1:2:3');
      draft.onsuccess = () => store.put({ ...draft.result, deleted: true, remote: undefined });
      store.put({ key: '1:2:6', account: '1:2', entryId: 6, base: 'Original', local: 'Local 6', deleted: true, status: 'conflict', revision: 1, updatedAt: 1 });
      tx.oncomplete = () => { r.result.close(); resolve(); };
    };
  }));
  await page.reload();
  await page.getByRole('button', { name: 'Description conflict — click to resolve' }).first().waitFor();
  await page.keyboard.press('Meta+g');
  await review.waitFor();
  await page.getByText('Entry deleted', { exact: true }).waitFor();
  assert.equal(await mine.count(), 0);
  assert.equal(await toggl.count(), 1);
  assert.equal(await review.getByRole('button', { name: 'Mark complete', exact: true }).count(), 0);
  assert.equal(writes, 1);
  assert.equal(await review.count(), 1);
  // If recovery storage fails, completion must leave the draft pending.
  await page.evaluate(() => {
    window.originalDraftPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'history') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return window.originalDraftPut.apply(this, args);
    };
  });
  await review.getByText('Entry deleted', { exact: true }).click();
  await page.getByText('Local draft could not be saved.', { exact: true }).waitFor();
  assert.equal(await page.locator('#local-description').textContent(), 'Local 3');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalDraftPut; });
  await context.setOffline(true);
  await review.getByText('Entry deleted', { exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#local-description')?.textContent === 'Local 6');
  await review.getByText('Entry deleted', { exact: true }).click();
  await review.waitFor({ state: 'detached' });
  assert.equal(writes, 1, 'Completing deleted entries must not upload or recreate them');
  await context.setOffline(false);
  await page.reload();
  await page.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Description conflict — click to resolve"]'));
  await page.getByRole('button', { name: 'Description recovery history', exact: true }).click();
  const historyDialog = page.getByRole('dialog', { name: 'Description recovery history' });
  await historyDialog.waitFor();
  assert.equal(await historyDialog.getByRole('textbox', { name: 'Local copy', exact: true }).inputValue(), 'Local 6');
  await historyDialog.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await historyDialog.getByRole('textbox', { name: 'Local copy', exact: true }).inputValue(), 'Local 3');
  await historyDialog.getByRole('button', { name: 'Close history', exact: true }).click();
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
  console.log('PASS: conflict navigation and choices, deleted-entry completion offline, recovery after reload, storage-failure safety, no Toggl writes on completion, shortcuts and empty state');
} finally {
  await browser.close();
}
