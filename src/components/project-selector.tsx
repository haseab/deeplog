"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import * as React from "react";
import type { Project } from "../types";
import { toast } from "@/lib/toast";

interface ProjectSelectorProps {
  currentProject: string;
  currentProjectColor?: string;
  onProjectChange?: (newProject: string) => void;
  projects: Project[];
  onOpenChange?: (isOpen: boolean) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onNavigateDown?: () => void;
  onProjectCreated?: (project: Project) => void;
  "data-testid"?: string;
}

// Common color palette for projects
const PROJECT_COLORS = [
  "#525266", "#e36a00", "#d92b2b", "#c56bff", "#8b46ff",
  "#06aaf5", "#00b5ad", "#4ecb73", "#d5d5d5", "#ffc800",
];

export function ProjectSelector({
  currentProject,
  currentProjectColor,
  onProjectChange,
  projects,
  onOpenChange,
  onNavigateNext,
  onNavigatePrev,
  onNavigateDown,
  onProjectCreated,
  "data-testid": dataTestId,
}: ProjectSelectorProps) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [newProjectName, setNewProjectName] = React.useState("");
  const [selectedColor, setSelectedColor] = React.useState(PROJECT_COLORS[0]);
  const [isCreatingProject, setIsCreatingProject] = React.useState(false);

  // Notify parent of open state changes
  React.useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Create options array (filtered projects + No Project at bottom)
  const allOptions = React.useMemo(() => {
    const noProjectOption = { id: -1, name: "No Project", color: "" };

    if (!searchTerm.trim()) {
      return [...projects, noProjectOption];
    }

    const filtered = projects.filter((project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Only include "No Project" if it matches the search term, but always at the end
    const options = [...filtered];
    if ("No Project".toLowerCase().includes(searchTerm.toLowerCase())) {
      options.push(noProjectOption);
    }

    return options;
  }, [projects, searchTerm]);

  // Reset highlighted index when options change
  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [allOptions]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleSelect = (projectName: string) => {
    onProjectChange?.(projectName);
    setIsOpen(false);
    setSearchTerm("");
    setHighlightedIndex(0);
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error("Project name is required");
      return;
    }

    setIsCreatingProject(true);
    try {
      const sessionToken = localStorage.getItem("toggl_session_token");
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-toggl-session-token": sessionToken || "",
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          color: selectedColor,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      const newProject = await response.json();
      toast.success(`Project "${newProject.name}" created`);

      // Notify parent to refresh projects list
      onProjectCreated?.({
        id: newProject.id,
        name: newProject.name,
        color: newProject.color,
      });

      // Select the newly created project
      handleSelect(newProject.name);

      // Reset creation state
      setIsCreating(false);
      setNewProjectName("");
      setSelectedColor(PROJECT_COLORS[0]);
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Failed to create project");
    } finally {
      setIsCreatingProject(false);
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
          handleSelect(allOptions[highlightedIndex].name);
          // Only navigate down if Cmd+Enter
          if (e.metaKey || e.ctrlKey) {
            onNavigateDown?.();
          }
        }
        break;
      case "Tab":
        e.preventDefault();
        e.stopPropagation();
        // Close dropdown and move to next/previous cell
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(0);
        if (e.shiftKey) {
          onNavigatePrev?.();
        } else {
          onNavigateNext?.();
        }
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
            "hover:scale-[1.01] active:scale-[0.99]"
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
        className="w-auto min-w-[var(--radix-popover-trigger-width)] max-w-80 p-0 border-border/60"
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
          {!isCreating ? (
            <>
              {allOptions.length > 0 ? (
                allOptions.map((option, index) => (
                  <div
                    key={option.id}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center px-3 py-2.5 text-sm transition-all duration-150",
                      "hover:bg-accent/60 hover:text-accent-foreground",
                      "active:scale-[0.98] active:bg-accent/80",
                      index === highlightedIndex &&
                        "bg-gray-200 dark:bg-gray-700 text-foreground",
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
                        className={cn(
                          "transition-colors duration-200",
                          index === highlightedIndex && "text-foreground font-medium"
                        )}
                        style={{
                          color: index === highlightedIndex
                            ? undefined
                            : (option.color || "inherit")
                        }}
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
              <div className="border-t border-border/40 p-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sm"
                  onClick={() => setIsCreating(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Project
                </Button>
              </div>
            </>
          ) : (
            <div className="p-3 space-y-3">
              <div>
                <Input
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateProject();
                    } else if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewProjectName("");
                    }
                  }}
                  autoFocus
                  className="text-sm"
                />
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Color</div>
                <div className="grid grid-cols-5 gap-2">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all duration-200 hover:scale-110",
                        selectedColor === color && "ring-2 ring-primary ring-offset-2"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedColor(color)}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateProject}
                  disabled={isCreatingProject}
                  className="flex-1"
                >
                  {isCreatingProject ? "Creating..." : "Create"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName("");
                  }}
                  disabled={isCreatingProject}
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
