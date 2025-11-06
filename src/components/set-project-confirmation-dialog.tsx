"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderOpen } from "lucide-react";
import { format } from "date-fns";
import type { TimeEntry, Project } from "../types";
import { ProjectSelector } from "./project-selector";

interface SetProjectConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: TimeEntry[];
  projects: Project[];
  onConfirm: (projectName: string) => void;
  onProjectCreated: (project: Project) => void;
}

export function SetProjectConfirmationDialog({
  open,
  onOpenChange,
  entries,
  projects,
  onConfirm,
  onProjectCreated,
}: SetProjectConfirmationDialogProps) {
  const [selectedProject, setSelectedProject] = React.useState<string>("");
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = React.useState(false);
  const setButtonRef = React.useRef<HTMLButtonElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) {
      setSelectedProject("");
      // Auto-open the project selector after a short delay
      setTimeout(() => {
        setIsProjectSelectorOpen(true);
      }, 100);
    } else {
      setIsProjectSelectorOpen(false);
    }
  }, [open]);

  // Focus the Set button when a project is selected and selector closes
  React.useEffect(() => {
    if (!isProjectSelectorOpen && selectedProject && open) {
      setTimeout(() => {
        setButtonRef.current?.focus();
      }, 50);
    }
  }, [isProjectSelectorOpen, selectedProject, open]);

  if (entries.length === 0) return null;

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "h:mm a");
    } catch {
      return dateStr;
    }
  };

  const handleConfirm = () => {
    if (selectedProject) {
      onConfirm(selectedProject);
      onOpenChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onOpenChange(false);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      // Allow navigation between buttons when they're focused
      if (document.activeElement === setButtonRef.current) {
        e.preventDefault();
        cancelButtonRef.current?.focus();
      } else if (document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        setButtonRef.current?.focus();
      }
    } else if (e.key === "Enter") {
      // If Set button is focused and has a project selected, confirm
      if (document.activeElement === setButtonRef.current && selectedProject) {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    }
  };

  const selectedProjectData = projects.find((p) => p.name === selectedProject);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/20">
              <FolderOpen className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <DialogTitle className="text-left">
              Set Project for {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Select a project to assign to {entries.length} selected time{" "}
            {entries.length === 1 ? "entry" : "entries"}. This will replace the current project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Project</label>
            <ProjectSelector
              currentProject={selectedProject}
              currentProjectColor={selectedProjectData?.color}
              onProjectChange={setSelectedProject}
              projects={projects}
              onOpenChange={setIsProjectSelectorOpen}
              isOpen={isProjectSelectorOpen}
              onNavigateNext={() => {
                // When user presses Tab in project selector, close it and focus Set button
                setIsProjectSelectorOpen(false);
              }}
              onNavigatePrev={() => {}}
              onNavigateDown={() => {}}
              onProjectCreated={onProjectCreated}
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <span className="text-xs font-medium text-muted-foreground uppercase block">
              Affected Entries ({entries.length})
            </span>
            <div className="space-y-2">
              {entries.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md bg-muted/50 p-2.5 border border-border/60 min-w-0"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.description || "(no description)"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 min-w-0">
                    <div
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: entry.project_color || "#6b7280" }}
                    />
                    <p className="text-xs text-muted-foreground truncate">
                      {entry.project_name || "No Project"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {formatTime(entry.start)} →{" "}
                    {entry.stop ? formatTime(entry.stop) : "Running"}
                  </p>
                </div>
              ))}
              {entries.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  ... and {entries.length - 5} more
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            ref={setButtonRef}
            onClick={handleConfirm}
            disabled={!selectedProject}
          >
            Set Project for {entries.length} {entries.length === 1 ? "Entry" : "Entries"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

