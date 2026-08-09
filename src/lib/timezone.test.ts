import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarRangeToUtc,
  formatDateInTimeZone,
  intervalsOverlap,
  wallTimeToUtc,
  wallTimeToUtcCandidates,
} from "./timezone";
import { transformAnalyticsData } from "../app/api/time-entries/session-utils";

test("calendar ranges use the selected date's DST offset", () => {
  const winter = calendarRangeToUtc("2026-01-10", "2026-01-10", "America/Los_Angeles");
  assert.equal(winter?.start.toISOString(), "2026-01-10T08:00:00.000Z");
  assert.equal(winter?.endExclusive.toISOString(), "2026-01-11T08:00:00.000Z");

  const summer = calendarRangeToUtc("2026-07-10", "2026-07-10", "America/Los_Angeles");
  assert.equal(summer?.start.toISOString(), "2026-07-10T07:00:00.000Z");
  assert.equal(summer?.endExclusive.toISOString(), "2026-07-11T07:00:00.000Z");
});

test("spring-forward gaps are rejected", () => {
  assert.equal(
    wallTimeToUtc("2026-03-08", "02:30:00", "America/Los_Angeles", "earlier"),
    null
  );
});

test("fall-back times expose both occurrences", () => {
  const candidates = wallTimeToUtcCandidates(
    "2026-11-01",
    "01:30:00",
    "America/Los_Angeles"
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.toISOString()),
    ["2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z"]
  );
});

test("the same instant renders on the correct calendar date while traveling", () => {
  const instant = "2026-08-02T06:30:00.000Z";
  assert.equal(formatDateInTimeZone(instant, "America/Los_Angeles"), "2026-08-01");
  assert.equal(formatDateInTimeZone(instant, "Asia/Tokyo"), "2026-08-02");
});

test("running entries that began before a range are included when they overlap", () => {
  assert.equal(
    intervalsOverlap(
      "2026-08-01T23:00:00.000Z",
      null,
      new Date("2026-08-02T00:00:00.000Z"),
      new Date("2026-08-03T00:00:00.000Z")
    ),
    true
  );
});

test("Analytics rows become canonical UTC timestamps and duration determines stop", () => {
  const entries = transformAnalyticsData(
    {
      data_table: [
        ["time_entry_id", "description", "start_date", "start_time", "stop_time", "duration", "project_id", "tag_ids"],
        [1, "DST work", "2026-11-01", "01:30:00", "01:45:00", 4_500_000, null, []],
      ],
    },
    "America/Los_Angeles"
  );

  assert.equal(entries[0].start, "2026-11-01T08:30:00.000Z");
  assert.equal(entries[0].stop, "2026-11-01T09:45:00.000Z");
  assert.equal(entries[0]._timezoneAmbiguous, false);
});
