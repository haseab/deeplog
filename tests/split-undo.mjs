// Isolated browser regressions. Every API request is mocked; no Toggl data is changed.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless: true, channel: 'chrome'});
try {
  for (const mode of ['start', 'end', 'extension', 'running']) {
    for (const action of ['button', 'cmd-z', 'ctrl-z', 'timeout', 'submit', 'rename', ...(mode === 'start' ? ['queued-undo'] : [])]) {
      const context = await browser.newContext({reducedMotion: 'reduce'});
      context.setDefaultTimeout(15000);
      await context.addInitScript(() => {
        localStorage.setItem('toggl_session_token', 'split-undo-test');
        localStorage.setItem('toast_duration', '2000');
      });
      const stop = new Date(); stop.setMinutes(0, 0, 0);
      const original = {
        id: 2, description: 'Original activity', project_id: null, project_name: '', project_color: '#666666', tags: [], tag_ids: [],
        start: new Date(+stop - 7200000).toISOString(),
        stop: mode === 'running' ? '' : stop.toISOString(), duration: mode === 'running' ? -1 : 7200,
      };
      const unrelated = {...original, id: 1, description: 'Unrelated activity', start: new Date(+stop - 10800000).toISOString(), stop: original.start, duration: 3600};
      let entries = [original, unrelated];
      let splitWrites = 0, renameWrites = 0;
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await context.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/validate-session-token') return route.fulfill({json: {user: {id: 1}, workspace: {id: 2}}});
        if (path === '/api/time-entries') return route.fulfill({json: {timeEntries: entries, projects: [], tags: [], pagination: {page: 0, limit: 50, hasMore: false}, profileTimeZone: 'UTC'}});
        if (path === '/api/time-entries/split') {
          splitWrites++;
          const body = route.request().postDataJSON();
          const source = entries.find(entry => entry.id === body.entryId);
          assert.ok(source, 'Split must wait for its source identity');
          const repeated = splitWrites > 1;
          assert.deepEqual(body, {entryId: repeated ? 100 : 2, offsetMinutes: repeated ? 15 : mode === 'extension' ? -30 : 30, isReverse: mode !== 'end'});
          if (!repeated) await gate;
          const end = source.stop || new Date().toISOString();
          const offset = Math.abs(body.offsetMinutes) * 60000;
          const point = mode === 'extension' ? end : new Date(body.isReverse ? +new Date(source.start) + offset : +new Date(end) - offset).toISOString();
          const updatedEntry = mode === 'extension' ? source : {...source, stop: point, duration: (+new Date(point) - +new Date(source.start))/1000};
          const createdEntry = {...source, id: 99 + splitWrites, start: point, stop: mode === 'extension' ? new Date(+new Date(point) + offset).toISOString() : source.stop, duration: mode === 'running' ? -1 : mode === 'extension' ? offset/1000 : (+new Date(end) - +new Date(point))/1000};
          entries = entries.filter(entry => entry.id !== source.id).concat(createdEntry, updatedEntry);
          return route.fulfill({json: {updatedEntry, createdEntry}});
        }
        if (path === '/api/time-entries/100' && route.request().method() === 'PATCH') {
          assert.equal(splitWrites, 1);
          const body = route.request().postDataJSON();
          renameWrites++;
          entries = entries.map(entry => entry.id === 100 ? {...entry, ...body} : entry);
          return route.fulfill({json: entries.find(entry => entry.id === 100)});
        }
        return route.fulfill({json: {}});
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(process.env.DEEPLOG_TEST_URL || 'http://127.0.0.1:3020');
      await page.addStyleTag({content: '#react-scan-root, #react-scan-root * { pointer-events: none !important; }'});
      const row = id => page.locator(`tr[data-entry-id="${id}"]:visible`);
      await row(2).waitFor();
      const originalText = await row(2).innerText();
      await row(2).locator('td').nth(2).click();
      await page.keyboard.press('x');
      await page.getByLabel('Minutes', {exact: true}).fill(mode === 'extension' ? '-30' : '30');
      if (mode === 'end') await page.keyboard.press('Alt+Enter');
      else await page.getByRole('button', {name: 'Split Entry', exact: true}).click();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      const child = page.locator('tr[data-entry-id^="-"]:visible');
      await child.waitFor();
      const undo = page.getByRole('button', {name: 'Undo (⌘Z)', exact: true});
      await undo.waitFor();
      assert.equal(splitWrites, 0, 'Split must update the UI before sending a request');
      if (action === 'queued-undo') {
        const firstChildId = Number(await child.getAttribute('data-entry-id'));
        const splitChild = async () => {
          await row(firstChildId).locator('td').nth(2).click();
          await page.keyboard.press('x');
          await page.getByLabel('Minutes', {exact:true}).fill('15');
          await page.getByRole('button', {name:'Split Entry', exact:true}).click();
          await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
          await page.getByRole('button', {name:'Undo (⌘Z)', exact:true}).waitFor();
        };
        await splitChild(); // This commits the first split, which remains blocked.
        await page.keyboard.press('Meta+z');
        assert.equal(await child.count(), 1, 'Undo must remove only the second split');
        await splitChild();
        await page.keyboard.press('Meta+Enter');
        await page.waitForTimeout(200);
        assert.equal(splitWrites, 1, 'A new split after Undo must still wait for the first split');
        release();
        await row(101).waitFor();
        assert.equal(splitWrites, 2);
        assert.equal(entries.reduce((sum, entry) => sum + entry.duration, 0), 10800);
      } else if (['button', 'cmd-z', 'ctrl-z'].includes(action)) {
        if (action === 'button') await undo.click();
        else await page.keyboard.press(action === 'cmd-z' ? 'Meta+z' : 'Control+z');
        await child.waitFor({state: 'detached'});
        assert.equal(await row(2).innerText(), originalText, 'Undo must restore the original entry');
        await row(2).locator('td.ring-1').waitFor();
        await page.waitForTimeout(2300);
        assert.equal(splitWrites, 0, 'Undo must cancel the delayed write');
        assert.equal(entries.length, 2);
      } else {
        if (action === 'rename') {
          await child.locator('[data-testid="expandable-description"]').click();
          await page.locator('[contenteditable="true"]:visible').fill('Renamed split child');
          await child.locator('td').nth(2).click();
        } else if (action === 'submit') await page.keyboard.press('Meta+Enter');
        for (let attempt = 0; splitWrites === 0 && attempt < 100; attempt++) await page.waitForTimeout(50);
        assert.equal(splitWrites, 1);
        assert.equal(renameWrites, 0, 'Child edits must wait for the split response');
        await undo.waitFor({state: 'hidden'});
        await page.keyboard.press('Meta+z');
        assert.equal(await child.count(), 1, 'In-flight split must not advertise Undo');
        release();
        await row(100).waitFor();
        if (action === 'rename') {
          await page.waitForFunction(() => document.querySelector('tr[data-entry-id="100"]')?.innerText.includes('Renamed split child'));
          for (let attempt = 0; renameWrites === 0 && attempt < 100; attempt++) await page.waitForTimeout(50);
          assert.equal(renameWrites, 1);
          assert.equal(entries.find(entry => entry.id === 100).description, 'Renamed split child');
        }
        assert.equal(entries.length, 3);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS: ${mode} split / ${action}`);
      await context.close();
    }
  }
} finally { await browser.close(); }
