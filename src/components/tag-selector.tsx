"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import React from "react";
import type { Tag } from "../types";
import { toast } from "@/lib/toast";

interface TagSelectorProps {
  currentTags: string[];
  onTagsChange?: (newTags: string[]) => void;
  availableTags: Tag[];
  onOpenChange?: (isOpen: boolean) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onTagCreated?: (tag: Tag) => void;
  "data-testid"?: string;
}

export function TagSelector({
  currentTags,
  onTagsChange,
  availableTags,
  onOpenChange,
  onNavigateNext,
  onNavigatePrev,
  onTagCreated,
  "data-testid": dataTestId,
}: TagSelectorProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [isChanging, setIsChanging] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [newTagName, setNewTagName] = React.useState("");
  const [isCreatingTag, setIsCreatingTag] = React.useState(false);

  // Notify parent of open state changes
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Create options array (selected tags first, then filtered available tags)
  const allOptions = React.useMemo(() => {
    const searchQuery = searchTerm.trim().toLowerCase();

    // Filter tags based on search
    const filteredTags = searchQuery
      ? availableTags.filter((tag) =>
          tag.name.toLowerCase().includes(searchQuery)
        )
      : availableTags;

    // Separate selected and unselected tags
    const selectedTags = filteredTags.filter((tag) =>
      currentTags.includes(tag.name)
    );
    const unselectedTags = filteredTags.filter(
      (tag) => !currentTags.includes(tag.name)
    );

    // Return selected tags first, then unselected
    return [...selectedTags, ...unselectedTags];
  }, [availableTags, searchTerm, currentTags]);

  // Reset highlighted index when options change
  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [allOptions]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleToggleTag = async (tagName: string) => {
    setIsChanging(true);

    // Brief delay for smooth animation
    await new Promise((resolve) => setTimeout(resolve, 150));

    const newTags = currentTags.includes(tagName)
      ? currentTags.filter((tag) => tag !== tagName)
      : [...currentTags, tagName];

    onTagsChange?.(newTags);
    setSearchTerm("");
    setHighlightedIndex(0);
    setIsChanging(false);
  };

  const handleRemoveTag = async (tagName: string) => {
    setIsChanging(true);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const newTags = currentTags.filter((tag) => tag !== tagName);
    onTagsChange?.(newTags);
    setIsChanging(false);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Tag name is required");
      return;
    }

    setIsCreatingTag(true);
    try {
      const sessionToken = localStorage.getItem("toggl_session_token");
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-toggl-session-token": sessionToken || "",
        },
        body: JSON.stringify({
          name: newTagName.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create tag");
      }

      const newTag = await response.json();
      toast.success(`Tag "${newTag.name}" created`);

      // Notify parent to refresh tags list
      onTagCreated?.({
        id: newTag.id,
        name: newTag.name,
      });

      // Add the newly created tag to current tags directly
      const newTags = [...currentTags, newTag.name];
      onTagsChange?.(newTags);

      // Reset creation state
      setIsCreating(false);
      setNewTagName("");
    } catch (error) {
      console.error("Error creating tag:", error);
      toast.error("Failed to create tag");
    } finally {
      setIsCreatingTag(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < allOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (allOptions[highlightedIndex]) {
          handleToggleTag(allOptions[highlightedIndex].name);
        }
        break;
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown and move to next/previous cell
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(0);
        setTimeout(() => {
          if (e.shiftKey) {
            onNavigatePrev?.();
          } else {
            onNavigateNext?.();
          }
        }, 100);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(0);
        break;
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Focus search input when opening
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Reset state when closing
      setSearchTerm("");
      setHighlightedIndex(0);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          data-testid={dataTestId}
          className={cn(
            "w-full justify-start border-none shadow-none hover:bg-accent/40 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-2 rounded-md transition-all duration-200 group",
            "hover:scale-[1.01] active:scale-[0.99]",
            isChanging && "opacity-60 scale-[0.99]"
          )}
        >
          <div className="flex items-center w-full min-h-[20px]">
            {currentTags.length > 0 ? (
              <div className="flex flex-wrap gap-1 flex-1 mr-2">
                {currentTags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-md transition-all duration-200 hover:bg-primary/20"
                  >
                    {tag}
                    <X
                      className="h-3 w-3 hover:text-primary/70 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag(tag);
                      }}
                    />
                  </span>
                ))}
                {currentTags.length > 3 && (
                  <span className="text-xs text-muted-foreground px-2 py-0.5">
                    +{currentTags.length - 3} more
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground flex-1 text-sm">
                No tags
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 opacity-50 transition-all duration-200",
                "group-hover:opacity-70",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto min-w-[var(--radix-popover-trigger-width)] max-w-80 p-0 border-border/60"
        align="start"
      >
        <div className="flex items-center border-b border-border/40 px-3 py-2 w-32">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 transition-colors" />
          <Input
            ref={searchInputRef}
            placeholder="Search tags..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            className="h-8 border-none px-2 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
            autoComplete="off"
          />
        </div>
        <div className="max-h-[200px] overflow-auto">
          {!isCreating ? (
            <>
              {allOptions.length > 0 ? (
                allOptions.map((option, index) => {
                  const isSelected = currentTags.includes(option.name);
                  const isFirstUnselected =
                    index > 0 &&
                    currentTags.includes(allOptions[index - 1].name) &&
                    !isSelected;

                  return (
                    <React.Fragment key={option.id}>
                      {isFirstUnselected && (
                        <div className="h-px bg-border/40 mx-3 my-1" />
                      )}
                      <div
                        className={cn(
                          "relative flex cursor-pointer select-none items-center px-3 py-2.5 text-sm transition-all duration-150",
                          "hover:bg-accent/60 hover:text-accent-foreground",
                          "active:scale-[0.98] active:bg-accent/80",
                          index === highlightedIndex &&
                            "bg-gray-200 dark:bg-gray-700 text-foreground",
                          isSelected && "font-medium bg-primary/5"
                        )}
                        onClick={() => handleToggleTag(option.name)}
                      >
                        <div className="flex items-center w-full">
                          <span
                            className={cn(
                              "transition-colors duration-200",
                              index === highlightedIndex && "text-foreground font-medium"
                            )}
                          >
                            {option.name}
                          </span>
                        </div>
                        {isSelected && (
                          <Check className="ml-auto h-4 w-4 shrink-0 text-primary animate-in fade-in-0 zoom-in-50 duration-200" />
                        )}
                      </div>
                    </React.Fragment>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center animate-in fade-in-0 duration-200">
                  {searchTerm.trim()
                    ? `No tags found matching "${searchTerm}"`
                    : "No tags available"}
                </div>
              )}
              <div className="border-t border-border/40 p-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm"
                  onClick={() => setIsCreating(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Tag
                </Button>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-3">
              <div>
                <Input
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateTag();
                    } else if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewTagName("");
                    }
                  }}
                  autoFocus
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateTag}
                  disabled={isCreatingTag}
                  className="flex-1"
                >
                  {isCreatingTag ? "Creating..." : "Create"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setNewTagName("");
                  }}
                  disabled={isCreatingTag}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
