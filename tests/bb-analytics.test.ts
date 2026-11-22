import assert from "node:assert/strict";
import { test } from "node:test";
import { analyticsRange } from "../src/lib/bb-analytics-range";
import { GET } from "../src/app/api/bb-analytics/config/route";
import { openBbAnalytics } from "../src/lib/bb-analytics";
test("exact entry range and running-entry snapshot", () => {
  assert.deepEqual(
    analyticsRange({ start: "2026-01-01T00:00:00.123Z", stop: "2026-01-01T00:00:01.456Z" }),
    { start: 1767225600123, end: 1767225601456 },
  );
  assert.deepEqual(analyticsRange({ start: "2026-01-01T00:00:00Z" }, 1767225660000), {
    start: 1767225600000,
    end: 1767225660000,
  });
  assert.throws(() => analyticsRange({ start: "bad" }));
});
test("runtime config allows web origins and rejects credentials and non-web schemes", async () => {
  const original = process.env.BB_PUBLIC_URL;
  try {
    for (const value of ["", "javascript:alert(1)", "https://user:password@example.com"]) {
      process.env.BB_PUBLIC_URL = value;
      assert.equal(GET().status, 503);
    }
    process.env.BB_PUBLIC_URL = "https://bb.example.com/some/path";
    const response = GET();
    assert.deepEqual(await response.json(), { origin: "https://bb.example.com" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (original === undefined) delete process.env.BB_PUBLIC_URL;
    else process.env.BB_PUBLIC_URL = original;
  }
});
test("browser setting opens the exact BB report with an isolated opener", async () => {
  const scope = globalThis as typeof globalThis & { window?: unknown; localStorage?: unknown };
  const originalWindow = Object.getOwnPropertyDescriptor(scope, "window"),
    originalStorage = Object.getOwnPropertyDescriptor(scope, "localStorage");
  const tab = {
    location: { href: "" },
    opener: {} as unknown,
    close: () => assert.fail("unexpected close"),
  };
  Object.defineProperty(scope, "window", { configurable: true, value: { open: () => tab } });
  Object.defineProperty(scope, "localStorage", {
    configurable: true,
    value: { getItem: () => "https://bb.example.com" },
  });
  try {
    await openBbAnalytics({ start: "2026-01-01T00:00:00.123Z", stop: "2026-01-01T00:00:01.456Z" });
    assert.equal(
      tab.location.href,
      "https://bb.example.com/plugins/deeplog/analytics/1767225600123/1767225601456",
    );
    assert.equal(tab.opener, null);
  } finally {
    if (originalWindow) Object.defineProperty(scope, "window", originalWindow);
    else Reflect.deleteProperty(scope, "window");
    if (originalStorage) Object.defineProperty(scope, "localStorage", originalStorage);
    else Reflect.deleteProperty(scope, "localStorage");
  }
});
