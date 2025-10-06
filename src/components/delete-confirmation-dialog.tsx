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
  const [focusedButton, setFocusedButton] = React.useState<'delete' | 'cancel'>('delete');

  // Focus the delete button when dialog opens
  React.useEffect(() => {
    if (open && deleteButtonRef.current) {
      // Small delay to ensure dialog is fully mounted
      setTimeout(() => {
        deleteButtonRef.current?.focus();
        setFocusedButton('delete');
      }, 100);
    }
  }, [open]);

  // Handle focus changes
  React.useEffect(() => {
    if (!open) return;

    if (focusedButton === 'delete') {
      deleteButtonRef.current?.focus();
    } else {
      cancelButtonRef.current?.focus();
    }
  }, [focusedButton, open]);

  if (!entry) return null;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (focusedButton === 'delete') {
        handleConfirm();
      } else {
        onOpenChange(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedButton(prev => prev === 'delete' ? 'cancel' : 'delete');
    } else if (e.key === "Tab") {
      e.preventDefault();
      setFocusedButton(prev => prev === 'delete' ? 'cancel' : 'delete');
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" onKeyDown={handleKeyDown}>
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

        <div className="space-y-3">
          <div className="rounded-lg bg-gray-100 dark:bg-gray-900/50 p-4 space-y-2">
            <div>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                Description:
              </span>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                {entry.description || "(no description)"}
              </p>
            </div>
            <div>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                Project:
              </span>
              <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                {entry.project_name || "No Project"}
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
