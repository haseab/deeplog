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
  onSplit?: () => void;
  onCombine?: () => void;
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
  onSplit,
  onCombine,
  onStartEntry,
  onCopyId,
  onDelete,
  onOpenChange,
  onNavigateNext,
  isSelected = false,
  "data-testid": dataTestId,
}: ActionsMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPersistent, setIsPersistent] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Menu options array for easier navigation
  const menuOptions = [
    { label: "🗑️ Delete", action: onDelete || (() => {}), isDestructive: true },
    { label: "✂️ Split", action: onSplit || (() => {}) },
    { label: "🔗 Combine", action: onCombine || (() => {}) },
    isPinned
      ? { label: "📌 Unpin", action: onUnpin || (() => {}) }
      : { label: "📌 Pin", action: onPin || (() => {}) },
    { label: "▶︎ Start", action: onStartEntry || (() => {}) },
  ];

  // Notify parent of open state changes
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const handleOpenChange = (open: boolean) => {
    // If closing and menu is persistent, don't close
    if (!open && isPersistent) {
      return;
    }

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
      setIsPersistent(false);
    }
  };

  const handleTriggerClick = () => {
    // Click makes it persistent
    setIsPersistent(true);
    setIsOpen(true);
  };

  const handleTriggerHover = () => {
    // Clear any pending close timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Open on hover if not already persistent
    if (!isPersistent) {
      setIsOpen(true);
    }
  };

  const handleTriggerLeave = () => {
    // Only close on hover leave if not persistent
    if (!isPersistent) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 200);
    }
  };

  const handleContentHover = () => {
    // Clear close timeout when hovering over content
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleContentLeave = () => {
    // Close when leaving content if not persistent
    if (!isPersistent) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 200);
    }
  };

  const handleAction = (action: () => void) => {
    action();
    setIsPersistent(false);
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
            "h-8 w-8 p-0 transition-all duration-200 hover:bg-accent/60 hover:scale-110 active:scale-95 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 opacity-100",
            isSelected && "bg-accent/20 ring-1 ring-accent/30"
          )}
          data-testid={dataTestId}
          onClick={handleTriggerClick}
          onMouseEnter={handleTriggerHover}
          onMouseLeave={handleTriggerLeave}
        >
          <span className="sr-only">Open menu</span>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="left"
        sideOffset={0}
        className="w-40 p-1 focus:outline-none focus:ring-0 focus-visible:ring-0"
        onMouseEnter={handleContentHover}
        onMouseLeave={handleContentLeave}
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
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                "px-3 py-2 text-sm text-left transition-colors duration-150 rounded-md cursor-pointer focus:outline-none focus:ring-0 focus-visible:ring-0",
                "hover:bg-accent/60 hover:text-accent-foreground",
                option.isDestructive && "text-destructive",
                index === highlightedIndex &&
                  "bg-gray-200 dark:bg-gray-700 text-foreground"
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
