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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as React from "react";

interface SplitEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (offsetMinutes: number, isReverse?: boolean) => void;
  entryDescription?: string;
  entryProjectName?: string;
  entryProjectColor?: string;
}

export function SplitEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  entryDescription,
  entryProjectName,
  entryProjectColor,
}: SplitEntryDialogProps) {
  const [offsetMinutes, setOffsetMinutes] = React.useState("5");
  const [error, setError] = React.useState("");

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when input receives focus
    e.target.select();
  };

  const handleConfirm = (isReverse = false) => {
    const minutes = parseInt(offsetMinutes);

    if (isNaN(minutes)) {
      setError("Please enter a valid number");
      return;
    }

    onConfirm(minutes, isReverse);
    onOpenChange(false);
    setOffsetMinutes("5");
    setError("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setOffsetMinutes("5");
      setError("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Split Time Entry</DialogTitle>
          <DialogDescription>
            <span className="block mt-2">
              How many minutes from the end do you want to split?
            </span>
            <span className="block mt-1 text-xs text-muted-foreground">
              Enter a negative value (e.g., -7) to create a new entry starting at the end time and extending forward
            </span>
            <span className="block mt-1 text-xs text-muted-foreground">
              Press Option+Enter to split from the start instead
            </span>
          </DialogDescription>
        </DialogHeader>
        
        {(entryDescription || entryProjectName) && (
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase block">
              Entry to Split
            </span>
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/10 p-2.5 border border-blue-200 dark:border-blue-800 min-w-0">
              {entryDescription && (
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words line-clamp-3 overflow-hidden text-ellipsis">
                  {entryDescription}
                </p>
              )}
              {entryProjectName && (
                <div className="flex items-center gap-1.5 mt-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entryProjectColor || "#6b7280" }}
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {entryProjectName || "No Project"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="offsetMinutes" className="text-right">
              Minutes
            </Label>
            <Input
              id="offsetMinutes"
              type="number"
              value={offsetMinutes}
              onChange={(e) => {
                setOffsetMinutes(e.target.value);
                setError("");
              }}
              onFocus={handleInputFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm(e.altKey);
                }
              }}
              className="col-span-3"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={() => handleConfirm(false)}>
            Split Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
