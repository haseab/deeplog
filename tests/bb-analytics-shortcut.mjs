// Run with node tests/bb-analytics-shortcut.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source = readFileSync(
  new URL("../src/components/time-tracker-table.tsx", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "table.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let effect;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(file) === "React.useEffect" &&
    node.arguments[0]?.getText(file).includes("const handleAnalyticsKeyDown")
  )
    effect = node.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(effect);
for (const focus of ["cell", "row-editor", "unrelated-input", "unrelated-dialog"])
  for (const key of ["∏", "P"]) {
    let handler, cleanup;
    const calls = [];
    let prevented = false;
    const entry = { start: "2026-01-01T01:00:00Z", stop: "2026-01-01T01:30:00Z" };
    const document = {
      documentElement: { hasAttribute: () => false },
      addEventListener: (name, fn, capture) => {
        assert.equal(capture, true);
        handler = fn;
      },
      removeEventListener: (name, fn, capture) => {
        assert.equal(fn, handler);
        assert.equal(capture, true);
      },
    };
    vm.runInNewContext(ts.transpile(effect), {
      React: {
        useEffect: (fn) => {
          cleanup = fn();
        },
      },
      document,
      selectedCell: { rowIndex: 99 },
      getSelectedCellEntry: () => entry,
      openBbAnalytics: async (e) => calls.push(e),
      toast: { error: () => assert.fail("should open") },
    });
    const event = {
      key,
      code: "KeyP",
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: true,
      defaultPrevented: false,
      isComposing: false,
      repeat: false,
      target: {
        closest: (selector) =>
          selector.includes("[data-entry-id]")
            ? !focus.startsWith("unrelated")
            : focus.startsWith("unrelated"),
      },
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {},
    };
    handler(event);
    assert.equal(calls.length, focus.startsWith("unrelated") ? 0 : 1);
    assert.equal(prevented, !focus.startsWith("unrelated"));
    if (calls.length) assert.equal(calls[0], entry);
    handler({ ...event, shiftKey: false });
    handler({ ...event, ctrlKey: false });
    handler({ ...event, altKey: false });
    handler({ ...event, repeat: true });
    assert.equal(calls.length, focus.startsWith("unrelated") ? 0 : 1);
    cleanup();
  }
console.log(
  "PASS: Ctrl+Shift+Option+P resolves the selected entry across row editors, supports macOS Option characters, and ignores unrelated inputs and other modifiers.",
);
