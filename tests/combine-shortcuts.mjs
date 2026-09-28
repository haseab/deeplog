// Run with `npm run dev`. All provider-facing traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const reverse of [false, true]) {
    const context = await browser.newContext();
    context.setDefaultTimeout(15000);
    await context.addInitScript(() => localStorage.setItem('toggl_session_token', 'combine-test'));
    const end = new Date(); end.setMinutes(0, 0, 0);
    let entries = [3, 2, 1].map((id, index) => ({
      id, description: ['Newer destination', 'Selected source', 'Older destination'][index],
      project_id: null, project_name: '', project_color: '#666666', tags: [], tag_ids: [],
      start: new Date(+end - (index + 1) * 3600000).toISOString(),
      stop: new Date(+end - index * 3600000).toISOString(), duration: 3600,
    }));
    let requestBody;
    await context.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/validate-session-token') return route.fulfill({ json: { user: { id: 1 }, workspace: { id: 2 } } });
      if (path === '/api/time-entries') return route.fulfill({ json: { timeEntries: entries, projects: [], tags: [], pagination: { page: 0, limit: 50, total: entries.length, hasMore: false }, profileTimeZone: 'UTC' } });
      if (path === '/api/time-entries/combine') {
        requestBody = route.request().postDataJSON();
        const keptId = reverse ? 3 : 1;
        const kept = entries.find(entry => entry.id === keptId);
        const newer = entries.find(entry => entry.id === requestBody.currentEntryId);
        const older = entries.find(entry => entry.id === requestBody.olderEntryId);
        const updatedEntry = { ...kept, start: older.start, stop: newer.stop, duration: 7200 };
        entries = entries.filter(entry => entry.id !== 2).map(entry => entry.id === keptId ? updatedEntry : entry);
        return route.fulfill({ json: { updatedEntry, deletedEntryId: 2 } });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.DEEPLOG_TEST_URL || 'http://127.0.0.1:3000');
    const row = id => page.locator(`tr[data-entry-id="${id}"]:visible`);
    await row(2).waitFor();
    await row(2).locator('td').nth(2).click(); // Date cell selects without opening an editor.
    await page.keyboard.press(reverse ? 'Alt+c' : 'c');
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const copy = await dialog.innerText();
    assert.ok(copy.includes(reverse ? 'newer row above' : 'older row below'));
    assert.ok(copy.includes('Selected source'));
    assert.ok(copy.includes(reverse ? 'Newer destination' : 'Older destination'));
    assert.ok(!copy.includes(reverse ? 'Older destination' : 'Newer destination'));
    await page.getByRole('button', { name: 'Combine Entries', exact: true }).click();
    await row(2).waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.deepEqual(requestBody, reverse
      ? { currentEntryId: 3, olderEntryId: 2, reverse: true }
      : { currentEntryId: 2, olderEntryId: 1, reverse: false });
    const keptId = reverse ? 3 : 1;
    await row(keptId).locator('td.ring-1').waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS: ${reverse ? 'Option+C' : 'C'} folds the selected row into its neighbor and follows the surviving row`);
    await context.close();
  }
} finally { await browser.close(); }
