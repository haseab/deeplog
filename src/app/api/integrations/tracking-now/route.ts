import { createHash, timingSafeEqual } from "node:crypto";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function GET(request: Request) {
  const expected = process.env.ATTENTION_API_KEY;
  if (!expected || expected.length < 32) return json({ error: "Integration is not configured" }, 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${expected}`))) return json({ error: "Unauthorized" }, 401);
  const session = process.env.TOGGL_SESSION_TOKEN;
  if (!session) return json({ error: "DeepLog tracking connection is not configured" }, 503);
  try {
    const response = await fetch("https://track.toggl.com/api/v9/me/time_entries/current", {
      headers: { Accept: "application/json", Authorization: `Bearer ${session}` },
      cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) return json({ error: "DeepLog tracking connection is unavailable" }, 503);
    const entry = await response.json() as { description?: unknown; start?: unknown; stop?: unknown } | null;
    if (!entry || entry.stop) return json({ entry: null });
    if (typeof entry.start !== "string" || !Number.isFinite(Date.parse(entry.start))) return json({ error: "Invalid tracking response" }, 502);
    return json({ entry: {
      description: typeof entry.description === "string" ? entry.description.slice(0, 4000) : "",
      start: new Date(entry.start).toISOString(),
    } });
  } catch { return json({ error: "DeepLog tracking connection is unavailable" }, 503); }
}
