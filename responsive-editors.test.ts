// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExpandableDescription } from "./src/components/expandable-description";
import { DurationEditor } from "./src/components/duration-editor";
import { createRowEditorState, updateRowEditorState } from "./src/lib/row-editor-state";
import * as descriptionDrafts from "./src/contexts/description-drafts-context";
import type { Editor } from "@tiptap/react";

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

it("description: resumes the caret during its pending toast, then opens at the end after submission", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.useFakeTimers();
  let description = "An example description";
  let pending = false;
  const spy = vi.spyOn(descriptionDrafts, "useDescriptionDrafts").mockReturnValue({
    getDescription: () => description,
    hasPendingDescriptionToast: () => pending,
  } as unknown as NonNullable<ReturnType<typeof descriptionDrafts.useDescriptionDrafts>>);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const open = async () => {
    await React.act(async () => host.querySelector('[data-testid="description"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await React.act(async () => { vi.advanceTimersByTime(200); });
    return (host.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
  };
  const close = async () => {
    await React.act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  };
  const render = () => root.render(React.createElement(ExpandableDescription, {
      entryId: 1,
      description,
      "data-testid": "description",
      onSave: (text, notify) => { description = text; if (notify) pending = true; },
    }));
  try {
    await React.act(async () => render());
    const editor = await open();
    expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1);
    await React.act(async () => { editor.chain().setTextSelection(5).insertContent("X").run(); });
    await close();
    expect(pending).toBe(true);
    expect((await open()).state.selection.from).toBe(6);
    await close();
    pending = false;
    expect((await open()).state.selection.from).toBe(editor.state.doc.content.size - 1);
    await close();
    pending = true;
    description = "Externally replaced text";
    await React.act(async () => render());
    expect((await open()).state.selection.from).toBe(editor.state.doc.content.size - 1);
  } finally {
    await React.act(async () => root.unmount());
    await React.act(async () => { vi.runOnlyPendingTimers(); });
    spy.mockRestore();
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
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

it("description: completes only the item at the caret and keeps editing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "deeplog_description_items" ? JSON.stringify(["Review navigation", "Publish report"]) : null,
    setItem: vi.fn(),
  });
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onSave = vi.fn();
  const onRecentTimerSelect = vi.fn();
  try {
    await React.act(async () => root.render(React.createElement(ExpandableDescription, {
      description: "**Building** - Planning, Rev nav, Publish report",
      "data-testid": "completion-editor", onSave, onRecentTimerSelect,
    })));
    await React.act(async () => host.querySelector('[data-testid="completion-editor"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await React.act(async () => { vi.advanceTimersByTime(200); });
    const editor = (host.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
    await React.act(async () => { editor.commands.setTextSelection(editor.getText().indexOf("nav") + 3); });
    expect(document.body.textContent).toContain("Description items");
    expect(document.body.textContent).toContain("Review navigation");
    await React.act(async () => { editor.view.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
    expect(editor.getText()).toBe("Building - Planning, Review navigation, Publish report");
    expect(editor.getHTML()).toContain("<strong>Building</strong>");
    expect(host.querySelector(".tiptap")).not.toBeNull();
    expect(onRecentTimerSelect).not.toHaveBeenCalled();
    const savedItems = JSON.parse(vi.mocked(localStorage.setItem).mock.calls.find(([key]) => key === "deeplog_description_items")![1]);
    expect(savedItems).toContainEqual(expect.objectContaining({ description: "Review navigation", usageCount: 1 }));
    // A failed query should not prevent suggestions from reopening as typing continues.
    await React.act(async () => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); editor.commands.insertContent(", zzzzz"); });
    await React.act(async () => { editor.commands.deleteRange({ from: editor.state.selection.from - 5, to: editor.state.selection.from }); editor.commands.insertContent("Rev"); });
    const option = [...document.querySelectorAll(".font-medium.truncate")].find((element) => element.textContent === "Review navigation");
    expect(option).toBeDefined();
    await React.act(async () => { option!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(editor.getText()).toBe("Building - Planning, Review navigation, Publish report, Review navigation");
    expect(vi.mocked(localStorage.setItem).mock.calls.filter(([key]) => key === "deeplog_description_items")).toHaveLength(2);
    await React.act(async () => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    expect(onSave).toHaveBeenCalledWith("**Building** - Planning, Review navigation, Publish report, Review navigation", true, "**Building** - Planning, Rev nav, Publish report");
  } finally {
    await React.act(async () => root.unmount());
    await React.act(async () => { vi.runOnlyPendingTimers(); });
    host.remove();
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("description: uses the original recent timer selection before the first spaced hyphen", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const timer = { id: 1, description: "Building", projectId: 7, tagIds: [8], usageCount: 0 };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "deeplog_recent_timers" ? JSON.stringify([timer]) : JSON.stringify(["Review navigation"]),
    setItem: vi.fn(),
  });
  const scroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onRecentTimerSelect = vi.fn();
  try {
    await React.act(async () => root.render(React.createElement(ExpandableDescription, {
      description: "Build", "data-testid": "mode-editor", onRecentTimerSelect,
    })));
    await React.act(async () => host.querySelector('[data-testid="mode-editor"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await React.act(async () => { vi.advanceTimersByTime(200); });
    const editor = (host.querySelector(".tiptap") as HTMLElement & { editor: Editor }).editor;
    expect(document.body.textContent).toContain("Recent Timers");
    expect(document.body.textContent).not.toContain("Description items");
    await React.act(async () => { editor.commands.insertContent("ing - Rev"); });
    expect(document.body.textContent).toContain("Description items");
    await React.act(async () => { editor.commands.setContent("<p>Building -</p>", true); editor.commands.focus("end"); });
    await React.act(async () => { editor.view.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
    expect(editor.getText()).toBe("Building - Review navigation");
    expect(onRecentTimerSelect).not.toHaveBeenCalled();
    await React.act(async () => { editor.commands.setTextSelection(4); });
    expect(document.body.textContent).toContain("Recent Timers");
    await React.act(async () => { editor.commands.setContent("<p>Build</p>", true); });
    await React.act(async () => { editor.view.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
    expect(onRecentTimerSelect).toHaveBeenCalledWith({ description: "Building", projectId: 7, tagIds: [8], id: 1, usageCount: 0 });
    expect(host.querySelector(".tiptap")).toBeNull();
  } finally {
    await React.act(async () => root.unmount());
    await React.act(async () => { vi.runOnlyPendingTimers(); });
    host.remove();
    HTMLElement.prototype.scrollIntoView = scroll;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
