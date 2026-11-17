import test from "node:test";
import assert from "node:assert/strict";
import { TimelineSnapshots, timelinePage } from "./timeline-snapshots";
const data = { timeEntries: [1, 2, 3], projects: [], tags: [], profileTimeZone: "UTC", displayTimeZone: "UTC" };

test("range snapshots are credential scoped, expire and cannot be republished across writes", t => {
  let now = 100;
  t.mock.method(Date, "now", () => now);
  const cache = new TimelineSnapshots(10, 2);
  const id = cache.put("account-a", "range", data, cache.generation())!;
  assert.equal(cache.get(id, "account-b", "range"), undefined);
  assert.equal(cache.get(id, "account-a", "different-range"), undefined);
  assert.equal(cache.get(id, "account-a", "range"), data);
  assert.deepEqual(timelinePage(data, 1, 2, id).timeEntries, [3]);
  const epoch = cache.generation();
  cache.invalidate("account-a");
  assert.equal(cache.get(id, "account-a", "range"), undefined);
  assert.equal(cache.put("account-a", "range", data, epoch), undefined);
  const newer = cache.put("account-a", "range", data, cache.generation())!;
  now += 11;
  assert.equal(cache.get(newer, "account-a", "range"), undefined);
});

test("snapshot eviction is bounded and invalidation preserves other accounts", () => {
  const cache = new TimelineSnapshots(1000, 2);
  const a = cache.put("a", "range", data, cache.generation())!;
  const b = cache.put("b", "range", data, cache.generation())!;
  cache.put("b", "other", data, cache.generation());
  assert.equal(cache.get(a, "a", "range"), undefined);
  cache.invalidate("a");
  assert.equal(cache.get(b, "b", "range"), data);
});
