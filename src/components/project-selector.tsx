"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import type { Project } from "../types";

interface ProjectSelectorProps {
  currentProject: string;
  currentProjectColor?: string;
  onProjectChange?: (newProject: string) => void;
  projects: Project[];
  onOpenChange?: (isOpen: boolean) => void;
  onNavigateNext?: () => void;
  "data-testid"?: string;
}

export function ProjectSelector({
  currentProject,
  currentProjectColor,
  onProjectChange,
  projects,
  onOpenChange,
  onNavigateNext,
  "data-testid": dataTestId,
}: ProjectSelectorProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const [isChanging, setIsChanging] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Notify parent of open state changes
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Create options array (No Project + filtered projects)
  const allOptions = React.useMemo(() => {
    const noProjectOption = { id: -1, name: "No Project", color: "" };

    if (!searchTerm.trim()) {
      return [noProjectOption, ...projects];
    }

    const filtered = projects.filter((project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Only include "No Project" if it matches the search term
    const options = [];
    if ("No Project".toLowerCase().includes(searchTerm.toLowerCase())) {
      options.push(noProjectOption);
    }
    options.push(...filtered);

    return options;
  }, [projects, searchTerm]);

  // Reset highlighted index when options change
  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [allOptions]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSelect = async (projectName: string) => {
    setIsChanging(true);

    // Brief delay for smooth animation
    await new Promise((resolve) => setTimeout(resolve, 150));

    onProjectChange?.(projectName);
    setIsOpen(false);
    setSearchTerm("");
    setHighlightedIndex(0);
    setIsChanging(false);
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
          handleSelect(allOptions[highlightedIndex].name);
        }
        break;
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown and move to next cell
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(0);
        setTimeout(() => {
          onNavigateNext?.();
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
          <div className="flex items-center truncate">
            {currentProjectColor && (
              <div
                className="w-3 h-3 rounded-full mr-2 shrink-0 transition-all duration-200 group-hover:scale-110"
                style={{ backgroundColor: currentProjectColor }}
              />
            )}
            <span
              className="truncate transition-all duration-200 group-hover:translate-x-0.5 mr-1"
              style={{ color: currentProjectColor || "inherit" }}
            >
              {currentProject || "No Project"}
            </span>
          </div>
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 opacity-50 transition-all duration-200",
              "group-hover:opacity-70",
              isOpen && "rotate-180"
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0 border-border/60"
        align="start"
      >
        <div className="flex items-center border-b border-border/40 px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 transition-colors" />
          <Input
            ref={searchInputRef}
            placeholder="Search projects..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            className="h-8 border-none px-2 focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
            autoComplete="off"
          />
        </div>
        <div className="max-h-[200px] overflow-auto">
          {allOptions.length > 0 ? (
            allOptions.map((option, index) => (
              <div
                key={option.id}
                className={cn(
                  "relative flex cursor-pointer select-none items-center px-3 py-2.5 text-sm transition-all duration-150",
                  "hover:bg-accent/60 hover:text-accent-foreground",
                  "active:scale-[0.98] active:bg-accent/80",
                  index === highlightedIndex &&
                    "bg-accent/40 text-accent-foreground",
                  option.name === currentProject && "font-medium bg-primary/5"
                )}
                onClick={() => handleSelect(option.name)}
              >
                <div className="flex items-center w-full">
                  {option.color && (
                    <div
                      className="w-3 h-3 rounded-full mr-2 shrink-0 transition-all duration-200 hover:scale-110"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span
                    className="truncate transition-colors duration-200"
                    style={{ color: option.color || "inherit" }}
                  >
                    {option.name}
                  </span>
                </div>
                {option.name === currentProject && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary animate-in fade-in-0 zoom-in-50 duration-200" />
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-6 text-sm text-muted-foreground text-center animate-in fade-in-0 duration-200">
              No projects found matching &ldquo;{searchTerm}&rdquo;
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
