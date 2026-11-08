import { type Providers, RejectedDelivery } from "./pipeline";
import { type Transcript } from "./ledger";
import { createTaskAI } from "./ai";

async function fetchJson(url: string, init: RequestInit, timeout = 30_000) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`Upstream request failed (${response.status})`);
  return response.json();
}

export function createReadProviders(keys: { limitless: string; openai: string }): Pick<Providers, "page" | "extract" | "review"> {
  return {
    async page(start, end, cursor) {
      // Live verification: larger pages (50/100) can return lifelog metadata
      // with empty contents even when speech exists. Keep content pages at 20.
      const params = new URLSearchParams({ start, end, limit: "20", direction: "asc", includeContents: "true", includeHeadings: "true", includeMarkdown: "true" });
      if (cursor) params.set("cursor", cursor);
      const data = await fetchJson(`https://api.limitless.ai/v1/lifelogs?${params}`, { headers: { "X-API-Key": keys.limitless } });
      if (!Array.isArray(data.data?.lifelogs)) throw new Error("Invalid Limitless page; refusing to mark range scanned");
      const nextCursor = data.meta?.lifelogs?.nextCursor ?? data.data?.cursor ?? null;
      if (nextCursor !== null && (typeof nextCursor !== "string" || !nextCursor)) throw new Error("Invalid pagination cursor");
      return { transcripts: data.data.lifelogs as Transcript[], nextCursor };
    },
    ...createTaskAI(keys.openai),
  };
}

export function createProviders(keys: { limitless: string; openai: string; todoist: string }): Providers {
  let projectId: string | undefined;
  return {
    ...createReadProviders(keys),
    async project() {
      if (projectId) return projectId;
      let cursor: string | null = null;
      const seen = new Set<string>();
      const matches: string[] = [];
      do {
        const params = new URLSearchParams({ query: "task-extraction", limit: "200" });
        if (cursor) params.set("cursor", cursor);
        const data = await fetchJson(`https://api.todoist.com/api/v1/projects/search?${params}`, { headers: { Authorization: `Bearer ${keys.todoist}` } });
        if (!Array.isArray(data.results)) throw new Error("Invalid Todoist project search response");
        for (const project of data.results) {
          if (typeof project.name === "string" && project.name.trim().toLowerCase() === "task-extraction" && typeof project.id === "string") matches.push(project.id);
        }
        cursor = data.next_cursor ?? null;
        if (cursor && (typeof cursor !== "string" || seen.has(cursor))) throw new Error("Invalid Todoist project pagination");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (matches.length !== 1) throw new Error('Expected exactly one Todoist project named "task-extraction"');
      projectId = matches[0];
      return projectId;
    },
    async create(task) {
      const response = await fetch("https://api.todoist.com/api/v1/tasks", {
        method: "POST", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${keys.todoist}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: task.content, project_id: task.projectId,
          description: `Recording ${task.recordingId} at ${task.startTime}\n[DeepLog:${task.id}]`,
          labels: ["auto-extracted", "from-transcript"],
        }),
      });
      if (!response.ok) {
        if ([400, 401, 403, 404, 422, 429].includes(response.status)) throw new RejectedDelivery(`Todoist rejected task (${response.status})`);
        throw new Error(`Uncertain Todoist delivery (${response.status}); check marker DeepLog:${task.id}`);
      }
      const data = await response.json();
      if (typeof data.id !== "string" || !data.id) throw new Error("Todoist success response has no task ID");
      return data.id;
    },
  };
}
