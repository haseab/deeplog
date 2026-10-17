"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bindingFromEvent, readShortcuts, shortcuts, SHORTCUT_STORAGE_KEY, type ShortcutOverrides } from "@/lib/keyboard-shortcuts";

export function KeyboardShortcutSettings() {
  const [overrides, setOverrides] = useState<ShortcutOverrides>({});
  const [recording, setRecording] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { setOverrides(readShortcuts()); }, []);
  const save = (next: ShortcutOverrides) => {
    try {
      localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(next));
      setOverrides(next);
      setError("");
      window.dispatchEvent(new Event("shortcuts-changed"));
      return true;
    } catch { setError("Could not save shortcuts. Check browser storage permissions."); return false; }
  };
  useEffect(() => {
    if (!recording) return;
    document.documentElement.setAttribute("data-shortcut-recording", "true");
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (["Meta", "Control", "Alt", "Shift"].includes(event.key) || event.isComposing) return;
      const binding = bindingFromEvent(event);
      const conflict = shortcuts.find(([id, , fallback]) => id !== recording && (overrides[id] ?? fallback) === binding);
      if (conflict) { setError(`Already used by “${conflict[1]}”. Change that shortcut first.`); return; }
      if (save({ ...overrides, [recording]: binding })) setRecording(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => {
      document.documentElement.removeAttribute("data-shortcut-recording");
      window.removeEventListener("keydown", capture, true);
    };
  }, [recording, overrides]);
  return <div className="space-y-5">
    <div><h3 className="text-xl font-semibold mb-1">Keyboard Shortcuts</h3>
      <p className="text-sm text-muted-foreground">Click a shortcut, then press a new key combination. Mod means Command on Mac or Ctrl on Windows. Changes save automatically in this browser.</p>
      <p className="text-sm text-muted-foreground mt-2">Shortcuts apply in their usual contexts. Navigation and editor keys are shared across the app.</p></div>
    <Input aria-label="Search keyboard shortcuts" placeholder="Search shortcuts…" value={query} onChange={event => setQuery(event.target.value)} />
    <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => { setRecording(null); save({}); }}>Reset all to defaults</Button>
      {recording && <Button variant="outline" size="sm" onClick={() => { setRecording(null); setError(""); }}>Cancel recording</Button>}</div>
    <p role="status" className="text-sm text-destructive">{error || (recording ? "Press your new shortcut, or click Cancel recording." : "")}</p>
    {Array.from(new Set(shortcuts.map(item => item[3]))).map(group => {
      const items = shortcuts.filter(item => item[3] === group && `${item[1]} ${item[2]}`.toLowerCase().includes(query.toLowerCase()));
      return items.length ? <section key={group} className="space-y-2"><h4 className="text-sm font-medium">{group}</h4><div className="rounded-lg border divide-y">{items.map(([id, label, fallback]) => <div key={id} className="flex items-center justify-between gap-3 p-3">
        <span className="text-sm">{label}</span><div className="flex items-center gap-2">
          <Button size="sm" variant="outline" aria-label={`Change shortcut: ${label}`} onClick={() => { setRecording(id); setError(""); }} className="min-w-20 font-mono">{recording === id ? "Press keys…" : (overrides[id] ?? fallback) || "Disabled"}</Button>
          <Button size="sm" variant="ghost" aria-label={`Disable shortcut: ${label}`} onClick={() => save({ ...overrides, [id]: "" })}>Clear</Button>
        </div></div>)}</div></section> : null;
    })}
  </div>;
}
