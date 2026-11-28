// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completionRange, rememberDescriptionItems, searchDescriptionItems } from "./description-completions";
import { updateRecentTimersCache } from "./recent-timers-cache";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

it("retains items from full descriptions that recent timers shorten", () => {
  updateRecentTimersCache([{ id: 1, description: "Planning - A detailed task description that exceeds the old fifty character cutoff, Review navigation, Publish report", project_id: 2, tag_ids: [] }]);
  expect(searchDescriptionItems("nav").map((item) => item.description)).toEqual(["Review navigation"]);
  expect(searchDescriptionItems("publish")[0].description).toBe("Publish report");
});

it("deduplicates case-insensitively and treats matching text as plain text", () => {
  rememberDescriptionItems(["Review navigation, Publish report", "review navigation, <example>"]);
  expect(searchDescriptionItems("nav")).toHaveLength(1);
  expect(searchDescriptionItems("<ex")[0].description).toBe("<example>");
  expect(searchDescriptionItems("Review navigation")).toEqual([]);
});

it("replaces the item around the caret and preserves adjacent items and spacing", () => {
  const text = "Planning,  Rev nav  , Publish report";
  const range = completionRange(text, text.indexOf("nav") + 2);
  expect(range.query).toBe("Rev na");
  expect(text.slice(0, range.from) + "Review navigation" + text.slice(range.to)).toBe("Planning,  Review navigation  , Publish report");
  expect(completionRange("Plan, ", 6)).toEqual({ from: 6, to: 6, query: "" });
  expect(completionRange(", Plan", 0)).toEqual({ from: 0, to: 0, query: "" });
});

it("uses the spaced hyphen as the first item boundary and extracts reusable items", () => {
  rememberDescriptionItems(["Building - Review navigation, Publish report"]);
  expect(searchDescriptionItems("Rev")[0].description).toBe("Review navigation");
  const text = "Building - Rev, Publish report";
  const range = completionRange(text, 14);
  expect(range.query).toBe("Rev");
  expect(text.slice(0, range.from) + "Review navigation" + text.slice(range.to)).toBe("Building - Review navigation, Publish report");
  expect(completionRange("Building -", 10)).toEqual({ from: 10, to: 10, query: "" });
});

it("omits the second hyphen and suffix from suggestions, including cached items", () => {
  rememberDescriptionItems(["Building - Review navigation, Fix sign-in - example-project, internal label"]);
  expect(searchDescriptionItems("sign").map((item) => item.description)).toEqual(["Fix sign-in"]);
  expect(searchDescriptionItems("example-project")).toEqual([]);
  expect(searchDescriptionItems("internal label")).toEqual([]);
  localStorage.setItem("deeplog_description_items", JSON.stringify(["Publish report - example-project"]));
  expect(searchDescriptionItems("Publish")[0].description).toBe("Publish report");
  expect(searchDescriptionItems("example-project")).toEqual([]);
});

it("keeps an existing suffix when completing the final item", () => {
  const text = "Building - Planning, Rev - example-project";
  const range = completionRange(text, text.indexOf("Rev") + 3);
  expect(range.query).toBe("Rev");
  expect(text.slice(0, range.from) + "Review navigation" + text.slice(range.to)).toBe("Building - Planning, Review navigation - example-project");
});

it("evicts the oldest never-selected items and preserves selected items", async () => {
  const { readDescriptionItems, recordDescriptionItemSelection } = await import("./description-item-cache");
  localStorage.setItem("deeplog_description_items", JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({
    description: `Task ${i}`, usageCount: 0, firstSeenAt: i + 1,
  }))));
  recordDescriptionItemSelection("Task 0");
  recordDescriptionItemSelection("TASK 0");
  // Re-encountering an old item must not renew its age or count as selection.
  rememberDescriptionItems(["Task 1", "New task"]);
  const items = readDescriptionItems();
  expect(items).toHaveLength(2000);
  expect(items.find((item) => item.description === "Task 0")?.usageCount).toBe(2);
  expect(items.some((item) => item.description === "Task 1")).toBe(false);
  expect(items.some((item) => item.description === "New task")).toBe(true);
});

it("migrates string caches and never evicts selected items when all slots are protected", async () => {
  const { readDescriptionItems, recordDescriptionItemSelection } = await import("./description-item-cache");
  localStorage.setItem("deeplog_description_items", JSON.stringify(["Existing task"]));
  recordDescriptionItemSelection("existing TASK");
  expect(readDescriptionItems()).toEqual([{ description: "Existing task", usageCount: 1, firstSeenAt: 0 }]);
  localStorage.setItem("deeplog_description_items", JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({
    description: `Task ${i}`, usageCount: 1, firstSeenAt: i + 1,
  }))));
  rememberDescriptionItems(["Unused newcomer"]);
  expect(readDescriptionItems()).toHaveLength(2000);
  recordDescriptionItemSelection("Explicitly chosen newcomer");
  expect(readDescriptionItems()).toHaveLength(2001);
  expect(readDescriptionItems().every((item) => item.usageCount > 0)).toBe(true);
});
