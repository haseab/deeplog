import assert from "node:assert/strict";
import test from "node:test";
import { parseTimeEntryRange } from "./time-entry-range";

function instants(from: string, to: string, timeZone = "America/Los_Angeles") {
  const range = parseTimeEntryRange(from, to, timeZone);
  assert.ok(range);
  return [range.start.toISOString(), range.endExclusive.toISOString()];
}

test("date-only links still include the entire last day, including DST changes", () => {
  assert.deepEqual(instants("2026-11-01", "2026-11-01"), [
    "2026-11-01T07:00:00.000Z", "2026-11-02T08:00:00.000Z",
  ]);
  assert.deepEqual(instants("2026-03-08", "2026-03-08"), [
    "2026-03-08T08:00:00.000Z", "2026-03-09T07:00:00.000Z",
  ]);
});

test("local datetimes use the selected timezone and preserve minute, second and millisecond precision", () => {
  assert.deepEqual(instants("2026-11-01T14:30", "2026-11-02T10:00:01.123"), [
    "2026-11-01T22:30:00.000Z", "2026-11-02T18:00:01.123Z",
  ]);
  assert.deepEqual(instants("2026-11-01T14:30", "2026-11-02T10:00:01.1", "Asia/Tokyo"), [
    "2026-11-01T05:30:00.000Z", "2026-11-02T01:00:01.100Z",
  ]);
});

test("UTC and explicit offsets represent the same instants in every display timezone", () => {
  for (const zone of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
    assert.deepEqual(instants("2026-11-01T14:30Z", "2026-11-01T20:30:01.123+05:30", zone), [
      "2026-11-01T14:30:00.000Z", "2026-11-01T15:00:01.123Z",
    ]);
    assert.deepEqual(instants("2026-11-01T01:30:00-07:00", "2026-11-01T01:30:00-08:00", zone), [
      "2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z",
    ]);
  }
});

test("mixed date and datetime bounds retain the precision of each boundary", () => {
  assert.deepEqual(instants("2026-11-01T14:30", "2026-11-01"), [
    "2026-11-01T22:30:00.000Z", "2026-11-02T08:00:00.000Z",
  ]);
  assert.deepEqual(instants("2026-11-01", "2026-11-01T14:30"), [
    "2026-11-01T07:00:00.000Z", "2026-11-01T22:30:00.000Z",
  ]);
});

test("invalid dates, local DST gaps and repeats, missing and nonpositive ranges are rejected", () => {
  for (const [from, to] of [
    [null, "2026-11-01"], ["2026-11-01", null],
    ["2026-11-02", "2026-11-01"],
    ["2026-11-01T10:00", "2026-11-01T10:00"],
    ["2026-11-01T11:00", "2026-11-01T10:00"],
    ["2026-02-30", "2026-03-01"],
    ["2026-02-30T10:00Z", "2026-03-01T11:00Z"],
    ["2026-11-01T25:00Z", "2026-11-02T11:00Z"],
    ["2026-11-01T10:60", "2026-11-02T11:00"],
    ["2026-11-01T10:00+24:00", "2026-11-02T11:00Z"],
    ["2026-11-01T10:00+05:60", "2026-11-02T11:00Z"],
    ["2026-11-01T10:00 extra", "2026-11-02T11:00"],
    ["2026-11-01T01:30", "2026-11-01T02:30"],
    ["2026-03-08T02:30", "2026-03-08T03:30"],
    ["2026-11-01", "2026-11-01T01:30"],
  ]) {
    assert.equal(parseTimeEntryRange(from, to, "America/Los_Angeles"), null, `${from} → ${to}`);
  }
  assert.equal(parseTimeEntryRange("2026-11-01", "2026-11-02", "invalid-zone"), null);
});
