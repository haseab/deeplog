export const SHORTCUT_STORAGE_KEY = "deeplog_keyboard_shortcuts";
export const shortcuts = [
  ["settings", "Open settings", "Mod+Shift+,", "Application"],
  ["new-timer", "New timer / show pinned timers", "n", "Time entries"],
  ["new-entry", "New stopped entry", "e", "Time entries"],
  ["refresh", "Refresh entries", "r", "Application"],
  ["fullscreen", "Toggle fullscreen", "f", "Application"],
  ["reset-range", "Reset date range", "Mod+Alt+r", "Application"],
  ["delete", "Delete selected entries", "d", "Time entries"],
  ["delete-direct", "Delete selected entries (alternate)", "Mod+Backspace", "Time entries"],
  ["split", "Split entry", "x", "Time entries"],
  ["combine", "Combine into older row", "c", "Time entries"],
  ["combine-reverse", "Combine into newer row", "Alt+c", "Time entries"],
  ["start", "Copy and start timer", "s", "Time entries"],
  ["stop", "Stop timer", "Alt+s", "Time entries"],
  ["pin", "Pin entry / set project for selection", "p", "Time entries"],
  ["tag", "Tag selected entries", "t", "Time entries"],
  ["select-all", "Select all entries", "Shift+a", "Navigation"],
  ["undo", "Undo", "Mod+z", "Application"],
  ["summary", "Generate recall summary", "Alt+p", "Time entries"],
  ["pendant", "Open Pendant for entry", "Mod+p", "Time entries"],
  ["retrace", "Open Retrace for entry", "Mod+Shift+p", "Time entries"],
  ["refocus", "Focus a visible row", "Mod+.", "Navigation"],
  ["jump", "Jump to time / insert link", "Mod+k", "Editors"],
  ["unlink", "Remove link", "Mod+Shift+k", "Editors"],
  ["reset-ranking", "Reset recent timer ranking", "Mod+d", "Editors"],
  ["submit", "Save editor / confirm toast action", "Mod+Enter", "Editors"],
  ...["j", "k", "l", ";"].map((key, i) => [`vim-${i}`, ["Move down", "Move up", "Move left", "Move right"][i] + " (alternate)", key, "Navigation"]),
  ...["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", "Escape", "Tab", "Shift+Tab", "Space"].map(key => [`key-${key}`, ({ Enter: "Edit / confirm", Escape: "Cancel / close", Space: "Show recent timers" } as Record<string, string>)[key] || key, key, "Navigation"]),
  ...["ArrowDown", "ArrowUp", "j", "k"].map(key => [`select-${key}`, `Extend selection (${key})`, `Shift+${key}`, "Navigation"]),
  ...["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].map(key => [`adjust-${key}`, `Adjust time (${key})`, `Mod+${key}`, "Editors"]),
  ...["ArrowLeft", "ArrowRight"].map(key => [`snap-${key}`, `Snap time boundary (${key})`, `Mod+Shift+${key}`, "Editors"]),
  ...Array.from({ length: 6 }, (_, i) => [`column-${i+1}`, `Jump to column ${i+1}`, `Alt+${i+1}`, "Navigation"]),
] as const;
export type ShortcutOverrides = Record<string, string>;

export function readShortcuts(): ShortcutOverrides {
  try {
    const value = JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(shortcuts.filter(([id]) => typeof value[id] === "string").map(([id]) => [id, value[id]]));
  } catch { return {}; }
}

export function bindingFromEvent(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string {
  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === "Comma") key = ",";
  else if (e.code === "Period") key = ".";
  else if (e.code === "Semicolon") key = ";";
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toLowerCase();
  return [...(e.metaKey || e.ctrlKey ? ["Mod"] : []), ...(e.altKey ? ["Alt"] : []), ...(e.shiftKey ? ["Shift"] : []), key].join("+");
}

// Normalize at window capture so React editors and document listeners use the
// same binding, while preserving the original event target and cancellation.
export function installShortcutBindings() {
  let overrides = readShortcuts();
  const reload = () => { overrides = readShortcuts(); };
  const handle = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented || document.documentElement.hasAttribute("data-shortcut-recording")) return;
    if (document.documentElement.hasAttribute("data-settings-open")) return;
    const pressed = bindingFromEvent(event);
    const target = event.target as HTMLElement | null;
    const typing = !!target?.closest?.('input, textarea, [contenteditable="true"], [role="textbox"]');
    const match = shortcuts.find(([id, , fallback]) => (overrides[id] ?? fallback) === pressed);
    const original = shortcuts.find(([, , fallback]) => fallback === pressed);
    // Plain letters in text fields always retain their normal text behavior.
    if (typing && !event.metaKey && !event.ctrlKey && !event.altKey && pressed.length === 1) return;
    if (match) {
      const fallback = match[2];
      if (fallback === pressed) return;
      if (typing && !fallback.includes("+") && fallback.length === 1) return;
      const parts = fallback.split("+");
      const key = parts.pop()!;
      const mod = parts.includes("Mod");
      const normalizedKey = key === "Space" ? " " : key;
      const code = /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : ({ ",": "Comma", ".": "Period", ";": "Semicolon", Space: "Space" } as Record<string, string>)[key] || key;
      for (const [property, value] of Object.entries({ key: normalizedKey, code, metaKey: mod && event.metaKey, ctrlKey: mod && !event.metaKey, altKey: parts.includes("Alt"), shiftKey: parts.includes("Shift") })) {
        Object.defineProperty(event, property, { configurable: true, value });
      }
    } else if (original && overrides[original[0]] !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", handle, true);
  window.addEventListener("storage", reload);
  window.addEventListener("shortcuts-changed", reload);
  return () => {
    window.removeEventListener("keydown", handle, true);
    window.removeEventListener("storage", reload);
    window.removeEventListener("shortcuts-changed", reload);
  };
}
