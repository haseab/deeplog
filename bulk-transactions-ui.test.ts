// @vitest-environment jsdom
import React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { useBulkTransactions as Hook } from "./src/hooks/use-bulk-transactions";
import type { TimeEntry } from "./src/types";
type Notice = { id: string; duration: number; submitAction?: unknown; onAutoClose: () => void; action: { onClick: () => void } };
const mocks = vi.hoisted(() => ({ notifications: new Map<string, Notice>(), fetch: vi.fn() }));
vi.mock("./src/lib/toast", () => {
  const toast = Object.assign(vi.fn((_message: string, options: Notice) => {
    mocks.notifications.set(options.id, options);
    return options.id;
  }), { dismiss: vi.fn(), success: vi.fn(), error: vi.fn() });
  return { toast };
});
vi.mock("./src/lib/api-fetch", () => ({ apiFetch: mocks.fetch }));
import { useBulkTransactions } from "./src/hooks/use-bulk-transactions";
const raw: TimeEntry = { id: 1, description: "Planning", project_id: null, project_name: "", project_color: "#123456", tags: [], tag_ids: [], start: "2026-01-01T10:00:00Z", stop: "2026-01-01T11:00:00Z", duration: 3600 };
let result: ReturnType<typeof Hook>, host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const applied = vi.fn();
function Harness({ reviewing = false }) { result = useBulkTransactions({ account: "1:2", reviewing, current: () => [raw], applied }); return null; }
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: () => "test-session" });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); mocks.notifications.clear(); mocks.fetch.mockReset(); applied.mockReset();
  mocks.fetch.mockResolvedValue(Response.json({ state: "applied" }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await React.act(async () => root.render(React.createElement(Harness)));
});
afterEach(async () => { await React.act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("requires the actual 30-second toast closure, commits once, and exposes no early-submit shortcut", async () => {
  await React.act(async () => { result.stage("Edit", [{ before: raw, patch: { description: "Updated" } }]); });
  const options = [...mocks.notifications.values()][0];
  expect(options.duration).toBe(30_000); expect(options.submitAction).toBeUndefined();
  await React.act(async () => { vi.advanceTimersByTime(29_999); });
  expect(mocks.fetch).not.toHaveBeenCalled();
  await React.act(async () => { options.onAutoClose(); options.onAutoClose(); });
  expect(mocks.fetch).toHaveBeenCalledTimes(1); expect(applied).toHaveBeenCalledTimes(1);
});
it("pauses while reviewing and ignores stale toast callbacks after rearming", async () => {
  await React.act(async () => { result.stage("Edit", [{ before: raw, patch: { description: "Updated" } }]); });
  const old = [...mocks.notifications.values()][0];
  await React.act(async () => root.render(React.createElement(Harness, { reviewing: true })));
  expect([...mocks.notifications.values()][0].duration).toBe(Infinity);
  await React.act(async () => { old.onAutoClose(); vi.advanceTimersByTime(60_000); });
  expect(mocks.fetch).not.toHaveBeenCalled();
  await React.act(async () => root.render(React.createElement(Harness, { reviewing: false })));
  const rearmed = [...mocks.notifications.values()][0];
  expect(rearmed.duration).toBe(30_000);
  await React.act(async () => rearmed.action.onClick());
  await React.act(async () => rearmed.onAutoClose());
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(result.store.overlay([raw])).toEqual([raw]);
});
