import test from "node:test";
import assert from "node:assert/strict";
import { createRowEditorState, updateRowEditorState, type RowEditorType } from "./row-editor-state";

function timeline() {
  const editors = createRowEditorState();
  const events: string[] = [];
  const notify = (type: RowEditorType, open: boolean, entryId = 1) => {
    const transition = updateRowEditorState(editors, entryId, type, open);
    if (!transition) return;
    transition.replacedEntryIds.forEach(id => events.push(`resume:${id}`));
    if (open) events.push(`pause:${entryId}`);
    else if (!transition.entryHasOpenEditor) events.push(`resume:${entryId}`);
  };
  return { editors, events, notify };
}

test("typing with a pending edit does not re-arm its toast when the closed duration control reports false", () => {
  const { editors, events, notify } = timeline();
  notify("description", true);
  // Inline callbacks change on every row render. Both controls re-report
  // state, including while the draft autosaves and the sync status changes.
  for (let render = 0; render < 100; render++) {
    notify("description", true);
    notify("duration", false);
    notify("project", false);
    notify("tags", false);
    notify("time", false);
  }
  assert.deepEqual(events, ["pause:1"]);
  assert.equal(editors.description.has(1), true);
  notify("description", false);
  notify("description", false);
  assert.deepEqual(events, ["pause:1", "resume:1"]);
});

test("a closed description control cannot release an open duration editor", () => {
  const { editors, events, notify } = timeline();
  notify("duration", true);
  for (let render = 0; render < 10; render++) {
    notify("description", false);
    notify("duration", true);
  }
  assert.equal(editors.duration.has(1), true);
  assert.deepEqual(events, ["pause:1"]);
  notify("duration", false);
  assert.deepEqual(events, ["pause:1", "resume:1"]);
});

test("same-row editor handoff stays paused until the last control closes", () => {
  for (const next of ["duration", "project", "tags", "time"] as const) {
    const { events, notify } = timeline();
    notify("description", true);
    notify(next, true);
    notify("description", true); // duplicate from a rerender during handoff
    notify("description", false);
    assert.deepEqual(events, ["pause:1", "pause:1"]);
    notify(next, false);
    assert.deepEqual(events, ["pause:1", "pause:1", "resume:1"]);
  }
});

test("moving rows releases an orphan once and ignores its later close notification", () => {
  const { editors, events, notify } = timeline();
  notify("description", true, 1);
  notify("project", true, 2);
  notify("project", true, 2);
  notify("description", false, 1);
  assert.equal(editors.description.size, 0);
  assert.equal(editors.project.has(2), true);
  assert.deepEqual(events, ["pause:1", "resume:1", "pause:2"]);
  notify("project", false, 2);
  assert.deepEqual(events, ["pause:1", "resume:1", "pause:2", "resume:2"]);
});

test("initial closed notifications have no toast side effects", () => {
  const { events, notify } = timeline();
  for (const type of ["description", "duration", "project", "tags", "time"] as const) {
    notify(type, false);
  }
  assert.deepEqual(events, []);
});
