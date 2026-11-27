// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { entryMutations } from "./src/lib/entry-mutations";
import type { DescriptionDraft, DescriptionHistory } from "./src/lib/description-sync";
import { toast } from "./src/lib/toast";

const memory = vi.hoisted(() => ({
  drafts: new Map<string, DescriptionDraft>(),
  history: [] as DescriptionHistory[],
  beforeChange: undefined as undefined | (() => Promise<void>),
}));
vi.mock("@/lib/description-draft-store", () => ({
  listDrafts: async (account: string) =>
    [...memory.drafts.values()].filter((d) => d.account === account),
  listHistory: async () => memory.history,
  changeDraft: async (
    key: string,
    change: (old?: DescriptionDraft) => DescriptionDraft | undefined,
    history?: DescriptionHistory,
  ) => {
    await memory.beforeChange?.();
    const next = change(memory.drafts.get(key));
    if (history) memory.history.push(history);
    if (next) memory.drafts.set(key, next);
    else memory.drafts.delete(key);
    return next;
  },
}));
vi.mock("./src/contexts/encryption-context", () => ({
  useEncryptionContext: () => ({ isE2EEEnabled: false, isUnlocked: false }),
}));
vi.mock("@/lib/api-fetch", () => ({
  apiFetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  togglRetryAt: () => 0,
}));
vi.mock("@/lib/sync-diagnostics", () => ({
  recordSyncDiagnostic: vi.fn(),
  setSyncDiagnosticAccount: vi.fn(),
  downloadSyncDiagnostics: vi.fn(),
  draftDiagnostic: () => ({ fields: {}, texts: {} }),
}));
vi.mock("@/lib/toast", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
import {
  DescriptionDraftIcon,
  DescriptionDraftsProvider,
  useDescriptionDrafts,
} from "./src/contexts/description-drafts-context";

let root: Root;
let host: HTMLDivElement;
let remote: string;
let inFlightConflict: boolean;
let reads: number;
let writes: number;
const key = "1:2:3";
const draft = (): DescriptionDraft => ({
  key,
  account: "1:2",
  entryId: 3,
  base: "original",
  local: "my saved edit",
  status: "conflict",
  revision: 1,
  updatedAt: 1,
  remote: "outdated copy",
});
const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await React.act(async () => {
    root.render(
      React.createElement(
        DescriptionDraftsProvider,
        null,
        React.createElement(
          "div",
          { "data-testid": "entry-row" },
          React.createElement(DescriptionDraftIcon, { entryId: 3 }),
        ),
      ),
    );
  });
  window.dispatchEvent(new Event("deeplog-timeline-ready"));
};
beforeEach(() => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    };
  };
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  memory.drafts.clear();
  memory.history = [];
  memory.beforeChange = undefined;
  localStorage.setItem("toggl_session_token", "test-session");
  remote = "my saved edit";
  reads = 0;
  writes = 0;
  inFlightConflict = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("BroadcastChannel", undefined);
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (...args: unknown[]) => (args.at(-1) as (lock: object) => unknown)({}),
    },
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (String(_url).endsWith("validate-session-token"))
        return Response.json({ user: { id: 1 }, workspace: { id: 2 } });
      if (body.reviewOnly) reads++;
      else {
        writes++;
        remote = body.local;
        if (inFlightConflict)
          memory.drafts.set(key, {
            ...memory.drafts.get(key)!,
            status: "conflict",
            remote: "outdated copy",
          });
      }
      return Response.json({ description: remote });
    }),
  );
});
afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

it("clears a persisted false conflict automatically without opening review or writing to Toggl", async () => {
  memory.drafts.set(key, { ...draft(), deleted: true });
  await mount();
  await React.act(async () => {
    await vi.waitFor(() => expect(memory.drafts.get(key)?.status).toBe("synced"), {
      timeout: 4000,
    });
  });
  expect(reads).toBe(1);
  expect(writes).toBe(0);
  expect(memory.drafts.get(key)?.deleted).toBe(false);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
});

it("preserves a real conflict, then clears it read-only after reconnect when Toggl matches", async () => {
  remote = "different remote edit";
  memory.drafts.set(key, draft());
  await mount();
  await React.act(async () => {
    await vi.waitFor(() => expect(reads).toBe(1), { timeout: 4000 });
  });
  expect(memory.drafts.get(key)?.status).toBe("conflict");
  expect(memory.drafts.get(key)?.local).toBe("my saved edit");
  remote = "my saved edit";
  await React.act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(memory.drafts.get(key)?.status).toBe("synced"), {
      timeout: 4000,
    });
  });
  expect(reads).toBe(2);
  expect(writes).toBe(0);
});

it("acknowledges a successful save even if a conflict appeared while the upload was in flight", async () => {
  memory.drafts.set(key, { ...draft(), status: "local", remote: undefined });
  inFlightConflict = true;
  await mount();
  await React.act(async () => {
    await vi.waitFor(() => expect(memory.drafts.get(key)?.status).toBe("synced"), {
      timeout: 4000,
    });
  });
  expect(writes).toBe(1);
  expect(memory.drafts.get(key)?.local).toBe("my saved edit");
  expect(host.querySelector('[aria-label="Description conflict — click to resolve"]')).toBeNull();
});

it("resolving a current draft and reviewing an older missing entry preserves the timeline until Go is clicked", async () => {
  remote = "different remote edit";
  memory.drafts.set(key, { ...draft(), start: "2026-11-16T14:00:00Z", updatedAt: 2 });
  memory.drafts.set("1:2:4", {
    ...draft(),
    key: "1:2:4",
    entryId: 4,
    start: "2026-11-13T20:00:00Z",
    updatedAt: 1,
    deleted: true,
    remote: undefined,
  });
  const normalFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes("/4/description"))
        return Response.json({ deleted: true }, { status: 409 });
      return normalFetch(url, init);
    }),
  );
  window.history.replaceState({}, "", "/?from=2026-11-09&to=2026-11-16");
  const originalUrl = window.location.href;
  const navigate = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    // Simulate the timeline: current entry is loaded; an old missing ID needs
    // its original time before the timeline can change the date range.
    if (detail.id === 3) event.preventDefault();
    if (detail.start) {
      event.preventDefault();
      const day = detail.start.slice(0, 10);
      window.history.replaceState({}, "", `/?from=${day}&to=${day}`);
    }
  };
  window.addEventListener("deeplog-description-navigate", navigate);
  try {
    await mount();
    await React.act(async () => {
      await vi.waitFor(() =>
        expect(host.querySelector('[aria-label="Pending description drafts"]')?.textContent).toContain("Review 2 descriptions"),
      );
    });
    await React.act(async () => {
      (
        host.querySelector(
          '[aria-label="Pending description drafts"] button',
        ) as HTMLButtonElement
      ).click();
    });
    expect(window.location.href).toBe(originalUrl);
    await React.act(async () => {
      (host.querySelector('[aria-label="Save my description to Toggl"]') as HTMLButtonElement).click();
    });
    await React.act(async () => {
      await vi.waitFor(() =>
        expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Entry 4"),
      );
    });
    expect(window.location.href).toBe(originalUrl);
    expect(memory.drafts.get(key)?.local).toBe("my saved edit");
    const button = (label: string) =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === label)!;
    await React.act(async () => {
      button("Previous").click();
    });
    await React.act(async () => {
      button("Skip for now").click();
    });
    expect(window.location.href).toBe(originalUrl);
    await React.act(async () => {
      button("Look in timeline").click();
    });
    await React.act(async () => {
      await vi.waitFor(() => expect(window.location.search).toBe("?from=2026-11-13&to=2026-11-13"));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    window.removeEventListener("deeplog-description-navigate", navigate);
  }
});

it.each(["mine", "toggl", "complete"])(
  "row review resolves %s and closes without opening another pending draft",
  async (choice) => {
    remote = "different remote edit";
    memory.drafts.set(key, {
      ...draft(),
      deleted: choice === "complete",
      remote: choice === "complete" ? undefined : remote,
    });
    memory.drafts.set("1:2:4", {
      ...draft(),
      key: "1:2:4",
      entryId: 4,
      local: "another entry's draft",
      start: "2026-11-13T20:00:00Z",
      deleted: true,
      remote: undefined,
    });
    const normalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (
          String(url).includes("/4/description") ||
          (choice === "complete" && String(url).includes("/3/description"))
        )
          return Response.json({ deleted: true }, { status: 409 });
        return normalFetch(url, init);
      }),
    );
    const navigated: number[] = [];
    const navigate = (event: Event) => {
      navigated.push((event as CustomEvent).detail.id);
      event.preventDefault();
    };
    window.addEventListener("deeplog-description-navigate", navigate);
    try {
      await mount();
      await React.act(async () => {
        await vi.waitFor(() =>
          expect(host.querySelector('[data-testid="entry-row"] button')).not.toBeNull(),
        );
      });
      await React.act(async () => {
        (host.querySelector('[data-testid="entry-row"] button') as HTMLButtonElement).click();
      });
      const dialog = host.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain("Entry 3");
      expect(
        [...dialog.querySelectorAll("button")].some(
          (b) => b.textContent === "Skip for now" || b.textContent === "Previous",
        ),
      ).toBe(false);
      expect(dialog.textContent).not.toContain("pending");
      if (choice === "complete") {
        expect(dialog.textContent).toContain("Time entry not found");
        expect(dialog.textContent).toContain("there is no Toggl description to compare");
        expect(dialog.querySelector('[aria-label="Use Toggl’s description"]')).toBeNull();
        const copy = vi.fn(async () => {});
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
        await React.act(async () => {
          [...dialog.querySelectorAll("button")].find(b => b.textContent === "Copy saved description")!.click();
        });
        expect(copy).toHaveBeenCalledWith("my saved edit");
        expect(memory.drafts.has(key)).toBe(true);
      }
      await React.act(async () => {
        (
          choice === "complete" ? [...dialog.querySelectorAll("button")].find(b => b.textContent === "Dismiss mismatch")! : dialog.querySelector(
            `[aria-label="${choice === "mine" ? "Save my description to Toggl" : "Use Toggl’s description"}"]`,
          ) as HTMLButtonElement
        ).click();
      });
      await React.act(async () => {
        await vi.waitFor(() => expect(host.querySelector('[role="dialog"]')).toBeNull());
      });
      if (choice === "complete") {
        expect(memory.history).toEqual([expect.objectContaining({ entryId: 3, local: "my saved edit" })]);
        expect(writes).toBe(0);
      }
      expect(navigated).toEqual([3]);
      expect(memory.drafts.get("1:2:4")?.status).toBe("conflict");
      expect(memory.drafts.get("1:2:4")?.local).toBe("another entry's draft");
      // Queue review is available only after explicitly opening the drawer.
      await React.act(async () => {
        (
          host.querySelector(
            '[aria-label="Pending description drafts"] button',
          ) as HTMLButtonElement
        ).click();
      });
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain("to review");
      expect(
        [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].some((b) => b.textContent === "Skip for now"),
      ).toBe(true);
    } finally {
      window.removeEventListener("deeplog-description-navigate", navigate);
    }
  },
);

it("uses an empty optimistic description before local persistence or server acknowledgement", async () => {
  let context: ReturnType<typeof useDescriptionDrafts>;
  function Probe() {
    context = useDescriptionDrafts();
    return null;
  }
  await mount();
  await React.act(async () => {
    root.render(React.createElement(DescriptionDraftsProvider, null, React.createElement(Probe)));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(context?.ready).toBe(true));
  });
  let release!: () => void;
  memory.beforeChange = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  let saving!: Promise<void>;
  await React.act(async () => {
    saving = context!.save(3, "original", "");
    // A start or split invoked in this same event must copy the empty text.
    expect(context!.getDescription(3, "original")).toBe("");
    release();
    await saving;
  });
  expect(context!.getDescription(3, "original")).toBe("");
  expect(writes).toBe(0);
});

it("tracks each description toast from before persistence until submission, expiry, dismissal or undo", async () => {
  let context: ReturnType<typeof useDescriptionDrafts>;
  function Probe() {
    context = useDescriptionDrafts();
    return null;
  }
  await mount();
  await React.act(async () => {
    root.render(React.createElement(DescriptionDraftsProvider, null, React.createElement(Probe)));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(context?.ready).toBe(true));
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const save = async (text: string) => {
    await React.act(async () => {
      const saving = context!.save(3, "original", text, true);
      expect(context!.hasPendingDescriptionToast(3)).toBe(true);
      expect(context!.hasPendingDescriptionToast(4)).toBe(false);
      await saving;
    });
    return vi.mocked(toast).mock.calls.at(-1)![1]!;
  };
  const old = await save("first edit");
  const current = await save("second edit");
  old.onAutoClose?.({} as never);
  expect(context!.hasPendingDescriptionToast(3)).toBe(true);
  current.submitAction?.();
  expect(context!.hasPendingDescriptionToast(3)).toBe(false);
  const expired = await save("third edit");
  expired.onAutoClose?.({} as never);
  expect(context!.hasPendingDescriptionToast(3)).toBe(false);
  const dismissed = await save("fourth edit");
  dismissed.onDismiss?.({} as never);
  expect(context!.hasPendingDescriptionToast(3)).toBe(false);
  const undone = await save("fifth edit");
  await React.act(async () => {
    if (undone.action && typeof undone.action === "object" && "onClick" in undone.action) {
      undone.action.onClick({} as never);
    }
  });
  expect(context!.hasPendingDescriptionToast(3)).toBe(false);
});

it("keeps the newest description when an older local save completes", async () => {
  let context: ReturnType<typeof useDescriptionDrafts>;
  function Probe() {
    context = useDescriptionDrafts();
    return null;
  }
  await mount();
  await React.act(async () => {
    root.render(React.createElement(DescriptionDraftsProvider, null, React.createElement(Probe)));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(context?.ready).toBe(true));
  });
  const releases: Array<() => void> = [];
  memory.beforeChange = () => new Promise<void>((resolve) => releases.push(resolve));
  await React.act(async () => {
    const first = context!.save(3, "original", "older edit");
    const second = context!.save(3, "original", "");
    expect(context!.getDescription(3, "original")).toBe("");
    releases[0]();
    await first;
    expect(context!.getDescription(3, "original")).toBe("");
    releases[1]();
    await second;
  });
  expect(context!.getDescription(3, "original")).toBe("");
});

it("saves the latest description before a dependent server split or combine", async () => {
  let context: ReturnType<typeof useDescriptionDrafts>;
  function Probe() {
    context = useDescriptionDrafts();
    return null;
  }
  await mount();
  await React.act(async () => {
    root.render(React.createElement(DescriptionDraftsProvider, null, React.createElement(Probe)));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(context?.ready).toBe(true));
  });
  let release!: () => void;
  memory.beforeChange = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const split = vi.fn(async () => {
    expect(remote).toBe("");
  });
  await React.act(async () => {
    const saving = context!.save(3, "original", "");
    context!.commit(3);
    const dependent = entryMutations.run([3], split);
    expect(split).not.toHaveBeenCalled();
    memory.beforeChange = undefined;
    release();
    await saving;
    await dependent;
  });
  expect(writes).toBe(1);
  expect(split).toHaveBeenCalledTimes(1);
  expect(memory.drafts.get(key)?.status).toBe("synced");
});

it("stops dependent server changes when a description has a conflict", async () => {
  memory.drafts.set(key, draft());
  let context: ReturnType<typeof useDescriptionDrafts>;
  function Probe() {
    context = useDescriptionDrafts();
    return null;
  }
  remote = "conflicting remote";
  await mount();
  await React.act(async () => {
    root.render(React.createElement(DescriptionDraftsProvider, null, React.createElement(Probe)));
  });
  await React.act(async () => {
    await vi.waitFor(() => expect(context?.ready).toBe(true));
  });
  const split = vi.fn(async () => {});
  await React.act(async () => {
    context!.commit(3);
    await expect(entryMutations.run([3], split)).rejects.toThrow(
      "Resolve the description conflict",
    );
  });
  expect(split).not.toHaveBeenCalled();
  expect(writes).toBe(0);
});

it("refreshes the comparison instead of dismissing an entry that reappears in Toggl", async () => {
  memory.drafts.set(key, { ...draft(), deleted: true, remote: undefined });
  let missing = true;
  const normalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).includes("/3/description") && missing)
      return Response.json({ deleted: true }, { status: 409 });
    return normalFetch(url, init);
  }));
  remote = "restored entry description";
  await mount();
  await React.act(async () => {
    await vi.waitFor(() => expect(host.querySelector('[data-testid="entry-row"] button')).not.toBeNull());
  });
  await React.act(async () => {
    (host.querySelector('[data-testid="entry-row"] button') as HTMLButtonElement).click();
  });
  missing = false;
  await React.act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === "Dismiss mismatch")!.click();
  });
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Which description should Toggl keep?");
  expect(memory.drafts.get(key)?.local).toBe("my saved edit");
  expect(memory.drafts.get(key)?.deleted).toBe(false);
  expect(memory.history).toHaveLength(0);
  expect(writes).toBe(0);
});

it("shows a matching entry separately and opens its actual ID without moving the draft", async () => {
  const matchingEntry = { entryId: 4, start: "2026-01-15T10:00:00Z" };
  memory.drafts.set(key, { ...draft(), deleted: true, remote: undefined, start: matchingEntry.start });
  const normalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (String(url).includes("/3/description")) {
      const body = JSON.parse(String(init.body));
      expect(body.start).toBe(matchingEntry.start);
      return Response.json({ deleted: true, matchingEntry }, { status: 409 });
    }
    return normalFetch(url, init);
  }));
  const navigated: number[] = [];
  const navigate = (event: Event) => { navigated.push((event as CustomEvent).detail.id); event.preventDefault(); };
  window.addEventListener("deeplog-description-navigate", navigate);
  try {
    await mount();
    await React.act(async () => {
      await vi.waitFor(() => expect(host.querySelector('[data-testid="entry-row"] button')).not.toBeNull());
    });
    await React.act(async () => { (host.querySelector('[data-testid="entry-row"] button') as HTMLButtonElement).click(); });
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Found a matching entry");
    expect(dialog.textContent).toContain("exact same start time");
    expect(dialog.textContent).not.toContain("there is no Toggl description to compare");
    await React.act(async () => {
      [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === "View matching entry")!.click();
    });
    expect(navigated).toEqual([3, 4]);
    expect(memory.drafts.get(key)?.local).toBe("my saved edit");
    expect(memory.drafts.has("1:2:4")).toBe(false);
    expect(writes).toBe(0);
  } finally { window.removeEventListener("deeplog-description-navigate", navigate); }
});
