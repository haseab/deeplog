import assert from 'node:assert/strict';
import { bindingFromEvent, installShortcutBindings, SHORTCUT_STORAGE_KEY } from '../src/lib/keyboard-shortcuts';
const storage = new Map<string, string>();
const rootAttributes = new Set<string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null },
  window: new EventTarget(),
  document: { documentElement: { hasAttribute: (key: string) => rootAttributes.has(key) } },
});
function key(key: string, options: Record<string, unknown> = {}) {
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, ...options });
  return event as KeyboardEvent;
}
assert.equal(bindingFromEvent(key('ç', { code: 'KeyC', altKey: true })), 'Alt+c');
storage.set(SHORTCUT_STORAGE_KEY, JSON.stringify({ combine: 'Mod+g', stop: '' }));
const cleanup = installShortcutBindings();
const custom = key('g', { ctrlKey: true });
window.dispatchEvent(custom);
assert.equal(custom.key, 'c');
assert.equal(custom.ctrlKey, false);
assert.equal(custom.code, 'KeyC');
const previous = key('c');
window.dispatchEvent(previous);
assert.equal(previous.defaultPrevented, true);
const disabled = key('s', { altKey: true });
window.dispatchEvent(disabled);
assert.equal(disabled.defaultPrevented, true);
rootAttributes.add('data-settings-open');
const settingsKey = key('g', { ctrlKey: true });
window.dispatchEvent(settingsKey);
assert.equal(settingsKey.key, 'g');
rootAttributes.clear();
storage.set(SHORTCUT_STORAGE_KEY, '{}');
window.dispatchEvent(new Event('shortcuts-changed'));
const restored = key('c');
window.dispatchEvent(restored);
assert.equal(restored.defaultPrevented, false);
cleanup();
console.log('Keyboard shortcut normalization, disabling, reset, and settings isolation passed.');
