import { parseToastDiagnostics } from "@/lib/toast-diagnostics-data";

let windowStarted = 0;
let reports = 0;

/** Content-free, untrusted client toast events. Never authenticate against Toggl for telemetry. */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin) {
    // Next can expose an internal listen address behind a reverse proxy.
    // Validate against the public request host rather than that internal URL.
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
      || request.headers.get("host") || new URL(request.url).host;
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.host !== host.toLowerCase()) return new Response(null, { status: 403 });
    } catch { return new Response(null, { status: 403 }); }
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return new Response(null, { status: 415 });
  if (Date.now() - windowStarted >= 60_000) { windowStarted = Date.now(); reports = 0; }
  if (++reports > 120) return new Response(null, { status: 429 });
  // Bound streamed bodies too; do not rely on the caller's Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { void reader.cancel().catch(() => {}); return new Response(null, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const report = parseToastDiagnostics(JSON.parse(new TextDecoder().decode(bytes)));
    if (!report) return new Response(null, { status: 400 });
    try { console.info("[deeplog-toast-client]", JSON.stringify(report)); } catch { /* Best effort. */ }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 400 }); }
  finally { reader.releaseLock(); }
}
