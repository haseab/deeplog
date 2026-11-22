import { analyticsRange, type AnalyticsEntry } from "./bb-analytics-range";
export async function openBbAnalytics(entry: AnalyticsEntry) {
  const range = analyticsRange(entry);
  // Open synchronously so browsers permit the new tab after loading settings.
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Allow pop-ups to open BB analytics.");
  tab.opener = null;
  try {
    let origin = localStorage.getItem("deeplog_bb_origin");
    if (!origin) {
      const response = await fetch("/api/bb-analytics/config", { cache: "no-store" });
      if (!response.ok)
        throw new Error("Set your BB web address in Settings → General → BB analytics.");
      origin = (await response.json()).origin;
    }
    if (!origin) throw new Error("Set your BB web address in Settings → General → BB analytics.");
    const url = new URL(origin);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      throw new Error("The configured BB URL is invalid.");
    tab.location.href = `${url.origin}/plugins/deeplog/analytics/${range.start}/${range.end}`;
  } catch (error) {
    tab.close();
    throw error;
  }
}
