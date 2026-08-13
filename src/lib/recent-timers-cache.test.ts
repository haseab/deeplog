import assert from "node:assert/strict";
import test from "node:test";
import { getRecentTimerDescription } from "./recent-timers-cache";

test("preserves hyphens inside words and channel names", () => {
  assert.equal(
    getRecentTimerDescription(
      "Posting - #core-team - finc - about new portfolio kickoff"
    ),
    "Posting - #core-team - finc - about new portfolio kickoff"
  );
});

test("still truncates at the first standalone segment over the limit", () => {
  assert.equal(
    getRecentTimerDescription(
      "Building - Feature: Instant Submit - deeplog - I got so tired of needing to wait like five seconds for this very long explanation"
    ),
    "Building - Feature: Instant Submit - deeplog"
  );
});

test("does not treat compact dashes as list separators", () => {
  assert.equal(
    getRecentTimerDescription("pre-launch-post-mortem"),
    "pre-launch-post-mortem"
  );
});
