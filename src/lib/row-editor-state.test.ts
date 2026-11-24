import test from "node:test";
import assert from "node:assert/strict";
import { createRowEditorState, updateRowEditorState, remapRowEditorEntry, type RowEditorType } from "./row-editor-state";

function timeline() {
  const editors = createRowEditorState();
  const events: string[] = [];
  const notify = (type: RowEditorType, open: boolean, entryId = 1, instanceId?: string) => {
    const transition = updateRowEditorState(editors, entryId, type, open, instanceId);
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

test("a hidden responsive sibling never closes the active instance or re-arms its toast", () => {
  for (const type of ["description", "duration", "project", "tags", "time"] as const) {
    const { editors, events, notify } = timeline();
    notify(type, true, 1, "desktop");
    for (let render = 0; render < 100; render++) {
      notify(type, false, 1, "mobile");
      notify(type, true, 1, "desktop");
    }
    // The hidden control's unmount also reports false.
    notify(type, false, 1, "mobile");
    assert.equal(editors[type].has(1), true);
    assert.deepEqual(events, ["pause:1"]);
    notify(type, false, 1, "desktop");
    assert.deepEqual(events, ["pause:1", "resume:1"]);
  }
});

test("same-type instance handoff resumes only when the last owner closes", () => {
  const { events, notify } = timeline();
  notify("description", true, 1, "desktop");
  notify("description", true, 1, "mobile");
  notify("description", false, 1, "desktop");
  assert.deepEqual(events, ["pause:1"]);
  notify("description", false, 1, "mobile");
  notify("description", false, 1, "mobile");
  assert.deepEqual(events, ["pause:1", "resume:1"]);
});

test("replaced rows ignore stale instance closures, and cleared registrations can reopen", () => {
  const { editors, events, notify } = timeline();
  notify("description", true, 1, "desktop");
  notify("description", true, 2, "mobile");
  notify("description", false, 1, "desktop");
  assert.deepEqual(events, ["pause:1", "resume:1", "pause:2"]);
  Object.values(editors).forEach(active => active.clear());
  notify("description", true, 2, "mobile");
  assert.equal(editors.description.has(2), true);
});

test("temporary entry reconciliation preserves every instance and merges existing owners", () => {
  const editors = createRowEditorState();
  updateRowEditorState(editors, -1, "description", true, "desktop");
  updateRowEditorState(editors, -1, "description", true, "mobile");
  editors.description.set(2, new Set(["another-owner"]));
  remapRowEditorEntry(editors, -1, 2);
  assert.equal(editors.description.has(-1), false);
  assert.equal(updateRowEditorState(editors, 2, "description", false, "desktop"), null);
  assert.equal(updateRowEditorState(editors, 2, "description", false, "mobile"), null);
  assert.equal(updateRowEditorState(editors, 2, "description", false, "another-owner")?.entryHasOpenEditor, false);
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
