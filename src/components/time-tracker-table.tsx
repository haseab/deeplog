"use client";

import { toast } from "@/lib/toast";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { Calendar as CalendarIcon, RefreshCw } from "lucide-react";
import React from "react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Project, SelectedCell, TimeEntry } from "../types";
import { ActionsMenu } from "./actions-menu";
import { ExpandableDescription } from "./expandable-description";
import { LiveDuration } from "./live-duration";
import { ProjectSelector } from "./project-selector";

const MemoizedTableRow = React.memo(
  function TableRowComponent({
    entry,
    rowIndex,
    selectedCell,
    onSelectCell,
    onDescriptionSave,
    onProjectChange,
    onDelete,
    projects,
    setIsEditingCell,
    setIsProjectSelectorOpen,
    setIsActionsMenuOpen,
    navigateToNextCell,
    isNewlyLoaded,
  }: {
    entry: TimeEntry;
    rowIndex: number;
    selectedCell: SelectedCell;
    onSelectCell: (rowIndex: number, cellIndex: number) => void;
    onDescriptionSave: (entryId: number) => (newDescription: string) => void;
    onProjectChange: (entryId: number) => (newProject: string) => void;
    onDelete: (entry: TimeEntry) => void;
    projects: Project[];
    setIsEditingCell: (editing: boolean) => void;
    setIsProjectSelectorOpen: (open: boolean) => void;
    setIsActionsMenuOpen: (open: boolean) => void;
    navigateToNextCell: () => void;
    isNewlyLoaded: boolean;
  }) {
    return (
      <TableRow
        key={entry.id}
        data-entry-id={entry.id}
        className={cn(
          "hover:bg-accent/20 transition-all duration-1000 border-border/40 group hover:shadow-sm",
          isNewlyLoaded && "bg-blue-100 dark:bg-blue-900/50"
        )}
      >
        <TableCell
          className={cn(
            "px-4 py-2 font-mono text-sm text-muted-foreground cursor-pointer sm:w-28 w-24",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 0 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 0)}
        >
          {format(new Date(entry.start), "yyyy-MM-dd")}
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 max-w-0 w-full cursor-pointer sm:max-w-0 max-w-[200px]",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 1 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 1)}
        >
          <ExpandableDescription
            description={entry.description || ""}
            onSave={(newDescription) =>
              onDescriptionSave(entry.id)(newDescription)
            }
            onEditingChange={setIsEditingCell}
            onNavigateNext={navigateToNextCell}
            data-testid="expandable-description"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 cursor-pointer sm:w-48 w-32",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 2 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 2)}
        >
          <ProjectSelector
            currentProject={entry.project_name || ""}
            currentProjectColor={entry.project_color}
            onProjectChange={(newProject) =>
              onProjectChange(entry.id)(newProject)
            }
            projects={projects}
            onOpenChange={setIsProjectSelectorOpen}
            onNavigateNext={navigateToNextCell}
            data-testid="project-selector"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 font-mono text-sm text-muted-foreground cursor-pointer sm:w-32 w-24",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 3 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 3)}
        >
          {format(new Date(entry.start), "h:mm a")} -{" "}
          {entry.stop ? format(new Date(entry.stop), "h:mm a") : "Now"}
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 font-mono text-sm cursor-pointer sm:w-24 w-20 min-w-[80px]",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 4 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 4)}
        >
          <div className="flex items-center gap-2 w-full min-w-[72px]">
            <LiveDuration
              startTime={entry.start}
              stopTime={entry.stop}
              staticDuration={entry.duration}
              className="group-hover:text-accent-foreground transition-colors duration-200 block min-w-[60px] text-center"
            />
            {!entry.stop && (
              <div className="relative flex-shrink-0">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75"></div>
              </div>
            )}
          </div>
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 cursor-pointer sm:w-16 w-12",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 5 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 5)}
        >
          <ActionsMenu
            onDuplicate={() => {
              // Implement duplicate logic
            }}
            onSplit={() => {
              // Implement split logic
            }}
            onStartEntry={() => {
              // Implement start entry logic
            }}
            onCopyId={() => {
              // Implement copy ID logic
            }}
            onDelete={() => onDelete(entry)}
            onOpenChange={setIsActionsMenuOpen}
            onNavigateNext={navigateToNextCell}
            isSelected={
              selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 5
            }
            data-testid="actions-menu"
          />
        </TableCell>
      </TableRow>
    );
  },
  (prevProps, nextProps) => {
    // Optimized comparison function - rerender if this row's selection state changed

    const prevSelectedInThisRow =
      prevProps.selectedCell?.rowIndex === prevProps.rowIndex;
    const nextSelectedInThisRow =
      nextProps.selectedCell?.rowIndex === nextProps.rowIndex;

    // If this row's selection state changed (selected/unselected), we need to rerender
    if (prevSelectedInThisRow !== nextSelectedInThisRow) {
      return false; // Rerender
    }

    // If this row is currently selected, check if the selected cell within the row changed
    if (nextSelectedInThisRow) {
      const prevCellIndex = prevProps.selectedCell?.cellIndex;
      const nextCellIndex = nextProps.selectedCell?.cellIndex;

      // If the selected cell within this row changed, we need to rerender
      if (prevCellIndex !== nextCellIndex) {
        return false; // Rerender
      }
    }

    // Return true if props are equal (should NOT rerender)
    const shouldNotRerender =
      prevProps.entry === nextProps.entry &&
      prevProps.rowIndex === nextProps.rowIndex &&
      prevProps.onSelectCell === nextProps.onSelectCell &&
      prevProps.onDescriptionSave === nextProps.onDescriptionSave &&
      prevProps.onProjectChange === nextProps.onProjectChange &&
      prevProps.onDelete === nextProps.onDelete &&
      prevProps.projects === nextProps.projects &&
      prevProps.setIsEditingCell === nextProps.setIsEditingCell &&
      prevProps.setIsProjectSelectorOpen ===
        nextProps.setIsProjectSelectorOpen &&
      prevProps.setIsActionsMenuOpen === nextProps.setIsActionsMenuOpen &&
      prevProps.navigateToNextCell === nextProps.navigateToNextCell;

    return shouldNotRerender;
  }
);

export function TimeTrackerTable() {
  const getDefaultDateRange = (): DateRange => {
    const today = new Date();
    const sevenDaysAgo = subDays(today, 7);
    return {
      from: startOfDay(sevenDaysAgo),
      to: endOfDay(today),
    };
  };

  const [date, setDate] = React.useState<DateRange | undefined>(
    getDefaultDateRange()
  );
  const [timeEntries, setTimeEntries] = React.useState<TimeEntry[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(false);
  const currentPageRef = React.useRef(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [selectedCell, setSelectedCell] = React.useState<SelectedCell>(null);
  const lastErrorToastRef = React.useRef<number>(0);

  const [isEditingCell, setIsEditingCell] = React.useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] =
    React.useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [newlyLoadedEntries, setNewlyLoadedEntries] = React.useState<
    Set<number>
  >(new Set());
  const tableRef = React.useRef<HTMLDivElement>(null);

  const showUpdateToast = React.useCallback(
    (message: string, undoAction: () => void, apiCall: () => Promise<void>) => {
      toast(message, {
        action: {
          label: "Undo",
          onClick: undoAction,
        },
        duration: 4000,
        onAutoClose: async () => {
          try {
            await apiCall();
          } catch (error) {
            console.error("API call failed:", error);
            const errorMessage =
              error instanceof Error && error.message
                ? error.message
                : "Failed to update entry. Please try again.";
            toast.error(errorMessage);
            undoAction();
          }
        },
      });
    },
    []
  );

  const handleDescriptionSave = React.useCallback(
    (entryId: number) => (newDescription: string) => {
      // Use functional update to avoid dependency on timeEntries
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Create updated entries
        const updatedEntries = currentEntries.map((entry) =>
          entry.id === entryId
            ? { ...entry, description: newDescription }
            : entry
        );

        showUpdateToast(
          "Description updated.",
          () => setTimeEntries(originalEntries),
          async () => {
            const apiKey = localStorage.getItem("toggl_api_key");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-api-key": apiKey || "",
              },
              body: JSON.stringify({ description: newDescription }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              // Create a more descriptive error message
              let errorMessage = `Failed to update description (${response.status})`;
              if (errorText.includes("Maximum length for description")) {
                errorMessage = "Description is too long (max 3000 characters)";
              } else if (errorText.includes("exceeded")) {
                errorMessage = "Description exceeds maximum length";
              } else if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              }

              throw new Error(errorMessage);
            }
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast]
  );

  const handleProjectChange = React.useCallback(
    (entryId: number) => (newProject: string) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Find the project color for optimistic update
        // We need to access projects from current scope, not dependency
        const selectedProject = projects.find((p) => p.name === newProject);
        const newProjectColor =
          newProject === "No Project" || newProject === ""
            ? "#6b7280"
            : selectedProject?.color || "#6b7280";

        // Create updated entries
        const updatedEntries = currentEntries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                project_name: newProject || "No Project",
                project_color: newProjectColor,
              }
            : entry
        );

        showUpdateToast(
          "Project updated.",
          () => setTimeEntries(originalEntries),
          async () => {
            const apiKey = localStorage.getItem("toggl_api_key");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-api-key": apiKey || "",
              },
              body: JSON.stringify({ project_name: newProject }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              let errorMessage = `Failed to update project (${response.status})`;
              if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              } else if (response.status === 400) {
                errorMessage = "Invalid project selection";
              }

              throw new Error(errorMessage);
            }
          }
        );

        return updatedEntries;
      });
    },
    [projects, showUpdateToast]
  );

  const handleDelete = React.useCallback(
    (entryToDelete: TimeEntry) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Create filtered entries
        const filteredEntries = currentEntries.filter(
          (entry) => entry.id !== entryToDelete.id
        );

        showUpdateToast(
          "Time entry deleted.",
          () => setTimeEntries(originalEntries),
          async () => {
            const apiKey = localStorage.getItem("toggl_api_key");
            const response = await fetch(
              `/api/time-entries/${entryToDelete.id}`,
              {
                method: "DELETE",
                headers: {
                  "x-toggl-api-key": apiKey || "",
                },
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              let errorMessage = `Failed to delete entry (${response.status})`;
              if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              } else if (response.status === 404) {
                errorMessage = "Entry not found";
              }

              throw new Error(errorMessage);
            }
          }
        );

        return filteredEntries;
      });
    },
    [showUpdateToast]
  );

  const startNewTimeEntry = React.useCallback(() => {
    const originalEntries = [...timeEntries];

    // Create new time entry starting now
    const now = new Date().toISOString();
    const tempId = -Date.now(); // Temporary negative ID

    // Find currently running entry (no stop time) for UI feedback
    const runningEntry = timeEntries.find((entry) => !entry.stop);

    const newEntry: TimeEntry = {
      id: tempId,
      description: "",
      project_name: "No Project",
      project_color: "#6b7280",
      start: now,
      stop: "", // Empty stop means it's running
      duration: 0,
    };

    // Optimistically add the new entry to the beginning
    // Backend will handle stopping any running timer
    setTimeEntries([newEntry, ...timeEntries]);

    // Select the new entry's description field for immediate editing
    setTimeout(() => {
      setSelectedCell({ rowIndex: 0, cellIndex: 0 });
    }, 50);

    // Make the API call immediately to ensure precise timing
    const apiKey = localStorage.getItem("toggl_api_key");
    let createdEntryId: number | null = null;

    (async () => {
      try {
        const response = await fetch("/api/time-entries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-toggl-api-key": apiKey || "",
          },
          body: JSON.stringify({
            description: "",
            start: now,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error:", response.status, errorText);
          throw new Error("Failed to create entry");
        }

        const createdEntry = await response.json();
        createdEntryId = createdEntry.id;

        // Replace the temporary entry with the real one from the server
        setTimeEntries((prev) =>
          prev.map((entry) =>
            entry.id === tempId ? { ...newEntry, id: createdEntry.id } : entry
          )
        );

        // Refresh data to get the updated state (including stopped timer)
        setTimeout(() => {
          fetchData(false);
        }, 500);
      } catch (error) {
        console.error("Failed to create time entry:", error);
        toast.error("Failed to create time entry. Please try again.");
        setTimeEntries(originalEntries);
      }
    })();

    toast("New time entry started", {
      description: runningEntry
        ? `Stopped previous timer and started new one at ${new Date().toLocaleTimeString()}`
        : `Started tracking time at ${new Date().toLocaleTimeString()}`,
      action: {
        label: "Undo",
        onClick: async () => {
          // Revert UI immediately
          setTimeEntries(originalEntries);

          // If the API call succeeded, delete the created entry
          if (createdEntryId) {
            try {
              await fetch(`/api/time-entries/${createdEntryId}`, {
                method: "DELETE",
                headers: {
                  "x-toggl-api-key": apiKey || "",
                },
              });

              // Refresh data to restore any stopped timer
              setTimeout(() => {
                fetchData(false);
              }, 500);
            } catch (error) {
              console.error("Failed to undo time entry creation:", error);
              // UI is already reverted, just refresh to get accurate state
              fetchData(false);
            }
          } else {
            // API call hasn't completed yet or failed, just refresh
            fetchData(false);
          }
        },
      },
    });
  }, [timeEntries]);

  const fetchData = React.useCallback(
    async (showLoadingState = true, resetData = true) => {
      if (!date?.from || !date?.to) return;

      // Only show main loading state for initial loads, not infinite scroll
      if (showLoadingState && resetData) setLoading(true);
      const fromISO = date.from.toISOString();
      const toISO = date.to.toISOString();

      const pageToFetch = resetData ? 0 : currentPageRef.current + 1;
      const limit = resetData ? 100 : 25;

      // Get credentials from localStorage
      const apiKey = localStorage.getItem("toggl_api_key");

      try {
        const response = await fetch(
          `/api/time-entries?start_date=${fromISO}&end_date=${toISO}&page=${pageToFetch}&limit=${limit}`,
          {
            headers: {
              "x-toggl-api-key": apiKey || "",
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Handle the new response structure
        if (data.timeEntries && data.projects && data.pagination) {
          if (resetData) {
            setTimeEntries(data.timeEntries);
            setNewlyLoadedEntries(new Set()); // Clear new entries on reset
            currentPageRef.current = 0;
          } else {
            // Filter out duplicates by ID to prevent React key conflicts
            setTimeEntries((prev) => {
              const existingIds = new Set(
                prev.map((entry: TimeEntry) => entry.id)
              );
              const newEntries = data.timeEntries.filter(
                (entry: TimeEntry) => !existingIds.has(entry.id)
              );

              // Track newly loaded entry IDs
              const newEntryIds = new Set<number>(
                newEntries.map((entry: TimeEntry) => entry.id)
              );
              setNewlyLoadedEntries(newEntryIds);

              // Clear the highlighting after 3 seconds
              setTimeout(() => {
                setNewlyLoadedEntries(new Set());
              }, 3000);

              return [...prev, ...newEntries];
            });
            currentPageRef.current = pageToFetch;
          }
          setProjects(data.projects);
          setHasMore(data.pagination.hasMore);
        } else {
          // Handle error or empty response
          if (resetData) {
            setTimeEntries([]);
            setProjects([]);
            setHasMore(false);
          }
        }
      } catch (error) {
        console.error("API Error:", error);
        // Only show toast for initial load, not for infinite scroll loads
        // And debounce error toasts to prevent spam
        if (resetData) {
          const now = Date.now();
          if (now - lastErrorToastRef.current > 5000) {
            // Max one error toast per 5 seconds
            toast.error("Failed to fetch data.");
            lastErrorToastRef.current = now;
          }
        }
        // For infinite scroll loads, just throw the error to be handled by the hook
        if (!resetData) {
          throw error;
        }
      } finally {
        if (showLoadingState && resetData) setLoading(false);
      }
    },
    [date]
  );

  // Load more function for infinite scrolling
  const loadMore = React.useCallback(async () => {
    if (!hasMore || loading || isLoadingMore) return;

    setIsLoadingMore(true);
    currentPageRef.current += 1;
    await fetchData(false, false);
    setIsLoadingMore(false);
  }, [hasMore, loading, isLoadingMore, fetchData]);

  // Optimized activateCell using React.useCallback to prevent recreation
  const activateCell = React.useCallback(
    (rowIndex: number, cellIndex: number) => {
      const entry = timeEntries[rowIndex];
      if (!entry) return;

      // Use requestAnimationFrame to defer DOM queries to next tick
      requestAnimationFrame(() => {
        switch (cellIndex) {
          case 1: // Description
            const descriptionElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="expandable-description"]`
            ) as HTMLElement;
            if (descriptionElement) {
              descriptionElement.click();
            }
            break;
          case 2: // Project
            const projectElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="project-selector"]`
            ) as HTMLElement;
            if (projectElement) {
              projectElement.click();
            }
            break;
          case 5: // Actions menu
            const menuElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="actions-menu"]`
            ) as HTMLElement;
            if (menuElement) {
              menuElement.click();
            }
            break;
        }
      });
    },
    [timeEntries]
  );

  const navigateToNextCell = React.useCallback(() => {
    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      const maxCellIndex = 5; // 6 columns: date, description, project, time, duration, actions
      const currentEntriesLength = timeEntries.length;

      if (currentSelectedCell.cellIndex < maxCellIndex) {
        return {
          ...currentSelectedCell,
          cellIndex: currentSelectedCell.cellIndex + 1,
        };
      } else if (currentSelectedCell.rowIndex < currentEntriesLength - 1) {
        return { rowIndex: currentSelectedCell.rowIndex + 1, cellIndex: 0 };
      }

      return currentSelectedCell; // No change if at the end
    });
  }, [timeEntries.length]);

  React.useEffect(() => {
    currentPageRef.current = 0;
    setHasMore(true);
    // Call fetchData directly without depending on the callback
    if (date?.from && date?.to) {
      const fromISO = date.from.toISOString();
      const toISO = date.to.toISOString();
      const apiKey = localStorage.getItem("toggl_api_key");

      setLoading(true);
      (async () => {
        try {
          const response = await fetch(
            `/api/time-entries?start_date=${fromISO}&end_date=${toISO}&page=0&limit=100`,
            {
              headers: { "x-toggl-api-key": apiKey || "" },
            }
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          if (data.timeEntries && data.projects && data.pagination) {
            setTimeEntries(data.timeEntries);
            setProjects(data.projects);
            setHasMore(data.pagination.hasMore);
            currentPageRef.current = 0;
          }
        } catch (error) {
          console.error("Initial load error:", error);
          const now = Date.now();
          if (now - lastErrorToastRef.current > 5000) {
            toast.error("Failed to fetch data.");
            lastErrorToastRef.current = now;
          }
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [date]);

  // DO NOT REMOVE THIS COMMENT
  // Refresh data when tab becomes visible - TEMPORARILY DISABLED
  // React.useEffect(() => {
  //   const handleVisibilityChange = () => {
  //     if (document.visibilityState === "visible" && date?.from && date?.to) {
  //       // Silently refresh data without showing loading state
  //       fetchData(false);
  //     }
  //   };

  //   document.addEventListener("visibilitychange", handleVisibilityChange);

  //   return () => {
  //     document.removeEventListener("visibilitychange", handleVisibilityChange);
  //   };
  // }, [fetchData, date]);

  // Memoize expensive calculations
  const keyboardNavigationData = React.useMemo(
    () => ({
      currentEntriesLength: timeEntries.length,
      maxCellIndex: 5, // 6 columns: date, description, project, time, duration, actions
    }),
    [timeEntries.length]
  );

  // Stable functions for keyboard navigation
  const handleNewEntry = React.useCallback(() => {
    startNewTimeEntry();
  }, [startNewTimeEntry]);

  const handleRefreshData = React.useCallback(() => {
    if (date?.from && date?.to) {
      currentPageRef.current = 0;
      setHasMore(true);
      fetchData(true, true); // Explicitly reset data and show loading
    }
  }, [date, fetchData]);

  const handleDeleteSelected = React.useCallback(() => {
    if (selectedCell) {
      const entry = timeEntries[selectedCell.rowIndex];
      if (entry) {
        handleDelete(entry);
      }
    }
  }, [selectedCell, timeEntries, handleDelete]);

  const handleDeleteSelectedWithConfirmation = React.useCallback(() => {
    if (selectedCell) {
      const entry = timeEntries[selectedCell.rowIndex];
      if (entry) {
        // Show confirmation dialog
        const confirmed = window.confirm(
          `Are you sure you want to delete this time entry?\n\nDescription: ${
            entry.description || "(no description)"
          }\nProject: ${
            entry.project_name || "No Project"
          }\nDuration: ${Math.floor(entry.duration / 3600)}h ${Math.floor(
            (entry.duration % 3600) / 60
          )}m`
        );

        if (confirmed) {
          handleDelete(entry);
          // Clear selection after deletion
          setSelectedCell(null);
        }
      }
    }
  }, [selectedCell, timeEntries, handleDelete]);

  // Stable cell selection callback
  const handleSelectCell = React.useCallback(
    (rowIndex: number, cellIndex: number) => {
      setSelectedCell({ rowIndex, cellIndex });
    },
    []
  );

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input/textarea OR editing a cell
      const activeElement = document.activeElement;
      const isInInput =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement)?.contentEditable === "true" ||
        activeElement?.getAttribute("role") === "textbox";

      // If we're editing a cell, project selector is open, or actions menu is open, don't handle global navigation
      if (isEditingCell || isProjectSelectorOpen || isActionsMenuOpen) return;

      // Global shortcuts (work even when focused on inputs)
      if (e.key === "n" && !isInInput) {
        e.preventDefault();
        handleNewEntry();
        return;
      }

      if (e.key === "r" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRefreshData();
        return;
      }

      if (e.key === "r" && !isInInput) {
        e.preventDefault();
        handleRefreshData();
        return;
      }

      if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && !isInInput) {
        e.preventDefault();
        handleDeleteSelectedWithConfirmation();
        return;
      }

      // Navigation shortcuts (only when not in input)
      if (isInInput) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          // Only clear selection if no menus are open
          if (!isActionsMenuOpen && !isProjectSelectorOpen) {
            setSelectedCell(null);
          }
          break;

        case "Enter":
          e.preventDefault();
          if (selectedCell) {
            activateCell(selectedCell.rowIndex, selectedCell.cellIndex);
          } else if (keyboardNavigationData.currentEntriesLength > 0) {
            // If no cell selected, select first cell of first row
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          }
          break;

        case "Tab":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (selectedCell) {
            if (e.shiftKey) {
              // Shift+Tab: Move backward
              if (selectedCell.cellIndex > 0) {
                setSelectedCell({
                  ...selectedCell,
                  cellIndex: selectedCell.cellIndex - 1,
                });
              } else if (selectedCell.rowIndex > 0) {
                setSelectedCell({
                  rowIndex: selectedCell.rowIndex - 1,
                  cellIndex: keyboardNavigationData.maxCellIndex,
                });
              }
            } else {
              // Tab: Move forward
              navigateToNextCell();
            }
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (
            selectedCell &&
            selectedCell.rowIndex <
              keyboardNavigationData.currentEntriesLength - 1
          ) {
            setSelectedCell({
              ...selectedCell,
              rowIndex: selectedCell.rowIndex + 1,
            });
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            setSelectedCell({
              rowIndex: keyboardNavigationData.currentEntriesLength - 1,
              cellIndex: 0,
            });
          } else if (selectedCell && selectedCell.rowIndex > 0) {
            setSelectedCell({
              ...selectedCell,
              rowIndex: selectedCell.rowIndex - 1,
            });
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (selectedCell && selectedCell.cellIndex > 0) {
            setSelectedCell({
              ...selectedCell,
              cellIndex: selectedCell.cellIndex - 1,
            });
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (
            selectedCell &&
            selectedCell.cellIndex < keyboardNavigationData.maxCellIndex
          ) {
            setSelectedCell({
              ...selectedCell,
              cellIndex: selectedCell.cellIndex + 1,
            });
          }
          break;

        case "Home":
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (selectedCell) {
            setSelectedCell({ ...selectedCell, cellIndex: 0 });
          }
          break;

        case "End":
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            setSelectedCell({
              rowIndex: keyboardNavigationData.currentEntriesLength - 1,
              cellIndex: keyboardNavigationData.maxCellIndex,
            });
          } else if (selectedCell) {
            setSelectedCell({
              ...selectedCell,
              cellIndex: keyboardNavigationData.maxCellIndex,
            });
          }
          break;

        case "d":
          e.preventDefault();
          handleDeleteSelected();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    // Essential dependencies only - remove functions that don't need to be in deps
    selectedCell,
    keyboardNavigationData.currentEntriesLength,
    keyboardNavigationData.maxCellIndex,
    isEditingCell,
    isProjectSelectorOpen,
    isActionsMenuOpen,
    // Stable callback functions
    activateCell,
    navigateToNextCell,
    handleNewEntry,
    handleRefreshData,
    handleDeleteSelected,
    handleDeleteSelectedWithConfirmation,
  ]);

  // Clear selection if selected cell is out of bounds after data changes
  React.useEffect(() => {
    if (selectedCell && selectedCell.rowIndex >= timeEntries.length) {
      setSelectedCell(null);
    }
  }, [selectedCell, timeEntries.length]);

  // Scroll selected cell into view when it moves past viewport
  React.useEffect(() => {
    if (selectedCell && timeEntries.length > 0) {
      const entry = timeEntries[selectedCell.rowIndex];
      if (!entry) return;

      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        const rowElement = document.querySelector(
          `[data-entry-id="${entry.id}"]`
        ) as HTMLElement;

        if (rowElement && tableRef.current) {
          const container = tableRef.current;
          const rowRect = rowElement.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          // Vertical scrolling - only when row is outside viewport
          const isAboveViewport = rowRect.bottom < containerRect.top;
          const isBelowViewport = rowRect.top > containerRect.bottom;

          if (isAboveViewport || isBelowViewport) {
            // Calculate target scroll position with some padding for better UX
            const rowOffsetTop = rowElement.offsetTop;
            const containerHeight = container.clientHeight;
            const padding = 50; // Small padding to keep row nicely visible
            
            let targetScrollTop;
            
            if (isAboveViewport) {
              // Scroll up: position row near top with padding
              targetScrollTop = rowOffsetTop - padding;
            } else {
              // Scroll down: position row near bottom with padding  
              targetScrollTop = rowOffsetTop - containerHeight + rowElement.offsetHeight + padding;
            }
            
            // Ensure we don't scroll beyond bounds
            targetScrollTop = Math.max(0, Math.min(targetScrollTop, container.scrollHeight - containerHeight));
            
            // Smooth scroll to target position
            container.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth'
            });
          }

          // Horizontal scrolling for mobile - get the specific cell
          const selectedCellElement = document.querySelector(
            `[data-entry-id="${entry.id}"] td:nth-child(${
              selectedCell.cellIndex + 1
            })`
          ) as HTMLElement;

          if (selectedCellElement) {
            const isMobileViewport = window.innerWidth < 768; // sm breakpoint

            if (isMobileViewport) {
              selectedCellElement.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "nearest",
              });
            }
          }
        }
      });
    }
  }, [selectedCell, timeEntries]);

  return (
    <div
      className="h-[calc(100vh-8rem)] space-y-6 border rounded-xl p-6 overflow-auto overscroll-none"
      ref={tableRef}
    >
      <div className="flex items-center space-x-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-[300px] justify-start text-left font-normal border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-sm",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 border-border/60" align="start">
            <Calendar
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={(selectedRange) => {
                if (selectedRange?.from && selectedRange?.to) {
                  // Set end date to end of day
                  const endOfDayTo = endOfDay(selectedRange.to);
                  setDate({ from: selectedRange.from, to: endOfDayTo });
                } else {
                  setDate(selectedRange);
                }
              }}
              numberOfMonths={2}
              className="rounded-md border-0"
            />
          </PopoverContent>
        </Popover>
        <Button
          onClick={() => {
            fetchData();
          }}
          variant="outline"
          disabled={loading}
          className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground animate-pulse">
              Loading time entries...
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden shadow-sm bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/30 transition-colors duration-200 border-border/60">
                <TableHead className="px-4 py-3 sm:w-28 w-24 font-medium text-muted-foreground">
                  Date
                </TableHead>
                <TableHead className="px-4 py-3 font-medium text-muted-foreground">
                  Description
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                  Project
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-32 w-24 font-medium text-muted-foreground">
                  Time
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-24 w-20 font-medium text-muted-foreground min-w-[80px]">
                  Duration
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-16 w-12 font-medium text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeEntries.map((entry, rowIndex) => (
                <MemoizedTableRow
                  key={entry.id}
                  entry={entry}
                  rowIndex={rowIndex}
                  selectedCell={selectedCell}
                  onSelectCell={handleSelectCell}
                  onDescriptionSave={handleDescriptionSave}
                  onProjectChange={handleProjectChange}
                  onDelete={handleDelete}
                  projects={projects}
                  setIsEditingCell={setIsEditingCell}
                  setIsProjectSelectorOpen={setIsProjectSelectorOpen}
                  setIsActionsMenuOpen={setIsActionsMenuOpen}
                  navigateToNextCell={navigateToNextCell}
                  isNewlyLoaded={newlyLoadedEntries.has(entry.id)}
                />
              ))}
              {hasMore && (
                <TableRow>
                  <TableCell colSpan={6} className="h-20 text-center">
                    <div className="flex items-center justify-center my-4 mb-8">
                      {isLoadingMore ? (
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          <span className="text-muted-foreground">
                            Loading more entries...
                          </span>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={loadMore}
                          disabled={loading || isLoadingMore}
                          className="hover:bg-accent/60 border-border/60 hover:border-border transition-all duration-200"
                        >
                          Load More Entries
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          Showing {timeEntries.length} entries
          {hasMore && " (click to load more)"}
        </p>
      </div>
    </div>
  );
}
