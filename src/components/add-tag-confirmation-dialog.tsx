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
import { Tag as TagIcon } from "lucide-react";
import { format } from "date-fns";
import type { TimeEntry, Tag } from "../types";
import { TagSelector } from "./tag-selector";

interface AddTagConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TimeEntry[];
  availableTags: Tag[];
  onConfirm: (tagNames: string[]) => void;
  onTagCreated: (tag: Tag) => void;
}

export function AddTagConfirmationDialog({
  open,
  onOpenChange,
  entries,
  availableTags,
  onConfirm,
  onTagCreated,
}: AddTagConfirmationDialogProps) {
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      setSelectedTags([]);
      // Auto-open the tag selector after a short delay
      setTimeout(() => {
        setIsTagSelectorOpen(true);
      }, 100);
    } else {
      setIsTagSelectorOpen(false);
    }
  }, [open]);

  // Focus the Add button when tags are selected and selector closes
  React.useEffect(() => {
    if (!isTagSelectorOpen && selectedTags.length > 0 && open) {
      setTimeout(() => {
        addButtonRef.current?.focus();
      }, 50);
    }
  }, [isTagSelectorOpen, selectedTags.length, open]);

  if (entries.length === 0) return null;

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "h:mm a");
    } catch {
      return dateStr;
    }
  };

  const handleConfirm = () => {
    if (selectedTags.length > 0) {
      onConfirm(selectedTags);
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // First escape closes the tag selector, second escape closes the dialog
      if (isTagSelectorOpen) {
        setIsTagSelectorOpen(false);
      } else {
        onOpenChange(false);
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Allow navigation between buttons when they're focused
      if (document.activeElement === addButtonRef.current) {
        e.preventDefault();
        cancelButtonRef.current?.focus();
      } else if (document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        addButtonRef.current?.focus();
      }
    } else if (e.key === "Enter") {
      // If Add button is focused and has tags selected, confirm
      if (document.activeElement === addButtonRef.current && selectedTags.length > 0) {
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
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
              <TagIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <DialogTitle className="text-left">
              Add Tags to {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Select tags to add to {entries.length} selected time{" "}
            {entries.length === 1 ? "entry" : "entries"}. Existing tags will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Tags</label>
            <TagSelector
              currentTags={selectedTags}
              onTagsChange={setSelectedTags}
              availableTags={availableTags}
              onOpenChange={setIsTagSelectorOpen}
              isOpen={isTagSelectorOpen}
              closeOnSelect={true}
              onNavigateNext={() => {
                // When user presses Tab in tag selector, close it and focus Add button
                setIsTagSelectorOpen(false);
              }}
              onNavigatePrev={() => {}}
              onTagCreated={onTagCreated}
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <span className="text-xs font-medium text-muted-foreground uppercase block">
              Affected Entries ({entries.length})
            </span>
            <div className="space-y-2">
              {entries.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md bg-muted/50 p-2.5 border border-border/60 min-w-0"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.description || "(no description)"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: entry.project_color || "#6b7280" }}
                    />
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.project_name || "No Project"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {formatTime(entry.start)} →{" "}
                    {entry.stop ? formatTime(entry.stop) : "Running"}
                  </p>
                </div>
              ))}
              {entries.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ... and {entries.length - 5} more
                </p>
              )}
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
            ref={addButtonRef}
            onClick={handleConfirm}
            disabled={selectedTags.length === 0}
          >
            Add Tags to {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

