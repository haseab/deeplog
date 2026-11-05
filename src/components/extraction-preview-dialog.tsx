"use client";

import React from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PreviewReport } from "@/lib/task-extraction/preview";

export function ExtractionPreviewDialog({ range }: { range: { startTime: Date; endTime: Date } | null }) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [openaiKey, setOpenaiKey] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [report, setReport] = React.useState<PreviewReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const stop = React.useRef(false);
  const busy = React.useRef(false);

  React.useEffect(() => () => { stop.current = true; }, []);
  const dates = (from: Date, to: Date) => {
    setStart(format(from, "yyyy-MM-dd'T'HH:mm"));
    setEnd(format(to, "yyyy-MM-dd'T'HH:mm"));
    setReport(null);
    setError(null);
  };

  async function run(resume = false) {
    if (busy.current) return;
    const sourceKey = localStorage.getItem("limitless_api_key");
    if (!sourceKey || !openaiKey.trim()) { setError("Enter an OpenAI API key and connect to Limitless first."); return; }
    const from = new Date(start), to = new Date(end);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) { setError("Choose a start time before the end time."); return; }
    busy.current = true;
    stop.current = false;
    setRunning(true);
    setError(null);
    let runId = resume ? report?.runId : undefined;
    if (!resume) setReport(null);
    try {
      do {
        const response = await fetch("/api/limitless/extraction-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-limitless-api-key": sourceKey, "x-openai-api-key": openaiKey.trim() },
          body: JSON.stringify(runId ? { runId } : { startDate: from.toISOString(), endDate: to.toISOString() }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Test failed (${response.status})`);
        if (result.dryRun !== true || result.todoistEnabled !== false) throw new Error("Unexpected test response");
        setReport(result);
        runId = result.runId;
        if (result.discoveryError || result.failedRecordings) { setError(result.discoveryError || "Some recordings failed extraction. Review the errors below, then resume to retry."); break; }
        if (result.complete) break;
      } while (!stop.current);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { busy.current = false; setRunning(false); }
  }

  return <Dialog open={open} onOpenChange={value => {
    setOpen(value);
    if (!value) { stop.current = true; return; }
    if (!busy.current) {
      const now = new Date();
      dates(range?.startTime ?? new Date(now.getTime() - 3 * 86400000), range?.endTime ?? now);
      setOpenaiKey(localStorage.getItem("openai_api_key") || "");
    }
  }}>
    <Button variant="outline" size="sm" disabled={running} onClick={() => {
      const now = new Date();
      dates(range?.startTime ?? new Date(now.getTime() - 3 * 86400000), range?.endTime ?? now);
      setOpenaiKey(localStorage.getItem("openai_api_key") || "");
      setOpen(true);
    }}>Test extraction</Button>
    <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Test extraction over history</DialogTitle>
        <DialogDescription>Read recordings and preview task candidates. No Todoist tasks are created, now or later. Uses OpenAI API credits.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm space-y-1">Start (local time)<Input aria-label="Test range start" type="datetime-local" value={start} disabled={running} onChange={event => { setStart(event.target.value); setReport(null); }} required /></label>
          <label className="text-sm space-y-1">End (local time)<Input aria-label="Test range end" type="datetime-local" value={end} disabled={running} onChange={event => { setEnd(event.target.value); setReport(null); }} required /></label>
        </div>
        <div className="flex gap-2">{[3, 7, 30].map(days => <Button key={days} type="button" size="sm" variant="outline" disabled={running} onClick={() => { const now = new Date(); dates(new Date(now.getTime() - days * 86400000), now); }}>Last {days} days</Button>)}</div>
        <label className="block text-sm space-y-1">OpenAI API key<Input aria-label="Preview OpenAI API key" type="password" autoComplete="off" value={openaiKey} disabled={running} onChange={event => setOpenaiKey(event.target.value)} placeholder="Uses your key from Settings, or enter one for this test" required /></label>
        <p className="text-xs text-muted-foreground">Tests all pages, not just the recordings loaded in the history view. Includes preceding-day recordings for boundary context. Results are temporary and expire after 24 hours or a server replacement.</p>
        <div className="flex gap-2">
          <Button type="submit" disabled={running}>Run test</Button>
          {report && !report.complete && <Button type="button" variant="outline" disabled={running} onClick={() => void run(true)}>Resume test</Button>}
          {running && <Button type="button" variant="outline" onClick={() => { stop.current = true; }}>Stop after this batch</Button>}
        </div>
      </form>
      <div role="status" aria-live="polite" className="text-sm">
        {running && <p>Testing in batches… Large ranges can take several minutes.</p>}
        {report && <div className="space-y-1 mt-2">
          <p className="font-medium">{report.complete ? "Test complete" : "Partial results"}: {report.totalRecordings} recordings found · {report.extractedRecordings} extracted · {report.taskCount} task candidates</p>
          <p>Discovery {report.discoveryComplete ? "complete" : "in progress"} · {report.failedRecordings} failed · {report.unavailableRecordings} awaiting transcript</p>
        </div>}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {report?.complete && !report.totalRecordings && <p className="text-sm text-muted-foreground">No recordings were returned for this range.</p>}
      {report?.recordings.map(record => <details key={record.id} className="border rounded-lg p-3 text-sm">
        <summary className="cursor-pointer">{format(new Date(record.startTime), "MMM d, yyyy h:mm a")} · {record.state.replaceAll("_", " ")} · {record.tasks.length} candidates · {record.chunksDone}/{record.chunks} chunks</summary>
        <p className="text-xs text-muted-foreground mt-2 break-all">Recording {record.id}</p>
        {record.errors.map((message, i) => <p key={i} className="text-destructive mt-2">{message}</p>)}
        {record.tasks.length ? <ul className="list-disc pl-5 mt-2 space-y-1">{record.tasks.map((task, index) => <li key={index}>{task}</li>)}</ul> : <p className="mt-2 text-muted-foreground">{record.state === "extracted" ? "No actionable tasks found." : "No candidates extracted yet."}</p>}
      </details>)}
    </DialogContent>
  </Dialog>;
}
