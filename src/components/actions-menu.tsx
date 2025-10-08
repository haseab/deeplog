"use client";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MoreVertical } from "lucide-react";
import * as React from "react";
interface ActionsMenuProps {
  onPin?: () => void;
  onUnpin?: () => void;
  isPinned?: boolean;
  onDuplicate?: () => void;
  onSplit?: () => void;
  onStartEntry?: () => void;
  onCopyId?: () => void;
  onDelete?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
  onNavigateNext?: () => void;
  isSelected?: boolean;
  "data-testid"?: string;
}

export function ActionsMenu({
  onPin,
  onUnpin,
  isPinned = false,
  onDuplicate,
  onSplit,
  onStartEntry,
  onCopyId,
  onDelete,
  onOpenChange,
  onNavigateNext,
  isSelected = false,
  "data-testid": dataTestId,
}: ActionsMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Menu options array for easier navigation
  const menuOptions = [
    isPinned
      ? { label: "Unpin", action: onUnpin || (() => {}) }
      : { label: "Pin", action: onPin || (() => {}) },
    { label: "Duplicate", action: onDuplicate || (() => {}) },
    { label: "Split", action: onSplit || (() => {}) },
    { label: "Start entry", action: onStartEntry || (() => {}) },
    { label: "Copy ID", action: onCopyId || (() => {}) },
    { label: "Delete", action: onDelete || (() => {}), isDestructive: true },
  ];

  // Notify parent of open state changes
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Focus the menu content when opening and reset highlighted index
      setHighlightedIndex(0);
      setTimeout(() => {
        menuRef.current?.focus();
      }, 100);
    } else {
      // Reset any state when closing (similar to ProjectSelector)
      setHighlightedIndex(0);
    }
  };

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false); // Close menu after action
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < menuOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (menuOptions[highlightedIndex]) {
          handleAction(menuOptions[highlightedIndex].action);
        }
        break;
      case "Escape":
        console.log("🔵 ActionsMenu escape pressed");
        e.preventDefault();
        e.stopPropagation();
        console.log("🔵 ActionsMenu escape - setting isOpen to false");
        setIsOpen(false);
        break;
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        // Close menu and move to next cell
        setIsOpen(false);
        setTimeout(() => {
          onNavigateNext?.();
        }, 100);
        break;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-8 w-8 p-0 transition-all duration-200 hover:bg-accent/60 hover:scale-110 active:scale-95 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            isSelected
              ? "opacity-100 bg-accent/20 ring-1 ring-accent/30"
              : "opacity-0 group-hover:opacity-100"
          )}
          data-testid={dataTestId}
        >
          <span className="sr-only">Open menu</span>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-40 p-1 focus:outline-none focus:ring-0 focus-visible:ring-0"
      >
        <div
          ref={menuRef}
          className="flex flex-col focus:outline-none focus:ring-0 focus-visible:ring-0"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {menuOptions.map((option, index) => (
            <button
              key={option.label}
              onClick={() => handleAction(option.action)}
              className={cn(
                "px-3 py-2 text-sm text-left transition-colors duration-150 rounded-md cursor-pointer focus:outline-none focus:ring-0 focus-visible:ring-0",
                option.isDestructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "hover:bg-accent/60",
                index === highlightedIndex &&
                  "bg-accent/40 text-accent-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
