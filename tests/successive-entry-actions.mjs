// Run with `npm run dev`. All provider-facing traffic is mocked.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const scenario of [
    ...[false, true].flatMap(multiple => [false, true].flatMap(reverse => [false, true].flatMap(inFlight => ['split', 'rename'].map(action => ({multiple, reverse, inFlight, action}))))),
    {multiple: false, reverse: false, inFlight: false, action: 'split', fail: true},
    {multiple: false, reverse: false, inFlight: false, action: 'split-twice'},
    {multiple: false, reverse: false, inFlight: false, action: 'split-rename'},
  ]) {
    const {multiple, reverse, inFlight, action, fail = false} = scenario;
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    context.setDefaultTimeout(15000);
    await context.addInitScript(() => {
      localStorage.setItem('toggl_session_token', 'combine-test');
      localStorage.setItem('toast_duration', '60000');
    });
    const end = new Date(); end.setMinutes(0, 0, 0);
    let entries = [3, 2, 1].map((id, index) => ({
      id, description: ['Newer destination', 'Selected source', 'Older destination'][index],
      project_id: null, project_name: '', project_color: '#666666', tags: [], tag_ids: [],
      start: new Date(+end - (index + 1) * 3600000).toISOString(),
      stop: new Date(+end - index * 3600000).toISOString(), duration: 3600,
    }));
    let combineStarted = false;
    let combineFinished = false;
    let splitWrites = 0;
    let renameWrites = 0;
    let nextId = 100;
    let releaseSplit;
    const splitGate = new Promise(resolve => { releaseSplit = resolve; });
    const events = [];
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
      if (path === '/api/time-entries/combine' || (multiple && path === '/api/time-entries/2' && route.request().method() === 'DELETE')) {
        combineStarted = true;
        events.push('combine-start');
        const snapshot = entries.find(entry => entry.id === keptId);
        const newer = entries.find(entry => entry.id === (reverse ? 3 : 2));
        const older = entries.find(entry => entry.id === (reverse ? 2 : 1));
        await combineGate;
        if (fail) return route.fulfill({status: 503, json: {error: 'Injected combine failure'}});
        entries = entries.filter(entry => entry.id !== 2);
        if (multiple) return route.fulfill({json: {}});
        const updatedEntry = {...snapshot, start: older.start, stop: newer.stop, duration: 7200};
        entries = entries.map(entry => entry.id === keptId ? updatedEntry : entry);
        combineFinished = true;
        events.push('combine-end');
        return route.fulfill({json: {updatedEntry, deletedEntryId: 2}});
      }
      if (multiple && path === `/api/time-entries/${keptId}` && route.request().method() === 'PATCH') {
        const updatedEntry = {...entries.find(entry => entry.id === keptId), ...route.request().postDataJSON()};
        entries = entries.map(entry => entry.id === keptId ? updatedEntry : entry);
        combineFinished = true;
        events.push('combine-end');
        return route.fulfill({json: updatedEntry});
      }
      if (path === '/api/time-entries/split') {
        assert.equal(combineFinished, true, 'Split must wait for combine acknowledgement');
        const body = route.request().postDataJSON();
        const original = entries.find(entry => entry.id === body.entryId);
        assert.ok(original, 'Split must resolve the temporary ID');
        splitWrites++;
        events.push('split-start');
        if (['split-twice', 'split-rename'].includes(action) && splitWrites === 1) await splitGate;
        const point = new Date(new Date(original.start).getTime() + body.offsetMinutes * 60000).toISOString();
        const updatedEntry = {...original, stop: point, duration: body.offsetMinutes * 60};
        const createdEntry = {...original, id: nextId++, start: point, duration: (new Date(original.stop)-new Date(point))/1000};
        entries = entries.map(entry => entry.id === original.id ? updatedEntry : entry).concat(createdEntry);
        return route.fulfill({json: {updatedEntry, createdEntry}});
      }
      if (path === '/api/time-entries/100' && route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        const entry = entries.find(entry => entry.id === 100);
        assert.ok(entry, 'Rename must wait for its split child to exist');
        renameWrites++;
        const updated = {...entry, ...body};
        entries = entries.map(entry => entry.id === 100 ? updated : entry);
        return route.fulfill({json: updated});
      }
      if (path.endsWith('/description')) {
        assert.equal(combineFinished, true, 'Rename must wait for combine acknowledgement');
        const body = route.request().postDataJSON();
        renameWrites++;
        entries = entries.map(entry => entry.id === keptId ? {...entry, description: body.local} : entry);
        return route.fulfill({json: {description: body.local}});
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
    if (inFlight) {
      await page.keyboard.press('Meta+Enter');
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Undo (⌘Z)'));
    }
    if (action === 'rename') {
      await row(keptId).locator('[data-testid="expandable-description"]').click();
      await page.locator('[contenteditable="true"]:visible').fill('Renamed after combine');
      await row(keptId).locator('td').nth(2).click();
      await page.getByText('Description updated.', {exact:true}).waitFor();
      await page.keyboard.press('Meta+Enter');
    } else {
      await row(keptId).locator('td').nth(2).click();
      await page.keyboard.press('x');
      await page.getByLabel('Minutes', {exact:true}).fill('30');
      await page.getByRole('button', {name: 'Split Entry', exact:true}).click();
    }
    const poll = async (check, message) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await check()) return;
        await page.waitForTimeout(100);
      }
      assert.fail(message);
    };
    await poll(() => combineStarted, 'Follow-up should commit the earlier combine');
    await page.waitForTimeout(250);
    assert.equal(splitWrites, 0, 'Split must remain queued while combine is pending');
    assert.equal(renameWrites, 0, 'Rename must remain queued while combine is pending');
    releaseCombine();
    if (fail) {
      await page.getByText('Failed to split entry. Reverting changes.', {exact:true}).waitFor();
      assert.equal(splitWrites, 0);
      await row(2).waitFor();
      assert.equal(await row(keptId).count(), 1);
    } else if (action === 'rename') {
      await poll(() => renameWrites === 1, 'Rename did not flush after combine');
      assert.equal(entries.find(entry => entry.id === keptId).description, 'Renamed after combine');
      await poll(async () => (await row(keptId).innerText()).includes('Renamed after combine'), 'Rename disappeared from the optimistic UI');
    } else {
      await poll(() => splitWrites === 1, 'Split did not flush after combine');
      if (action === 'split-rename') {
        const child = page.locator('tr[data-entry-id^="-"]:visible');
        await child.locator('[data-testid="expandable-description"]').click();
        await page.locator('[contenteditable="true"]:visible').fill('Renamed pending split child');
        await child.locator('td').nth(2).click();
        await page.waitForTimeout(250);
        assert.equal(renameWrites, 0);
        releaseSplit();
        await poll(() => renameWrites === 1, 'Rename did not flush for the split child');
        assert.equal(entries.find(entry => entry.id === 100).description, 'Renamed pending split child');
      }
      if (action === 'split-twice') {
        // The first split is still in flight; split its temporary child again.
        const child = page.locator('tr[data-entry-id^="-"]:visible');
        await child.locator('td').nth(2).click();
        await page.keyboard.press('x');
        await page.getByLabel('Minutes', {exact:true}).fill('15');
        await page.getByRole('button', {name: 'Split Entry', exact:true}).click();
        await page.waitForTimeout(250);
        assert.equal(splitWrites, 1);
        releaseSplit();
        await poll(() => splitWrites === 2, 'Second split did not resolve the child ID');
      }
      await poll(() => entries.some(entry => entry.id === (action === 'split-twice' ? 101 : 100)), 'Split did not finish');
      assert.equal(entries.reduce((total, entry) => total + entry.duration, 0), 10800, 'Combined and split entries must retain all original tracked time');
      assert.ok(events.indexOf('combine-end') < events.indexOf('split-start'));
      await row(action === 'split-twice' ? 101 : 100).waitFor();
      const localDuration = await page.locator('tr[data-entry-id]:visible').evaluateAll(rows => rows.map(row => row.innerText));
      assert.ok(localDuration.length >= 3);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${JSON.stringify(scenario)}`);
    await context.close();
  }
} finally { await browser.close(); }
