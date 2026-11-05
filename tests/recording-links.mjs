import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// All API calls are mocked; no external recordings or tasks are touched.
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
 const context = await browser.newContext();
 await context.addInitScript(() => localStorage.setItem('limitless_api_key', 'recording-link-test'));
 const calls=[];
 await context.route('**/api/**', async route => {
  const url=new URL(route.request().url());
  assert.equal(url.pathname,'/api/limitless');
  calls.push(url.searchParams);
  const id=url.searchParams.get('lifelogId');
  return route.fulfill({json:{data:{lifelogs:id?[{id,title:'Exact source recording',startTime:'2026-10-28T17:46:21Z',endTime:'2026-10-28T18:00:00Z',updatedAt:'2026-10-28T18:01:00Z',contents:[{type:'blockquote',content:'The exact source evidence.',startOffsetMs:0,endOffsetMs:1000}]}]:[]}}});
 });
 const page=await context.newPage();
 await page.goto('http://localhost:3020/pendant?recordingId=target-source');
 await page.getByRole('heading',{name:'Exact source recording',exact:true}).waitFor();
 await page.getByText('The exact source evidence.',{exact:true}).waitFor();
 assert.ok(calls.length>0);
 assert.ok(calls.every(params=>params.get('lifelogId')==='target-source'));
 await page.getByPlaceholder('today from 3 to 5pm').fill('yesterday');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('q')==='yesterday'&&!url.searchParams.has('recordingId'));
 await page.getByText('No transcriptions found for the selected date range.').waitFor();
 assert.ok(calls.some(params=>!params.has('lifelogId')&&params.has('start')));
 console.log('PASS: direct source links load the exact recording; normal date search still works');
}finally{await browser.close();}
