// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, expect, it, vi } from "vitest";
import { EntrySearchControls } from "./src/components/entry-search-controls";
import { SearchBulkEditDialog } from "./src/components/search-bulk-edit-dialog";
import { ActionsMenu } from "./src/components/actions-menu";
import { EntryViewContext } from "./src/components/entry-view-context";
import type { TimeEntry } from "./src/types";

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

it("builds advanced text rules, validates incomplete rules, and submits OR criteria", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), submit = vi.fn();
  const click = async (element: Element) => React.act(async () => { (element as HTMLElement).click(); });
  const type = async (selector: string, value: string) => React.act(async () => {
    const input = document.querySelector<HTMLInputElement>(selector)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  try {
    await React.act(async () => root.render(React.createElement(EntrySearchControls, {
      initial: { text: "", match: "phrase", projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" },
      projects: [], tags: [], busy: false, encrypted: false, compact: true, onSearch: submit,
    })));
    await click(host.querySelector('[aria-label="Description matching"]')!);
    await click([...document.querySelectorAll("button")].find(button => button.textContent?.includes("Does not contain"))!);
    await type('[aria-label="Search descriptions"]', "Review");
    // Let the matching menu finish restoring input focus before opening another popover.
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    await click(host.querySelector('[aria-label="Advanced search rules"]')!);
    await click([...document.querySelectorAll("button")].find(button => button.textContent?.includes("Add description rule"))!);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await type('[aria-label="Description rule 1 text"]', "Planning");
    const combine = document.querySelector('[aria-label="Combine search criteria"]')!;
    await React.act(async () => combine.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await click([...document.querySelectorAll('[role="option"]')].find(option => option.textContent === "Match any criterion (OR)")!);
    await React.act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: "Review", match: "not-contains", combine: "or", conditions: [{ match: "phrase", text: "Planning" }] }));
    await click(host.querySelector('[aria-label="Description matching"]')!);
    await click([...document.querySelectorAll("button")].find(button => button.textContent === "Is empty")!);
    expect(host.querySelector<HTMLInputElement>('[aria-label="Search descriptions"]')!.disabled).toBe(true);
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    await click(host.querySelector('[aria-label="Advanced search rules"]')!);
    await click(document.querySelector('[aria-label="Remove description rule 1"]')!);
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("submits date-only searches with multi-project and all-tag criteria", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), submit = vi.fn();
  try {
    await React.act(async () => root.render(React.createElement(EntrySearchControls, {
      initial: { text: "", match: "phrase", projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" },
      projects: [{ id: 2, name: "Example project", color: "#123456" }], tags: [{ id: 3, name: "Example tag" }], busy: false, encrypted: false, onSearch: submit,
    })));
    const click = async (element: Element) => React.act(async () => { (element as HTMLElement).focus(); (element as HTMLElement).click(); });
    const closeFilter = async () => {
      await React.act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      // Radix restores trigger focus in a timer after the portal unmounts.
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    };
    await click(host.querySelector('[aria-label="Filter projects"]')!);
    await click(document.querySelectorAll('input[type="checkbox"]')[1]);
    await closeFilter();
    await click(host.querySelector('[aria-label="Filter tags"]')!);
    await click(document.querySelector('input[type="checkbox"]')!);
    await closeFilter();
    await click(host.querySelector('[aria-label="Search date range"]')!);
    await click([...document.querySelectorAll("button")].find(button => button.textContent === "Last 7 days")!);
    await React.act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith({ text: "", match: "phrase", projects: ["2"], tags: ["3"], from: "2026-01-25", to: "2026-01-31" });
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("keeps the search field and filters together inline, with a separate date picker", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), submit = vi.fn();
  try {
    await React.act(async () => root.render(React.createElement(EntrySearchControls, {
      initial: { text: "Planning", match: "phrase", projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" },
      projects: [], tags: [], busy: false, encrypted: false, onSearch: submit,
    })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const group = host.querySelector('[role="search"]')!;
    expect(group.querySelector('[aria-label="Filter projects"]')).not.toBeNull();
    expect(group.querySelector('[aria-label="Filter tags"]')).not.toBeNull();
    expect(group.querySelector('[aria-label="Search date range"]')).toBeNull();
    expect(host.querySelector('[aria-label="Search date range"]')).not.toBeNull();
    expect(document.activeElement).toBe(host.querySelector('[aria-label="Search descriptions"]'));
    await React.act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: "Planning", match: "phrase" }));
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("uses the shared toolbar calendar without creating a second date picker", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), submit = vi.fn();
  const props = {
    initial: { text: "Planning", match: "phrase" as const, projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" },
    projects: [], tags: [], busy: false, encrypted: false, compact: true, hideDate: true, onSearch: submit,
  };
  try {
    await React.act(async () => root.render(React.createElement(EntrySearchControls, { ...props, dateRange: { from: "2026-01-01", to: "2026-01-31" } })));
    expect(host.querySelector('[aria-label="Search date range"]')).toBeNull();
    const input = host.querySelector('[aria-label="Search descriptions"]');
    await React.act(async () => root.render(React.createElement(EntrySearchControls, { ...props, dateRange: { from: "2026-02-01", to: "2026-02-07" } })));
    expect(host.querySelector('[aria-label="Search descriptions"]')).toBe(input);
    expect(submit).not.toHaveBeenCalled();
    await React.act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ text: "Planning", from: "2026-02-01", to: "2026-02-07" }));
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("find-and-replace previews changes and applies only entries that actually change", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), apply = vi.fn();
  const entry = { id: 1, description: "Review a.* a.*", start: "2026-01-01T12:00:00Z", project_id: null, tags: [], tag_ids: [] } as unknown as TimeEntry;
  const input = async (selector: string, value: string) => {
    const element = document.querySelector<HTMLInputElement>(selector)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await React.act(async () => { setter.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  try {
    await React.act(async () => root.render(React.createElement(SearchBulkEditDialog, { open: true, onOpenChange: vi.fn(), entries: [entry, { ...entry, id: 2, description: "Unrelated" }], projects: [], tags: [], descriptionsLocked: false, onApply: apply })));
    const select = document.querySelector<HTMLButtonElement>('[aria-label="Bulk edit action"]')!;
    await React.act(async () => select.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === "Find and replace")!;
    await React.act(async () => option.click());
    await input('input', "a.*");
    const inputs = document.querySelectorAll<HTMLInputElement>('input');
    await React.act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[1], "$&"); inputs[1].dispatchEvent(new Event("input", { bubbles: true })); });
    expect(document.body.textContent).toContain("Review $& $&");
    expect(apply).not.toHaveBeenCalled();
    const button = [...document.querySelectorAll("button")].find(button => button.textContent === "Apply to 1 entry")!;
    await React.act(async () => button.click());
    expect(apply).toHaveBeenCalledWith([{ id: 1, description: "Review $& $&" }]);
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it("search row actions open context in a new tab and omit combine", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), open = vi.spyOn(window, "open").mockReturnValue(null);
  try {
    await React.act(async () => root.render(React.createElement(EntryViewContext.Provider, { value: { search: true } }, React.createElement(ActionsMenu, { entryId: 7 }))));
    await React.act(async () => host.querySelector("button")!.click());
    expect(document.body.textContent).not.toContain("Combine");
    const button = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Open in timeline"))!;
    await React.act(async () => button.click());
    expect(open).toHaveBeenCalledWith("/?context=7", "_blank", "noopener,noreferrer");
  } finally { await React.act(async () => root.unmount()); host.remove(); open.mockRestore(); vi.unstubAllGlobals(); }
});

it("highlights the first filtered project and supports keyboard multi-selection without submitting", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), submit = vi.fn();
  try {
    await React.act(async () => root.render(React.createElement(EntrySearchControls, {
      initial: { text: "", match: "phrase", projects: [], tags: [], from: "2026-01-01", to: "2026-01-31" },
      projects: [{ id: 2, name: "Example Alpha", color: "#123456" }, { id: 3, name: "Example Beta", color: "#654321" }], tags: [], busy: false, encrypted: false, onSearch: submit,
    })));
    await React.act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Filter projects"]')!.click());
    const input = document.querySelector<HTMLInputElement>('[aria-label="Find projects"]')!;
    const type = async (value: string) => React.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const key = async (value: string) => React.act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
    const active = () => document.getElementById(input.getAttribute("aria-activedescendant") ?? "");
    await type("Example");
    expect(active()?.textContent).toContain("Example Alpha");
    expect(active()?.getAttribute("data-active")).toBe("true");
    await key("ArrowDown");
    expect(active()?.textContent).toContain("Example Beta");
    await key("Enter");
    expect(active()?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(submit).not.toHaveBeenCalled();
    await key("ArrowUp"); await key("Enter");
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2);
    await key("Enter");
    expect(active()?.getAttribute("aria-selected")).toBe("false");
    await type("Beta");
    expect(active()?.textContent).toContain("Example Beta");
    await type("No match");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    await key("ArrowDown"); await key("Enter");
    expect(submit).not.toHaveBeenCalled();
    await React.act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  } finally { await React.act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
