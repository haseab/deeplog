export function GET() {
  try {
    const url = new URL(process.env.BB_PUBLIC_URL || "");
    if (url.username || url.password || !["https:", "http:"].includes(url.protocol))
      throw new Error();
    return Response.json({ origin: url.origin }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "BB_PUBLIC_URL is not configured" }, { status: 503 });
  }
}
