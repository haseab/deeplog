// Exercise the actual capture handler without opening an external desktop app.
// Run with: node tests/retrace-shortcut.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/time-tracker-table.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('table.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(file) === 'React.useEffect' &&
      node.arguments[0]?.getText(file).includes('const handleRetraceKeyDown')) {
    effect = node.getText(file);
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(effect, 'Find the Retrace keyboard effect');
const script = ts.transpile(effect);

for (const apiKey of [null, 'configured-key']) {
  for (const modifier of ['metaKey', 'ctrlKey']) {
    for (const focus of ['cell', 'time-input', 'description', 'duration-input', 'project-selector', 'actions-menu', 'other-input', 'other-dialog']) {
      const entry = { start: '2026-11-13T21:50:00.000Z' };
      let prevented = false;
      let stopped = false;
      let handler;
      let cleanup;
      const location = { href: '' };
      const unrelated = focus.startsWith('other-');
      const document = {
        documentElement: { hasAttribute: () => false },
        addEventListener: (name, callback, capture) => {
          assert.equal(name, 'keydown');
          assert.equal(capture, true, 'Handle before row editors consume keydown');
          handler = callback;
        },
        removeEventListener: (name, callback, capture) => {
          assert.equal(name, 'keydown');
          assert.equal(callback, handler);
          assert.equal(capture, true);
        },
      };
      vm.runInNewContext(script, {
        React: { useEffect: callback => { cleanup = callback(); } }, document,
        localStorage: { getItem: () => apiKey }, window: { location },
        selectedCell: { rowIndex: 1, cellIndex: 5 },
        // A stale row index must not override the selected entry's identity.
        decryptedEntries: [{ start: '2000-01-01T00:00:00Z' }],
        getSelectedCellEntry: () => entry,
        isEditingCell: true, isTimeEditorOpen: true, isActionsMenuOpen: true,
      });
      handler({
        key: 'P', code: 'KeyP', metaKey: false, ctrlKey: false, altKey: false,
        shiftKey: true, [modifier]: true,
        target: { closest: selector => selector.includes('[data-entry-id]') ? !unrelated : unrelated },
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; },
      });
      assert.equal(location.href, unrelated ? '' : `retracedev://timeline?t=${Date.parse(entry.start)}`, focus);
      assert.equal(prevented, !unrelated, focus);
      assert.equal(stopped, !unrelated, focus);
      cleanup();
    }
  }
}
console.log('PASS: Retrace captures Command/Control+Shift+P across row editors and menus, independently of Limitless, and leaves unrelated inputs/dialogs alone.');
