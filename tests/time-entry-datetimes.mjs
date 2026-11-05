// Run with a BB local headless browser session (all API requests are mocked):
// bb browser-automation run <session> --script-file <checkout>/tests/time-entry-datetimes.mjs --script-host <host> --json
const page = await browser.getPage("main");
await page.goto("about:blank");
await page.setViewport({ width: 1280, height: 900 });
await page.emulateTimezone("UTC");
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("toggl_session_token", "datetime-range-test");
  localStorage.setItem("deeplog_timezone_mode", "custom");
  localStorage.setItem("deeplog_custom_timezone", "America/Los_Angeles");
});

const requests = [];
let writes = 0;
page.removeAllListeners("request");
await page.setRequestInterception(true);
page.on("request", async request => {
  const url = new URL(request.url());
  if (!url.pathname.startsWith("/api/")) return request.continue();
  if (/^\/api\/time-entries(?:\/|$)/.test(url.pathname) && request.method() !== "GET") writes++;
  let data = {};
  if (url.pathname === "/api/validate-session-token") {
    data = { user: { id: 1 }, workspace: { id: 2 } };
  }
  if (url.pathname === "/api/time-entries") {
    requests.push(Object.fromEntries(url.searchParams));
    const index = Number(url.searchParams.get("page"));
    const entries = [{
      id: index + 1, description: `Datetime entry ${index + 1}`,
      start: "2026-11-02T17:30:00Z", stop: "2026-11-02T18:30:00Z", duration: 3600,
      project_id: null, project_name: "", project_color: "#666666", tags: [], tag_ids: [],
    }];
    data = {
      timeEntries: entries, projects: [], tags: [], profileTimeZone: "America/Los_Angeles",
      pagination: { page: index, limit: 100, total: 2, hasMore: index === 0 },
    };
  }
  return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
});

const base = "http://localhost:3020/";
const from = "2026-11-02T22:30:01.123+05:30";
const to = "2026-11-02T23:30:00+05:30";
const url = `${base}?${new URLSearchParams({ from, to, keep: "yes" })}#entries`;
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function checkBounds(expectedFrom, expectedTo, expectedZone = "America/Los_Angeles") {
  const params = new URL(page.url()).searchParams;
  check(params.get("from") === expectedFrom && params.get("to") === expectedTo, "URL lost exact boundaries");
  const request = requests.at(-1);
  check(request.from_date === expectedFrom && request.to_date === expectedTo, "API request lost exact boundaries");
  check(request.timezone === expectedZone, "Request did not use the selected timezone");
}

await page.goto(url);
await page.waitForSelector("[data-testid=datetime-range]", { timeout: 15000 });
await page.waitForSelector("tr[data-entry-id='1']", { timeout: 15000 });
checkBounds(from, to);
check(new URL(page.url()).hash === "#entries", "URL update dropped the hash");
await page.snapshot();

await page.reload();
await page.waitForSelector("tr[data-entry-id='1']");
checkBounds(from, to);

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("button")];
  const loadMore = buttons.find(button => button.textContent.includes("Load More"));
  if (!loadMore) throw new Error("Load More button missing");
  loadMore.click();
});
await page.waitForSelector("tr[data-entry-id='2']");
checkBounds(from, to);
check(requests.at(-1).page === "1", "Pagination did not request the next page");

// The app deliberately debounces resyncs for one second after the last fetch.
await new Promise(resolve => setTimeout(resolve, 1050));
const refreshRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/time-entries");
await page.keyboard.press("r");
await refreshRequest;
await page.waitForLoad();
checkBounds(from, to);
check(requests.at(-1).limit === "200", "Resync did not retain the loaded page count");

const nextFrom = "2026-11-02T09:15";
const nextTo = "2026-11-02T09:45";
await page.evaluate((from, to) => {
  const params = new URLSearchParams({ from, to, keep: "yes" });
  window.history.pushState({}, "", `/?${params}#entries`);
}, nextFrom, nextTo);
await page.waitForFunction(from => document.querySelector("[data-testid=datetime-range]")?.title.startsWith(from), {}, nextFrom);
await page.waitForLoad();
checkBounds(nextFrom, nextTo);

await page.evaluate(() => window.history.back());
await page.waitForFunction(from => document.querySelector("[data-testid=datetime-range]")?.title.startsWith(from), {}, from);
await page.waitForLoad();
checkBounds(from, to);

await page.evaluate(() => window.history.forward());
await page.waitForFunction(from => document.querySelector("[data-testid=datetime-range]")?.title.startsWith(from), {}, nextFrom);
await page.waitForLoad();
checkBounds(nextFrom, nextTo);

const timezoneRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("timezone") === "Asia/Tokyo");
await page.evaluate(() => {
  localStorage.setItem("deeplog_custom_timezone", "Asia/Tokyo");
  window.dispatchEvent(new Event("deeplog-timezone-change"));
});
await timezoneRequest;
await page.waitForLoad();
checkBounds(nextFrom, nextTo, "Asia/Tokyo");
const restoreTimezoneRequest = page.waitForRequest(request => new URL(request.url()).searchParams.get("timezone") === "America/Los_Angeles");
await page.evaluate(() => {
  localStorage.setItem("deeplog_custom_timezone", "America/Los_Angeles");
  window.dispatchEvent(new Event("deeplog-timezone-change"));
});
await restoreTimezoneRequest;
await page.waitForLoad();
checkBounds(nextFrom, nextTo);

// Selecting new calendar dates deliberately returns to whole-day filtering.
await page.click("#date");
await page.waitForSelector("[role=dialog]");
await page.evaluate(() => {
  const days = [...document.querySelectorAll("[role=dialog] button[data-day]")]
    .filter(button => !button.disabled && !button.closest("[data-outside=true]"));
  if (days.length < 2) throw new Error("Calendar days missing");
  days[0].click();
});
await page.waitForLoad();
await page.evaluate(() => {
  const days = [...document.querySelectorAll("[role=dialog] button[data-day]")]
    .filter(button => !button.disabled && !button.closest("[data-outside=true]"));
  days[1].click();
});
await page.waitForFunction(() => !document.querySelector("[data-testid=datetime-range]"));
await page.waitForLoad();
const calendarParams = new URL(page.url()).searchParams;
check(/^\d{4}-\d{2}-\d{2}$/.test(calendarParams.get("from")), "Calendar kept a datetime start");
check(/^\d{4}-\d{2}-\d{2}$/.test(calendarParams.get("to")), "Calendar kept a datetime end");
checkBounds(calendarParams.get("from"), calendarParams.get("to"));
check(calendarParams.get("keep") === "yes", "URL update dropped unrelated parameters");
check(writes === 0, "Viewing the range wrote time-entry data");
console.log("PASS: datetime URL/API precision, selected timezone, reload, pagination, resync, same-day navigation, back/forward, calendar reset, no writes");
await page.goto(url);
await page.waitForSelector("[data-testid=datetime-range]");
await page.waitForSelector("tr[data-entry-id='1']");
await page.shot({ type: "jpeg", maxEdge: 1280, quality: 75 });
console.log("Screenshot captured.");
