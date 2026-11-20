import type { NextRequest } from "next/server";
import { GET as loadTimeline } from "./analytics-route";
import { withRefreshTiming } from "@/lib/refresh-timing-server";
export { POST } from "./analytics-route";

export function GET(request: NextRequest) {
  return withRefreshTiming(request, () => loadTimeline(request));
}
