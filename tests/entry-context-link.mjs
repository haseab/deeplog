// Every API is mocked: opening a context link must never edit Toggl entries.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
  for(const paged of [false,true]) {
  const context = await browser.newContext({timezoneId:'UTC'});
  await context.addInitScript(()=>localStorage.setItem('toggl_session_token','entry-context-link-test'));
  let writes=0;const requests=[];
  const entry=(id,start,stop)=>({id,start,stop,description:'Entry '+id,duration:(Date.parse(stop)-Date.parse(start))/1000,project_id:null,project_name:'',project_color:'#666666',tags:[],tag_ids:[]});
  const entries=[entry(101,'2026-11-03T18:20:06Z','2026-11-03T18:23:38Z'),entry(102,'2026-11-03T18:25:37Z','2026-11-03T18:25:40Z'),entry(103,'2026-11-03T18:25:40Z','2026-11-03T18:35:40Z')];
  await context.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url());requests.push(request.method()+' '+url.pathname+url.search);
    if(url.pathname.startsWith('/api/time-entries')&&!['GET','HEAD'].includes(request.method()))writes++;
    if(url.pathname==='/api/validate-session-token')return route.fulfill({json:{user:{id:1},workspace:{id:2}}});
    if(url.pathname==='/api/time-entries'){const page=Number(url.searchParams.get('page')??0);return route.fulfill({json:{timeEntries:!paged?entries:page===0?[entries[0],entries[2]]:[entries[1]],projects:[],tags:[],pagination:{page,limit:100,total:3,hasMore:paged&&page===0},profileTimeZone:'UTC'}});}
    return route.fulfill({json:{}});
  });
  const page=await context.newPage();
  const base=process.env.TEST_BASE_URL??'http://127.0.0.1:3020';
  await page.goto(base+'/?'+new URLSearchParams({from:'2026-11-03T18:05:06.000Z',to:'2026-11-03T18:40:40.000Z',highlight:'101,102'}));
  for(const id of [101,102]) {
    const row=page.locator('[data-entry-id="'+id+'"]:visible');
    try{await row.waitFor({timeout:10000});}catch(error){console.log('BODY',await page.locator('body').innerText());console.log('REQUESTS',requests);throw error;}
    await page.waitForFunction(id=>Array.from(document.querySelectorAll('[data-entry-id="'+id+'"]')).some(row=>row.offsetParent!==null&&row.className.includes('ring-2')),id);
    assert.match(await row.getAttribute('class'),/ring-2/);
  }
  assert.doesNotMatch(await page.locator('[data-entry-id="103"]:visible').getAttribute('class'),/ring-2/);
  assert.equal(writes,0,'Context links must not write to Toggl');
  console.log('PASS: both linked entries highlighted, neighbor unselected, no writes; paged='+paged);
  await context.close();
  }
} finally {await browser.close();}
