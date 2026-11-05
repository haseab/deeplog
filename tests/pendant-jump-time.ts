import assert from "node:assert/strict";
import { parsePendantJumpTimes } from "../src/lib/pendant-jump-time";

const viewedDay = new Date(2026, 9, 28, 16, 53, 20);
const now = new Date(2026, 10, 3, 18);
const parse = (query: string) => parsePendantJumpTimes(query, [viewedDay], now);
const clocks = (query: string) => parse(query).map((time) => [time.getHours(), time.getMinutes(), time.getSeconds()]);

for (const query of ["4:53 p.m.", "4:53PM", "at 4:53 pm", "16:53", "1653"]) {
  assert.deepEqual(clocks(query), [[16, 53, 0]], query);
  assert.equal(parse(query)[0].getDate(), 28, "clock-only input uses the viewed day");
  assert.equal(parse(query)[0].getMonth(), 9);
}
assert.deepEqual(clocks("4:53:22 p. m."), [[16, 53, 22]]);
assert.deepEqual(clocks("4:53"), [[4, 53, 0], [16, 53, 0]]);
assert.deepEqual(clocks("04:53"), [[4, 53, 0]]);
assert.deepEqual(clocks("12:05"), [[12, 5, 0], [0, 5, 0]]);
assert.deepEqual(clocks("12 am"), [[0, 0, 0]]);
assert.deepEqual(clocks("12 pm"), [[12, 0, 0]]);
assert.deepEqual(clocks("noon"), [[12, 0, 0]]);
assert.deepEqual(clocks("midnight"), [[0, 0, 0]]);
for (const query of ["", "nonsense", "25:00", "4:99 pm", "13pm", "0am", "4:53:99", "today"]) {
  assert.deepEqual(parse(query), [], query);
}
assert.equal(parse("15 minutes ago")[0].getTime(), now.getTime() - 15 * 60_000);
assert.equal(parse("yesterday at noon")[0].getDate(), 2);
assert.equal(parse("October 27, 2026 at 4:53 pm")[0].getDate(), 27);
assert.equal(parse("October 27, 2026 at 4:53 pm")[0].getHours(), 16);
const days = parsePendantJumpTimes("4:53 p.m.", [viewedDay, viewedDay, new Date(2026, 9, 27)], now);
assert.deepEqual(days.map((time) => time.getDate()), [28, 27]);
console.log("Pendant jump parsing passed: clock formats, viewed dates, ambiguity, relative times, and invalid input.");
