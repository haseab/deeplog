import test from "node:test";
import assert from "node:assert/strict";
import { EntryMutations } from "./entry-mutations";

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("successor commits a deferred predecessor and waits for acknowledgement", async () => {
  const queue = new EntryMutations();
  const hold = gate();
  const events: string[] = [];
  const combine = queue.reserve([1, 2], async () => { events.push("combine"); await hold.promise; });
  const split = queue.run([1, -3], async () => { events.push("split"); });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["combine"]);
  assert.equal(combine.cancel(), false);
  hold.resolve();
  await split;
  assert.deepEqual(events, ["combine", "split"]);
});

test("a failed predecessor stops dependent writes while independent entries continue", async () => {
  const queue = new EntryMutations();
  const hold = gate();
  let dependent = false;
  queue.reserve([1, 2], async () => { await hold.promise; throw new Error("combine failed"); });
  const split = queue.run([1], async () => { dependent = true; });
  assert.equal(await queue.run([9], async () => 42), 42);
  hold.resolve();
  await assert.rejects(split, /combine failed/);
  assert.equal(dependent, false);
});

test("temporary and real identities share ordering through repeated splits", async () => {
  const queue = new EntryMutations();
  const hold = gate();
  const events: string[] = [];
  const split = queue.run([1, -2], async () => {
    queue.identify(-2, 20);
    await hold.promise;
    events.push("split");
  });
  await Promise.resolve();
  await Promise.resolve();
  const rename = queue.run([20], async () => { events.push("rename"); });
  const splitAgain = queue.run([-2, -3], async () => { events.push("split again"); });
  await Promise.resolve();
  assert.deepEqual(events, []);
  hold.resolve();
  await Promise.all([split, rename, splitAgain]);
  assert.deepEqual(events, ["split", "rename", "split again"]);
});

test("undo removes an unstarted reservation without issuing a write", async () => {
  const queue = new EntryMutations();
  let writes = 0;
  const combine = queue.reserve([1, 2], async () => { writes++; });
  assert.equal(combine.cancel(), true);
  await queue.run([1], async () => { writes++; });
  assert.equal(writes, 1);
});
