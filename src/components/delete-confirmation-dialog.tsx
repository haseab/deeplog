"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { TimeEntry } from "../types";

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry | null;
  onConfirm: () => void;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  entry,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const deleteButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        deleteButtonRef.current?.focus();
      }, 100);
    }
  }, [open]);

  if (!entry) return null;

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
      if (document.activeElement === deleteButtonRef.current) {
        cancelButtonRef.current?.focus();
      } else {
        deleteButtonRef.current?.focus();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    } else if (e.key === "Enter") {
      e.stopPropagation();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <DialogTitle className="text-left">Delete Time Entry</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Are you sure you want to delete this time entry? This action cannot
            be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase block">
            Entry to Delete
          </span>
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-2.5 border border-red-200 dark:border-red-800 overflow-hidden">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {entry.description || "(no description)"}
            </p>
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: entry.project_color || "#6b7280" }}
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {entry.project_name || "No Project"}
              </p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
              {formatTime(entry.start)} → {entry.stop ? formatTime(entry.stop) : "Running"}
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
            ref={deleteButtonRef}
            variant="destructive"
            onClick={handleConfirm}
          >
            Delete Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
