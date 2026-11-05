import { NextRequest } from "next/server";
import { LedgerBusyError } from "@/lib/task-extraction/ledger";
import { previewBatch, PreviewError } from "@/lib/task-extraction/preview";
import { createReadProviders } from "@/lib/task-extraction/providers";

export const runtime = "nodejs";
export const maxDuration = 300;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const cron = Boolean(process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`);
  // Interactive users supply their own keys, as in the transcript browser.
  // Server credentials are only available to authenticated cron operators.
  const limitless = cron ? process.env.LIMITLESS_API_KEY : request.headers.get("x-limitless-api-key");
  const openai = cron ? process.env.OPENAI_API_KEY : request.headers.get("x-openai-api-key");
  if (!limitless || !openai) return json({ error: "Limitless and OpenAI API keys are required for a test" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["startDate", "endDate", "runId"].includes(key))) {
    return json({ error: "Provide only startDate/endDate or a preview runId" }, 400);
  }
  for (const key of ["startDate", "endDate", "runId"]) {
    if (body[key] !== undefined && (typeof body[key] !== "string" || !body[key])) return json({ error: `Invalid ${key}` }, 400);
  }
  try {
    return json(await previewBatch(body, limitless, createReadProviders({ limitless, openai })));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) },
      error instanceof PreviewError ? error.status : error instanceof LedgerBusyError ? 409 : 500);
  }
}
