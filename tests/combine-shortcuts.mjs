// Run with `npm run dev`. All provider-facing traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const undo of [false, true]) for (const multiple of [false, true]) for (const reverse of [false, true]) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    context.setDefaultTimeout(15000);
    await context.addInitScript(() => {
      localStorage.setItem('toggl_session_token', 'combine-test');
      localStorage.setItem('toast_duration', '2500');
    });
    const end = new Date(); end.setMinutes(0, 0, 0);
    let entries = [3, 2, 1].map((id, index) => ({
      id, description: ['Newer destination', 'Selected source', 'Older destination'][index],
      project_id: null, project_name: '', project_color: '#666666', tags: [], tag_ids: [],
      start: new Date(+end - (index + 1) * 3600000).toISOString(),
      stop: new Date(+end - index * 3600000).toISOString(), duration: 3600,
    }));
    let requestBody;
    let releaseCombine;
    const combineGate = new Promise(resolve => { releaseCombine = resolve; });
    let listRequests = 0;
    let mutationRequests = 0;
    const keptId = reverse ? 3 : 1;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (['POST', 'PATCH', 'DELETE'].includes(route.request().method()) && path.startsWith('/api/time-entries')) mutationRequests++;
      if (path === '/api/validate-session-token') return route.fulfill({ json: { user: { id: 1 }, workspace: { id: 2 } } });
      if (path === '/api/time-entries') {
        listRequests++;
        return route.fulfill({ json: { timeEntries: entries, projects: [], tags: [], pagination: { page: 0, limit: 50, total: entries.length, hasMore: false }, profileTimeZone: 'UTC' } });
      }
      if (path === '/api/time-entries/combine') {
        requestBody = route.request().postDataJSON();
        await combineGate;
        const keptId = reverse ? 3 : 1;
        const kept = entries.find(entry => entry.id === keptId);
        const newer = entries.find(entry => entry.id === requestBody.currentEntryId);
        const older = entries.find(entry => entry.id === requestBody.olderEntryId);
        const updatedEntry = { ...kept, start: older.start, stop: newer.stop, duration: 7200 };
        entries = entries.filter(entry => entry.id !== 2).map(entry => entry.id === keptId ? updatedEntry : entry);
        return route.fulfill({ json: { updatedEntry, deletedEntryId: 2 } });
      }
      if (multiple && path === '/api/time-entries/2' && route.request().method() === 'DELETE') {
        await combineGate;
        entries = entries.filter(entry => entry.id !== 2);
        return route.fulfill({ json: {} });
      }
      if (multiple && path === `/api/time-entries/${keptId}` && route.request().method() === 'PATCH') {
        const updatedEntry = { ...entries.find(entry => entry.id === keptId), ...route.request().postDataJSON() };
        entries = entries.map(entry => entry.id === keptId ? updatedEntry : entry);
        return route.fulfill({ json: updatedEntry });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.DEEPLOG_TEST_URL || 'http://127.0.0.1:3020');
    // The development React Scan overlay must not intercept toast clicks.
    await page.addStyleTag({ content: '#react-scan-root, #react-scan-root * { pointer-events: none !important; }' });
    const row = id => page.locator(`tr[data-entry-id="${id}"]:visible`);
    await row(2).waitFor();
    if (multiple) {
      await row(2).hover();
      await row(2).getByRole('checkbox').check();
      await row(keptId).getByRole('checkbox').check();
    }
    await row(2).locator('td').nth(2).click(); // Date cell selects without opening an editor.
    await page.keyboard.press(reverse ? 'Alt+c' : 'c');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const copy = await dialog.innerText();
    if (!multiple) assert.ok(copy.includes(reverse ? 'newer row above' : 'older row below'));
    assert.ok(copy.includes('Selected source'));
    assert.ok(copy.includes(reverse ? 'Newer destination' : 'Older destination'));
    assert.ok(!copy.includes(reverse ? 'Older destination' : 'Newer destination'));
    await page.getByRole('button', { name: multiple ? 'Combine 2 Entries' : 'Combine Entries', exact: true }).click();
    await row(2).waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    if (!multiple) await row(keptId).locator('td.ring-1').waitFor();
    await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).waitFor();
    assert.equal(mutationRequests, 0, 'Combining must wait for the undo window before writing');
    if (undo) {
      if (reverse) await page.keyboard.press('Meta+z');
      else await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).click();
      await row(2).waitFor();
      await page.waitForTimeout(2800);
      assert.equal(mutationRequests, 0, 'Undo must cancel the write, including after the timer expires');
      if (!multiple) await row(2).locator('td.ring-1').waitFor();
      assert.deepEqual(errors, []);
      console.log(`PASS: ${multiple ? 'Multi-row' : 'Single-row'} ${reverse ? 'Option+C / Cmd+Z' : 'C / Undo button'} restores entries without saving`);
      await context.close();
      continue;
    }
    // Keep the write blocked: the row must already be combined, and a stale
    // manual refresh must not resurrect the source or shrink the destination.
    const combinedRowText = await row(keptId).innerText();
    await page.waitForTimeout(1100); // Allow the list fetch debounce to expire.
    const requestsBeforeRefresh = listRequests;
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/time-entries');
    await page.getByText('Refresh (R)', { exact: true }).locator('..').locator('..').locator('visible=true').click();
    await refreshed;
    await page.getByText('In Sync', { exact: true }).locator('visible=true').waitFor();
    assert.ok(listRequests > requestsBeforeRefresh, 'Manual refresh fetched stale server entries');
    assert.equal(await row(2).count(), 0, 'Refresh must not resurrect the optimistically deleted row');
    assert.equal(await row(keptId).innerText(), combinedRowText, 'Refresh must preserve the combined times');
    const started = page.waitForRequest(request => new URL(request.url()).pathname === (multiple ? '/api/time-entries/2' : '/api/time-entries/combine'));
    if (reverse) await page.keyboard.press('Meta+Enter');
    const writeRequest = await started;
    if (!multiple) assert.deepEqual(writeRequest.postDataJSON(), reverse
      ? { currentEntryId: 3, olderEntryId: 2, reverse: true }
      : { currentEntryId: 2, olderEntryId: 1, reverse: false });
    await page.getByRole('button', { name: 'Undo (⌘Z)', exact: true }).waitFor({ state: 'hidden' });
    releaseCombine();
    await page.getByText(multiple ? 'Combined 2 entries successfully' : 'Entries combined successfully', { exact: true }).waitFor();
    await page.keyboard.press('Meta+z');
    assert.equal(await row(2).count(), 0, 'A committed combine must no longer advertise a local Undo');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${multiple ? 'Multi-row' : 'Single-row'} ${reverse ? 'Option+C' : 'C'} combines before saving and survives a stale refresh`);
    await context.close();
  }
} finally { await browser.close(); }
