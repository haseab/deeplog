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
  onConfirm: (parts: number) => void;
  entryDescription?: string;
}

export function SplitEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  entryDescription,
}: SplitEntryDialogProps) {
  const [parts, setParts] = React.useState("2");
  const [error, setError] = React.useState("");

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all text when input receives focus
    e.target.select();
  };

  const handleConfirm = () => {
    const numParts = parseInt(parts);

    if (isNaN(numParts) || numParts < 2) {
      setError("Please enter a number of 2 or more");
      return;
    }

    if (numParts > 10) {
      setError("Maximum 10 parts allowed");
      return;
    }

    onConfirm(numParts);
    onOpenChange(false);
    setParts("2");
    setError("");
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setParts("2");
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
              How many equal parts do you want to split this entry into?
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="parts" className="text-right">
              Parts
            </Label>
            <Input
              id="parts"
              type="number"
              min="2"
              max="10"
              value={parts}
              onChange={(e) => {
                setParts(e.target.value);
                setError("");
              }}
              onFocus={handleInputFocus}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
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
