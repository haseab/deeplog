// Isolated browser test: all Toggl-facing API traffic is mocked; no real account is used.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext();
await context.addInitScript(() => !localStorage.getItem('toggl_session_token') && localStorage.setItem('toggl_session_token', 'offline-test-session'));
await context.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '#react-scan-root { display: none !important; }';
    document.head.appendChild(style);
  });
});
let remote = 'Planning';
let offline = false;
let writes = 0;
let deleted = false;
let delay = 0;
let started = false;
let loseResponse = false;
await context.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (offline) return route.abort('internetdisconnected');
  if (url.pathname === '/api/validate-session-token') return route.fulfill({ json: { user: { id: route.request().postDataJSON().sessionToken === 'another-account' ? 9 : 1 }, workspace: { id: 2 } } });
  if (url.pathname.endsWith('/description')) {
    const body = route.request().postDataJSON();
    if (deleted) return route.fulfill({ status: 409, json: { deleted: true } });
    if (body.reviewOnly) return route.fulfill({ json: { description: remote } });
    if (body.local === remote) return route.fulfill({ json: { description: remote } });
    if (body.base !== remote) return route.fulfill({ status: 409, json: { description: remote } });
    started = true;
    if (delay) await new Promise(r => setTimeout(r, delay));
    remote = body.local; writes++;
    if (loseResponse) { loseResponse = false; return route.abort('failed'); }
    return route.fulfill({ json: { description: remote } });
  }
  if (url.pathname === '/api/time-entries') return route.fulfill({ json: {
    timeEntries: [{ id: 3, description: remote, project_id: null, project_name: '', project_color: '#666666', start: new Date(Date.now()-3600000).toISOString(), stop: new Date().toISOString(), duration: 3600, tags: [], tag_ids: [] }],
    projects: [], tags: [], pagination: { page: 0, limit: 50, total: 1, hasMore: false }, profileTimeZone: 'UTC',
  } });
  return route.fulfill({ json: {} });
});
const page = await context.newPage();
const errors=[];
page.on('pageerror', e => errors.push(e.message));
const poll = async (fn, message) => { const until=Date.now()+20000; while(Date.now()<until) { if(await fn()) return; await new Promise(r=>setTimeout(r,100)); } throw Error(message); };
const records = () => page.evaluate(() => new Promise((resolve,reject) => { const r=indexedDB.open('deeplog-description-drafts',1); r.onsuccess=()=>{const q=r.result.transaction('drafts').objectStore('drafts').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error); }));
const edit = async text => {
  const editor=page.locator('[contenteditable="true"]:visible');
  if (!await editor.count()) await page.locator('[data-testid="expandable-description"]:visible').first().click();
  await editor.fill(text);
};
try {
  await page.goto('http://127.0.0.1:3000');
  await page.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  await poll(() => page.evaluate(() => Object.keys(localStorage).some(k=>k.startsWith('deeplog-draft-account:'))), 'account not verified');
  offline=true;
  await edit('Planning launch');
  await poll(async()=> (await records())[0]?.local==='Planning launch', 'draft was not persisted while typing');
  assert.equal(writes,0);
  await page.keyboard.press('Control+Enter');
  remote='Planning budget'; offline=false;
  await page.reload();
  await poll(async()=> (await records())[0]?.status==='conflict', 'conflict not detected after reload');
  await page.getByRole('button',{name:'Description conflict — click to resolve'}).first().click();
  assert.equal(await page.locator('#local-description').inputValue(),'Planning launch');
  assert.equal(await page.locator('#remote-description').inputValue(),'Planning budget');
  await page.addStyleTag({content:'react-scan-toolbar, #react-scan-root { display:none !important; }'});
  await page.screenshot({path:'/tmp/deeplog-description-conflict.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const dialogBox=await page.getByRole('dialog').boundingBox();
  assert.ok(dialogBox.width <= 390);
  await page.screenshot({path:'/tmp/deeplog-description-conflict-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:720});
  // A change during review must refresh the comparison without writing.
  remote='Planning revised budget';
  await page.getByRole('button',{name:'Keep mine',exact:true}).click();
  await poll(async()=>await page.locator('#remote-description').inputValue()==='Planning revised budget','review did not recheck Toggl');
  assert.equal(writes,0);
  await page.getByRole('button',{name:'Merge/edit',exact:true}).click();
  await page.locator('#merged-description').fill('Planning launch and budget');
  await page.getByRole('button',{name:'Save merged description',exact:true}).click();
  await poll(()=>remote==='Planning launch and budget','merged text not uploaded');
  await poll(async()=> (await records())[0]?.status==='synced', 'merge not marked synced');
  console.log('PASS: local persistence, refresh recovery, remote conflict, review recheck, merge');
  // A response for an older revision must not delete newer typing.
  delay=2500; started=false;
  await edit('First upload');
  await poll(()=>started,'upload did not start');
  await edit('Newer typing');
  await poll(()=>remote==='Newer typing','newer typing lost during upload');
  delay=0;
  await poll(async()=> (await records())[0]?.status==='synced','newer draft not synced');
  console.log('PASS: edits during upload');
  // Simulate server applying a write but losing the response.
  loseResponse=true;
  await edit('Response lost');
  await poll(async()=> (await records())[0]?.status==='error','lost response not retained');
  await page.keyboard.press('Control+Enter');
  await page.reload();
  await poll(async()=> (await records())[0]?.status==='synced','lost response retry failed');
  assert.equal(remote,'Response lost');
  console.log('PASS: lost response reconciliation');
  // Two tabs must preserve competing local drafts, not silently overwrite them.
  offline=true;
  await edit('First tab offline draft');
  await poll(async()=> (await records())[0]?.local==='First tab offline draft','first tab draft missing');
  await page.keyboard.press('Control+Enter');
  offline=false;
  const other=await context.newPage();
  await other.goto('http://127.0.0.1:3000');
  await other.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  offline=true;
  await other.locator('[data-testid="expandable-description"]:visible').first().click();
  await other.locator('[contenteditable="true"]:visible').fill('Second tab offline draft');
  await poll(async()=> (await records())[0]?.status==='conflict','cross-tab conflict not detected');
  await other.keyboard.press('Control+Enter');
  await other.close();
  offline=false;
  await page.getByRole('button',{name:'Description conflict — click to resolve'}).first().click();
  await poll(async()=>await page.locator('#remote-description').inputValue()===remote,'remote not loaded for local conflict');
  const beforeKeep=writes;
  await page.getByRole('button',{name:'Keep Toggl',exact:true}).click();
  await poll(async()=> (await records())[0]?.status==='synced','keep Toggl not acknowledged');
  assert.equal(writes,beforeKeep);
  await page.getByRole('button',{name:'Description recovery history',exact:true}).click();
  assert.ok((await page.getByLabel('Recovered local description').evaluateAll(nodes=>nodes.map(n=>n.value))).includes('First tab offline draft'));
  await page.getByRole('button',{name:'Close',exact:true}).click();
  console.log('PASS: competing browser tabs, Keep Toggl, recovery history');
  // E2EE drafts must be ciphertext in IndexedDB, including before upload.
  const hash=createHash('sha256').update('123456deeplog-e2ee-v1_pin_hash').digest('hex');
  await page.evaluate(hash=>{localStorage.setItem('e2ee_enabled','true');localStorage.setItem('e2ee_pin_hash',hash);},hash);
  await page.reload();
  await page.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  offline=true;
  await edit('Private offline draft');
  await poll(async()=>{const d=(await records())[0];return d?.status==='local' && d.local.includes(':') && !d.local.includes('Private');},'draft not encrypted at rest');
  await page.keyboard.press('Control+Enter');
  offline=false;
  await page.reload();
  await poll(async()=> (await records())[0]?.status==='synced','encrypted draft not synced');
  assert.ok(!remote.includes('Private') && remote.includes(':'));
  console.log('PASS: encrypted offline storage and sync');
  // Switching accounts must not expose the previous account's drafts.
  await page.evaluate(()=>localStorage.setItem('toggl_session_token','another-account'));
  await page.reload();
  await poll(()=>page.evaluate(()=>Object.values(localStorage).includes('9:2')),'new account not identified');
  assert.equal(await page.getByRole('button',{name:'Description synced',exact:true}).count(),0);
  await page.evaluate(()=>localStorage.setItem('toggl_session_token','offline-test-session'));
  await page.reload();
  await page.locator('[data-testid="expandable-description"]:visible').first().waitFor();
  console.log('PASS: account isolation');
  offline=true;
  await edit('Keep my encrypted version');
  await poll(async()=> (await records())[0]?.status==='local','Keep mine draft missing');
  await page.keyboard.press('Control+Enter');
  remote='A different phone edit'; offline=false;
  await page.reload();
  await poll(async()=> (await records())[0]?.status==='conflict','Keep mine conflict missing');
  const mine=(await records())[0].local;
  await page.getByRole('button',{name:'Description conflict — click to resolve'}).first().click();
  await page.getByRole('button',{name:'Keep mine',exact:true}).click();
  await poll(()=>remote===mine,'Keep mine did not upload chosen version');
  await poll(async()=> (await records())[0]?.status==='synced','Keep mine not acknowledged');
  console.log('PASS: Keep mine');
  offline=true;
  await edit('Recover deleted entry');
  await poll(async()=> (await records())[0]?.status==='local','deleted draft missing');
  await page.keyboard.press('Control+Enter');
  offline=false; deleted=true;
  await page.reload();
  await poll(async()=> (await records())[0]?.deleted===true,'deletion not detected');
  await page.getByRole('button',{name:'Description conflict — click to resolve'}).first().click();
  assert.equal(await page.getByRole('button',{name:'Keep mine',exact:true}).count(),0);
  assert.equal(await page.locator('#local-description').inputValue(),'Recover deleted entry');
  console.log('PASS: deleted-entry recovery');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const storedBefore=(await records())[0].local;
  await page.evaluate(()=>{
    IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};
  });
  await edit('Unsaved text must stay visible');
  await page.getByText('Not saved:',{exact:false}).waitFor();
  await page.keyboard.press('Control+Enter');
  await poll(async()=> (await page.locator('[data-testid="expandable-description"]:visible').first().innerText()).includes('Unsaved text must stay visible'),'storage failure lost visible text');
  assert.equal((await records())[0].local,storedBefore);
  assert.ok(await page.getByRole('button',{name:/NOT SAVED LOCALLY/}).count());
  console.log('PASS: storage failure retains text in memory without claiming persistence');
  assert.deepEqual(errors,[]);
  console.log('PASS: no browser runtime errors');
} finally { await browser.close(); }
