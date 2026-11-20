import test from "node:test";
import assert from "node:assert/strict";
import { TogglSessionBudget } from "./toggl-request-budget";

test("eight requests burst immediately, then three tokens refill per second", () => {
  const budget = new TogglSessionBudget(0);
  for (let i = 0; i < 8; i++) assert.equal(budget.take(0), 0);
  assert.equal(budget.take(0), 334);
  // Checking a blocked budget must not consume a future token.
  assert.equal(budget.take(100), 234);
  assert.equal(budget.take(334), 0);
  assert.equal(budget.take(334), 333);
  assert.equal(budget.take(1000), 0);
  assert.equal(budget.take(1000), 0);
  assert.equal(budget.take(1000), 334);
});

test("idle refill caps at eight; backward clock movement grants no tokens", () => {
  const budget = new TogglSessionBudget(1000);
  for (let i = 0; i < 8; i++) assert.equal(budget.take(1000), 0);
  assert.equal(budget.take(0), 334);
  for (let i = 0; i < 8; i++) assert.equal(budget.take(100_000), 0);
  assert.equal(budget.take(100_000), 334);
});

test("throttling drains the burst allowance and refill begins from empty", () => {
  const budget = new TogglSessionBudget(0);
  budget.take(0);
  budget.drain(100);
  assert.equal(budget.take(100), 334);
  assert.equal(budget.take(434), 0);
  assert.equal(budget.take(434), 333);
});
