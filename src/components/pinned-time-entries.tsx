"use client";

import { PinnedEntry } from "@/types";
import { Play, X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface PinnedTimeEntriesProps {
  pinnedEntries: PinnedEntry[];
  onUnpin: (id: string) => void;
  onStartTimer: (entry: PinnedEntry) => void;
  showShortcuts?: boolean;
}

export function PinnedTimeEntries({
  pinnedEntries,
  onUnpin,
  onStartTimer,
  showShortcuts = false,
}: PinnedTimeEntriesProps) {
  if (pinnedEntries.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-muted-foreground mb-3">
        Pinned Entries
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {pinnedEntries.map((entry, index) => (
          <PinnedEntryCard
            key={entry.id}
            entry={entry}
            index={index}
            onUnpin={onUnpin}
            onStartTimer={onStartTimer}
            showShortcut={showShortcuts}
          />
        ))}
      </div>
    </div>
  );
}

interface PinnedEntryCardProps {
  entry: PinnedEntry;
  index: number;
  onUnpin: (id: string) => void;
  onStartTimer: (entry: PinnedEntry) => void;
  showShortcut?: boolean;
}

function PinnedEntryCard({
  entry,
  index,
  onUnpin,
  onStartTimer,
  showShortcut = false,
}: PinnedEntryCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const shortcutNumber = index + 1;
  const displayShortcut = showShortcut && shortcutNumber <= 9;

  return (
    <div
      className="relative group cursor-pointer rounded-lg border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onStartTimer(entry)}
    >
      {/* Content */}
      <div
        className={cn(
          "p-3 space-y-1.5 transition-all duration-200",
          isHovered && "blur-[2px] opacity-70"
        )}
      >
        {/* Description - single line */}
        <p className="text-sm font-medium text-foreground truncate">
          {entry.description || "No description"}
        </p>

        {/* Project and Tags on same line */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.project_color }}
            />
            <span className="text-xs text-muted-foreground truncate">
              {entry.project_name || "No Project"}
            </span>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex gap-1 flex-shrink-0">
              {entry.tags.map((tag, index) => (
                <span
                  key={index}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-accent/50 text-accent-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard shortcut badge */}
      {displayShortcut && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded bg-muted/80 backdrop-blur-sm flex items-center justify-center shadow-sm z-10">
          <span className="text-xs font-semibold text-muted-foreground">
            {shortcutNumber}
          </span>
        </div>
      )}

      {/* Hover overlay */}
      <>
        {/* Play button */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300 ease-out",
            isHovered ? "opacity-100 scale-100" : "opacity-0 scale-90"
          )}
        >
          <div className="w-7 h-7 rounded-full bg-green-600/90 dark:bg-green-400/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
            <Play className="w-3.5 h-3.5 text-white dark:text-green-950 ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* Unpin button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnpin(entry.id);
          }}
          className={cn(
            "absolute top-2 left-2 w-5 h-5 rounded-full bg-destructive/90 backdrop-blur-sm hover:bg-destructive flex items-center justify-center transition-all duration-300 ease-out shadow-sm z-10",
            isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75"
          )}
          aria-label="Unpin entry"
        >
          <X className="w-3.5 h-3.5 text-destructive-foreground" />
        </button>
      </>
    </div>
  );
}
