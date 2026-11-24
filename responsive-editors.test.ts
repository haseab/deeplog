// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExpandableDescription } from "./src/components/expandable-description";
import { DurationEditor } from "./src/components/duration-editor";
import { createRowEditorState, updateRowEditorState } from "./src/lib/row-editor-state";

vi.mock("./src/lib/toast-diagnostics", () => ({ recordToastDiagnostic: vi.fn() }));

// jsdom has no range layout; TipTap's focus command asks for these browser APIs.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterAll(() => {
  Reflect.deleteProperty(Range.prototype, "getClientRects");
  Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
});

for (const kind of ["description", "duration"] as const) {
  it(`${kind}: a mounted hidden sibling cannot restart the active editor's pending toast`, async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const editors = createRowEditorState();
    const resumed = vi.fn();
    const paused = vi.fn();
    const owners = new Set<string>();
    const render = (mobile = true) => root.render(
      React.createElement(React.Fragment, null, ...["desktop", ...(mobile ? ["mobile"] : [])].map(layout => {
        const onEditingChange = (open: boolean, instance: string) => {
          owners.add(instance);
          const transition = updateRowEditorState(editors, 1, kind, open, instance);
          if (!transition) return;
          if (open) paused();
          else if (!transition.entryHasOpenEditor) resumed();
        };
        const child = kind === "description"
          ? React.createElement(ExpandableDescription, { entryId: 1, description: "Example description", onEditingChange, "data-testid": layout })
          : React.createElement(DurationEditor, { duration: 60, startTime: "2026-01-01T12:00:00Z", endTime: "2026-01-01T12:01:00Z", onEditingChange, "data-testid": layout });
        return React.createElement("div", { key: layout, style: { display: layout === "mobile" ? "none" : "block" } }, child);
      })),
    );
    try {
      await React.act(async () => render());
      expect(owners.size).toBe(2);
      await React.act(async () => host.querySelector('[data-testid="desktop"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await React.act(async () => { vi.advanceTimersByTime(200); });
      expect(editors[kind].has(1)).toBe(true);
      expect(paused).toHaveBeenCalledTimes(1);
      // New inline callbacks make BOTH responsive instances report again.
      for (let renderNumber = 0; renderNumber < 10; renderNumber++) await React.act(async () => render());
      expect(resumed).not.toHaveBeenCalled();
      expect(editors[kind].has(1)).toBe(true);
      await React.act(async () => render(false));
      expect(resumed).not.toHaveBeenCalled();
      expect(editors[kind].has(1)).toBe(true);
    } finally {
      await React.act(async () => root.unmount());
      await React.act(async () => { vi.runOnlyPendingTimers(); });
      host.remove();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(editors[kind].size).toBe(0);
  });
}
