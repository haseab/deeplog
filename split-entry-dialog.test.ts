// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SplitEntryDialog } from "./src/components/split-entry-dialog";

it("confirms once per opening even if Enter repeats before the dialog unmounts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const confirm = vi.fn();
  const changed = vi.fn();
  const render = (open: boolean) =>
    root.render(
      React.createElement(SplitEntryDialog, { open, onOpenChange: changed, onConfirm: confirm }),
    );
  try {
    await React.act(async () => render(true));
    const input = document.querySelector("input")!;
    await React.act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, repeat: true }),
      );
      expect(confirm).not.toHaveBeenCalled();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledWith(false);
    await React.act(async () => render(false));
    await React.act(async () => render(true));
    await React.act(async () => {
      document
        .querySelector("input")!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
