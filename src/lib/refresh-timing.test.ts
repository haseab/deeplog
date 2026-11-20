import test from "node:test";
import assert from "node:assert/strict";
import { parseRefreshTiming } from "./refresh-timing-data";
import { startRefreshTiming, reportRefreshTiming, finishRefreshAfterPaint } from "./refresh-timing";

test("timing reports accept only finite content-free metadata", () => {
  const value = { requestId: crypto.randomUUID(), outcome: "paint-opportunity", totalMs: 3500, visible: true };
  assert.deepEqual(parseRefreshTiming(value), value);
  for (const extra of [{ description: "private" }, { token: "secret" }, { totalMs: NaN }, { totalMs: -1 }, { status: 1000 }, { requestId: "not-a-uuid" }]) {
    assert.equal(parseRefreshTiming({ ...value, ...extra }), null);
  }
});

test("client reports once after two frames; telemetry rejection cannot fail a refresh", async t => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const keys = ["document", "requestAnimationFrame", "cancelAnimationFrame"];
  const old = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const frames: FrameRequestCallback[] = [];
  const calls: string[] = [];
  try {
    globals.document = { visibilityState: "visible" };
    globals.requestAnimationFrame = (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; };
    globals.cancelAnimationFrame = () => {};
    t.mock.method(console, "info", () => {});
    t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
      calls.push(String(init?.body));
      throw new Error("telemetry offline");
    });
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const sample = startRefreshTiming();
    sample.response = performance.now(); sample.decoded = performance.now();
    finishRefreshAfterPaint(sample);
    assert.equal(calls.length, 0);
    frames.shift()!(0); assert.equal(calls.length, 0);
    frames.shift()!(0); assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0]).outcome, "paint-opportunity");
    reportRefreshTiming(sample, "failed"); assert.equal(calls.length, 1);
    finishRefreshAfterPaint(startRefreshTiming());
    t.mock.timers.tick(5000);
    assert.equal(JSON.parse(calls[1]).outcome, "paint-timeout");
    globals.document = { visibilityState: "hidden" };
    finishRefreshAfterPaint(startRefreshTiming());
    assert.equal(JSON.parse(calls[2]).outcome, "hidden");
    await Promise.resolve();
  } finally {
    keys.forEach((key, index) => {
      if (old[index]) Object.defineProperty(globalThis, key, old[index]!);
      else delete globals[key];
    });
  }
});
