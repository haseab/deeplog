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
import type { TimeEntry } from "@/types";
import { AlertTriangle, ArrowDown, Plus } from "lucide-react";
import { format } from "date-fns";
import * as React from "react";

interface CombineEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEntry: TimeEntry | null;
  previousEntry: TimeEntry | null;
  onConfirm: () => void;
}

export function CombineEntryDialog({
  open,
  onOpenChange,
  currentEntry,
  previousEntry,
  onConfirm,
}: CombineEntryDialogProps) {
  const combineButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        combineButtonRef.current?.focus();
      }, 100);
    }
  }, [open]);

  if (!currentEntry || !previousEntry) return null;

  const isCurrentEntryRunning = !currentEntry.stop || currentEntry.duration === -1;

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "h:mm a");
    } catch {
      return dateStr;
    }
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      // Switch focus between buttons
      if (document.activeElement === combineButtonRef.current) {
        cancelButtonRef.current?.focus();
      } else {
        combineButtonRef.current?.focus();
      }
    } else if (e.key === "Enter" || e.key === "Escape") {
      e.stopPropagation();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] overflow-hidden" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <DialogTitle className="text-left">Combine Time Entries</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            This will delete one entry and extend the other.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 min-w-0">
          {/* Step 1: Entry to be extended */}
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase block">
              Extend
            </span>
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/10 p-2.5 border border-blue-200 dark:border-blue-800 overflow-hidden">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {previousEntry.description || "(no description)"}
              </p>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: previousEntry.project_color || "#6b7280" }}
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {previousEntry.project_name || "No Project"}
                </p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                {formatTime(previousEntry.start)} → {previousEntry.stop ? formatTime(previousEntry.stop) : "Running"}
              </p>
            </div>
          </div>

          {/* Plus icon */}
          <div className="flex items-center pt-6">
            <Plus className="h-4 w-4 text-gray-400 flex-shrink-0" />
          </div>

          {/* Step 2: Entry to be deleted */}
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase block">
              Delete
            </span>
            <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-2.5 border border-red-200 dark:border-red-800 overflow-hidden">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {currentEntry.description || "(no description)"}
              </p>
              <div className="flex items-center gap-1.5 mt-1 min-w-0">
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: currentEntry.project_color || "#6b7280" }}
                />
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {currentEntry.project_name || "No Project"}
                </p>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                {formatTime(currentEntry.start)} → {currentEntry.stop ? formatTime(currentEntry.stop) : "Running"}
              </p>
            </div>
          </div>
        </div>

        {/* Arrow down */}
        <div className="flex items-center justify-center -my-1">
          <ArrowDown className="h-4 w-4 text-gray-400" />
        </div>

        {/* Result */}
        <div className="space-y-1">
          <span className="text-xs font-bold text-green-600 dark:text-green-400 uppercase block">
            Result
          </span>
          <div className="rounded-md bg-green-50 dark:bg-green-900/10 p-2.5 border border-green-200 dark:border-green-800 overflow-hidden">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {previousEntry.description || "(no description)"}
            </p>
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: previousEntry.project_color || "#6b7280" }}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {previousEntry.project_name || "No Project"}
              </p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
              {formatTime(previousEntry.start)} → {isCurrentEntryRunning ? "Running" : formatTime(currentEntry.stop!)}
            </p>
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
          <Button
            ref={combineButtonRef}
            variant="destructive"
            onClick={handleConfirm}
          >
            Combine Entries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
