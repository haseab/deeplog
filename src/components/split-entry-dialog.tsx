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
}

export function SplitEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  entryDescription,
}: SplitEntryDialogProps) {
  const [offsetMinutes, setOffsetMinutes] = React.useState("5");
  const [error, setError] = React.useState("");

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when input receives focus
    e.target.select();
  };

  const handleConfirm = (isReverse = false) => {
    const minutes = parseInt(offsetMinutes);

    if (isNaN(minutes) || minutes < 0) {
      setError("Please enter a number 0 or greater");
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
            {entryDescription && (
              <span className="block mt-1 font-medium text-foreground/80">
                &quot;{entryDescription}&quot;
              </span>
            )}
            <span className="block mt-2">
              How many minutes from the end do you want to split?
            </span>
            <span className="block mt-1 text-xs text-muted-foreground">
              Press Option+Enter to split from the start instead
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="offsetMinutes" className="text-right">
              Minutes
            </Label>
            <Input
              id="offsetMinutes"
              type="number"
              min="0"
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
          <Button onClick={handleConfirm}>
            Split Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
