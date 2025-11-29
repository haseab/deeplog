"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { Merge } from "lucide-react";
import React from "react";
import type { TimeEntry } from "../types";

interface CombineConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TimeEntry[];
  onConfirm: () => void;
  reverse?: boolean;
}

// Entry card component
function EntryCard({
  entry,
  isKept,
  formatTime,
}: {
  entry: TimeEntry;
  isKept: boolean;
  formatTime: (dateStr: string) => string;
}) {
  return (
    <div
      className={`rounded-md p-2.5 border ${
        isKept
          ? "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
          : "bg-muted/50 border-red-300 dark:border-red-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground flex-1">
          {entry.description || "(no description)"}
        </p>
        {isKept && (
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 flex-shrink-0 whitespace-nowrap">
            Extended
          </span>
        )}
        {!isKept && (
          <span className="text-xs font-medium text-red-700 dark:text-red-300 flex-shrink-0 whitespace-nowrap">
            Deleted
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1 min-w-0">
        <div
          className="w-2 h-2 rounded-sm flex-shrink-0"
          style={{
            backgroundColor: entry.project_color || "#6b7280",
          }}
        />
        <p className="text-xs text-muted-foreground truncate min-w-0">
          {entry.project_name || "No Project"}
        </p>
      </div>
      <p className="text-xs text-muted-foreground mt-1 truncate">
        {formatTime(entry.start)} →{" "}
        {entry.stop ? formatTime(entry.stop) : "Running"}
      </p>
    </div>
  );
}

export function CombineConfirmationDialog({
  open,
  onOpenChange,
  entries,
  onConfirm,
  reverse = false,
}: CombineConfirmationDialogProps) {
  const confirmButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      // Focus confirm button when dialog opens
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 100);
    }
  }, [open, reverse, entries.length]);

  if (entries.length === 0) return null;

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "h:mm a");
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  // Find earliest entry (chronologically first - oldest start time)
  const earliestEntry = entries.reduce((earliest, current) => {
    return new Date(current.start).getTime() <
      new Date(earliest.start).getTime()
      ? current
      : earliest;
  });

  // Find latest entry (chronologically last - newest start time)
  const latestEntry = entries.reduce((latest, current) => {
    return new Date(current.start).getTime() >
      new Date(latest.start).getTime()
      ? current
      : latest;
  });

  // Determine which entry to keep based on reverse mode
  const entryToKeep = reverse ? latestEntry : earliestEntry;

  // Check if any entry is running
  const hasRunningEntry = entries.some((e) => !e.stop || e.duration === -1);

  // Find the latest stop time among all entries
  let latestStopTime: string | null = null;
  if (!hasRunningEntry) {
    const entriesWithStop = entries.filter((e) => e.stop);
    if (entriesWithStop.length > 0) {
      latestStopTime = entriesWithStop.reduce((latest, current) => {
        return new Date(current.stop!).getTime() >
          new Date(latest.stop!).getTime()
          ? current
          : latest;
      }).stop!;
    }
  }

  // Sort entries for display (reverse chronological - newest first, matching table order)
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
  );

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Allow navigation between buttons when they're focused
      if (document.activeElement === confirmButtonRef.current) {
        e.preventDefault();
        cancelButtonRef.current?.focus();
      } else if (document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        confirmButtonRef.current?.focus();
      }
    } else if (e.key === "Enter") {
      if (document.activeElement === confirmButtonRef.current) {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/20">
              <Merge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <DialogTitle className="text-left">
              Combine {entries.length}{" "}
              {entries.length === 1 ? "Entry" : "Entries"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            {reverse
              ? "The most recent entry will be extended to span from the earliest start to the latest stop time. All other entries will be deleted."
              : "The earliest entry will be extended to the latest stop time. All other entries will be deleted."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <span className="text-xs font-medium text-muted-foreground uppercase block">
              Entries to Combine ({entries.length})
            </span>
            <div className="space-y-2">
              {sortedEntries.slice(0, 5).map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  isKept={entry.id === entryToKeep.id}
                  formatTime={formatTime}
                />
              ))}
              {entries.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ... and {entries.length - 5} more
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase block">
              Result Preview
            </span>
            <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-3 border border-green-200 dark:border-green-800">
              <p className="text-sm font-medium text-foreground">
                {entryToKeep.description || "(no description)"}
              </p>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: entryToKeep.project_color || "#6b7280",
                  }}
                />
                <p className="text-xs text-muted-foreground truncate min-w-0">
                  {entryToKeep.project_name || "No Project"}
                </p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-medium truncate">
                {formatDate(earliestEntry.start)} •{" "}
                {formatTime(earliestEntry.start)} →{" "}
                {hasRunningEntry
                  ? "Running"
                  : latestStopTime
                  ? formatTime(latestStopTime)
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button ref={confirmButtonRef} onClick={handleConfirm}>
            Combine {entries.length}{" "}
            {entries.length === 1 ? "Entry" : "Entries"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
