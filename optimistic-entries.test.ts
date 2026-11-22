// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useOptimisticEntries } from "./src/hooks/use-optimistic-entries";

it("chains combine and time edits against the latest rows before a render", async () => {
  type Entry = { id: number; start: number; stop: number; description: string };
  let state!: ReturnType<typeof useOptimisticEntries<Entry>>;
  function Probe() {
    state = useOptimisticEntries<Entry>();
    return null;
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await React.act(async () =>
      root.render(React.createElement(React.StrictMode, null, React.createElement(Probe))),
    );
    const transition = vi.fn((entries: Entry[]) => [{ ...entries[1], start: entries[0].start }]);
    await React.act(async () => {
      state[1]([
        { id: 1, start: 0, stop: 10, description: "" },
        { id: 2, start: 10, stop: 20, description: "kept" },
      ]);
      state[1](transition);
      expect(state[2].current).toEqual([{ id: 2, start: 0, stop: 20, description: "kept" }]);
      state[1]((entries) => entries.map((entry) => ({ ...entry, stop: 30 })));
      expect(state[2].current[0].start).toBe(0);
    });
    expect(transition).toHaveBeenCalledTimes(1);
    expect(state[0]).toEqual([{ id: 2, start: 0, stop: 30, description: "kept" }]);
  } finally {
    await React.act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
