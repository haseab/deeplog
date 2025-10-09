"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchRecentTimers, type RecentTimerEntry } from "@/lib/recent-timers-cache";

type Project = {
  id: number;
  name: string;
  color: string;
};

type Tag = {
  id: number;
  name: string;
};

interface RecentTimersPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchQuery: string;
  projects: Project[];
  availableTags: Tag[];
  maxResults?: number;
  onSelect: (entry: {
    description: string;
    projectId: number | null;
    tagIds: number[];
  }) => void;
  highlightedIndex: number;
  onHighlightedIndexChange: (index: number) => void;
  onTimersChange?: (timers: RecentTimerEntry[]) => void;
  children: React.ReactNode;
}

export function RecentTimersPopover({
  open,
  onOpenChange,
  searchQuery,
  projects,
  availableTags,
  maxResults = 10,
  onSelect,
  highlightedIndex,
  onHighlightedIndexChange,
  onTimersChange,
  children,
}: RecentTimersPopoverProps) {
  const [recentTimers, setRecentTimers] = React.useState<RecentTimerEntry[]>([]);

  React.useEffect(() => {
    if (open) {
      const results = searchRecentTimers(searchQuery, maxResults);
      setRecentTimers(results);

      // Notify parent of the current timers
      onTimersChange?.(results);

      // If no results found, close the popover state in parent
      // This ensures keyboard shortcuts work properly
      if (results.length === 0 && searchQuery.trim().length > 0) {
        onOpenChange(false);
      }
    }
  }, [open, searchQuery, maxResults, onTimersChange, onOpenChange]);

  // Clamp highlighted index to valid range
  React.useEffect(() => {
    if (recentTimers.length > 0) {
      if (highlightedIndex >= recentTimers.length) {
        onHighlightedIndexChange(recentTimers.length - 1);
      } else if (highlightedIndex < 0) {
        onHighlightedIndexChange(0);
      }
    }
  }, [recentTimers.length, highlightedIndex, onHighlightedIndexChange]);

  const getProjectById = (projectId: number | null) => {
    if (!projectId) return null;
    return projects.find((p) => p.id === projectId);
  };

  const getTagsByIds = (tagIds: number[]) => {
    return availableTags.filter((tag) => tagIds.includes(tag.id));
  };

  // Always render the Popover to avoid unmounting/remounting children
  return (
    <Popover open={open && recentTimers.length > 0} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[500px] p-2 border-border/60"
        align="start"
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Don't close when interacting with the editor
          const target = e.target as HTMLElement;
          if (target.closest('.editor-container')) {
            e.preventDefault();
          }
        }}
      >
        <div className="space-y-1">
          <div className="px-3 py-2 text-xs text-muted-foreground font-medium flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Recent Timers
          </div>
          {recentTimers.map((timer, index) => {
            const project = getProjectById(timer.projectId);
            const tags = getTagsByIds(timer.tagIds);

            return (
              <div
                key={index}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150 rounded-md cursor-pointer",
                  "hover:bg-gray-200 dark:hover:bg-gray-700",
                  "active:scale-[0.98]",
                  index === highlightedIndex && "bg-gray-200 dark:bg-gray-700"
                )}
                onClick={() => {
                  onSelect({
                    description: timer.description,
                    projectId: timer.projectId,
                    tagIds: timer.tagIds,
                  });
                  onOpenChange(false);
                }}
                onMouseEnter={() => onHighlightedIndexChange(index)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{timer.description}</div>
                  <div className="flex items-center gap-2 mt-1">
                    {project && (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="text-xs text-muted-foreground truncate">
                          {project.name}
                        </span>
                      </div>
                    )}
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
