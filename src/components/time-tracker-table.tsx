"use client";

import { usePinnedEntries } from "@/hooks/use-pinned-entries";
import { toast, triggerUndo } from "@/lib/toast";
import type { PinnedEntry } from "@/types";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import {
  Calendar as CalendarIcon,
  Maximize2,
  Minimize2,
  Plus,
} from "lucide-react";
import React from "react";
import { DateRange } from "react-day-picker";
import { PinnedTimeEntries } from "./pinned-time-entries";
import { SyncStatusBadge } from "./sync-status-badge";

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
import type { Project, SelectedCell, Tag, TimeEntry } from "../types";
import { ActionsMenu } from "./actions-menu";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
import { DurationEditor } from "./duration-editor";
import { ExpandableDescription } from "./expandable-description";
import { ProjectSelector } from "./project-selector";
import { SplitEntryDialog } from "./split-entry-dialog";
import { TagSelector } from "./tag-selector";
import { TimeEditor } from "./time-editor";

const MemoizedTableRow = React.memo(
  function TableRowComponent({
    entry,
    rowIndex,
    selectedCell,
    onSelectCell,
    onDescriptionSave,
    onProjectChange,
    onTagsChange,
    onTimeChange,
    onDurationChange,
    onDurationChangeWithStartTimeAdjustment,
    onDelete,
    onPin,
    onUnpin,
    onSplit,
    onStartEntry,
    isPinned,
    projects,
    availableTags,
    setIsEditingCell,
    setIsProjectSelectorOpen,
    setIsTagSelectorOpen,
    setIsActionsMenuOpen,
    setIsTimeEditorOpen,
    navigateToNextCell,
    navigateToPrevCell,
    navigateToNextRow,
    isNewlyLoaded,
  }: {
    entry: TimeEntry;
    rowIndex: number;
    selectedCell: SelectedCell;
    onSelectCell: (rowIndex: number, cellIndex: number) => void;
    onDescriptionSave: (entryId: number) => (newDescription: string) => void;
    onProjectChange: (entryId: number) => (newProject: string) => void;
    onTagsChange: (entryId: number) => (newTags: string[]) => void;
    onTimeChange: (
      entryId: number
    ) => (startTime: string, endTime: string | null) => void;
    onDurationChange: (entryId: number) => (newDuration: number) => void;
    onDurationChangeWithStartTimeAdjustment: (entryId: number) => (newDuration: number) => void;
    onDelete: (entry: TimeEntry) => void;
    onPin: (entry: TimeEntry) => void;
    onUnpin: (id: string) => void;
    onSplit: (entry: TimeEntry) => void;
    onStartEntry: (entry: TimeEntry) => void;
    isPinned: boolean;
    projects: Project[];
    availableTags: Tag[];
    setIsEditingCell: (editing: boolean) => void;
    setIsProjectSelectorOpen: (open: boolean) => void;
    setIsTagSelectorOpen: (open: boolean) => void;
    setIsActionsMenuOpen: (open: boolean) => void;
    setIsTimeEditorOpen: (open: boolean) => void;
    navigateToNextCell: () => void;
    navigateToPrevCell: () => void;
    navigateToNextRow: () => void;
    isNewlyLoaded: boolean;
  }) {
    return (
      <TableRow
        key={entry.id}
        data-entry-id={entry.id}
        className={cn(
          "hover:bg-accent/20 border-border/40 group hover:shadow-sm",
          isNewlyLoaded && "bg-blue-100 dark:bg-blue-900/50"
        )}
      >
        <TableCell
          className={cn(
            "px-4 font-mono text-sm text-muted-foreground sm:w-28 w-24"
          )}
        >
          {format(new Date(entry.start), "yyyy-MM-dd")}
        </TableCell>
        <TableCell
          className={cn(
            "px-4 pr-2 pl-2 cursor-pointer description-cell",
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
            "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
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
            onNavigatePrev={navigateToPrevCell}
            onNavigateDown={navigateToNextRow}
            data-testid="project-selector"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 3 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 3)}
        >
          <TagSelector
            currentTags={entry.tags || []}
            onTagsChange={(newTags) => onTagsChange(entry.id)(newTags)}
            availableTags={availableTags}
            onOpenChange={setIsTagSelectorOpen}
            onNavigateNext={navigateToNextCell}
            onNavigatePrev={navigateToPrevCell}
            data-testid="tag-selector"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 pr-0 pl-0 cursor-pointer sm:w-32 w-24",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 4 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 4)}
        >
          <TimeEditor
            startTime={entry.start}
            endTime={entry.stop}
            onSave={(startTime, endTime) =>
              onTimeChange(entry.id)(startTime, endTime)
            }
            onEditingChange={setIsTimeEditorOpen}
            onNavigateNext={navigateToNextCell}
            onNavigateDown={navigateToNextRow}
            onNavigatePrev={navigateToPrevCell}
            data-testid="time-editor"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 pl-2 pr-0 cursor-pointer sm:w-32 w-24",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 5 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 5)}
        >
          <DurationEditor
            duration={entry.duration}
            startTime={entry.start}
            endTime={entry.stop}
            onSave={(newDuration) => onDurationChange(entry.id)(newDuration)}
            onSaveWithStartTimeAdjustment={(newDuration) => onDurationChangeWithStartTimeAdjustment(entry.id)(newDuration)}
            onEditingChange={setIsEditingCell}
            onNavigateDown={navigateToNextRow}
            data-testid="duration-editor"
          />
        </TableCell>
        <TableCell
          className={cn(
            "px-4 py-2 cursor-pointer sm:w-16 w-12",
            selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 6 &&
              "ring-1 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-md"
          )}
          onClick={() => onSelectCell(rowIndex, 6)}
        >
          <ActionsMenu
            onPin={() => onPin(entry)}
            onUnpin={() => onUnpin(entry.id.toString())}
            isPinned={isPinned}
            onSplit={() => onSplit(entry)}
            onStartEntry={() => onStartEntry(entry)}
            onCopyId={() => {
              // Implement copy ID logic
            }}
            onDelete={() => onDelete(entry)}
            onOpenChange={setIsActionsMenuOpen}
            onNavigateNext={navigateToNextCell}
            isSelected={
              selectedCell?.rowIndex === rowIndex &&
              selectedCell?.cellIndex === 6
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
    const entryEqual = prevProps.entry === nextProps.entry;
    const rowIndexEqual = prevProps.rowIndex === nextProps.rowIndex;
    const onSelectCellEqual = prevProps.onSelectCell === nextProps.onSelectCell;
    const onDescriptionSaveEqual =
      prevProps.onDescriptionSave === nextProps.onDescriptionSave;
    const onProjectChangeEqual =
      prevProps.onProjectChange === nextProps.onProjectChange;
    const onTagsChangeEqual = prevProps.onTagsChange === nextProps.onTagsChange;
    const onTimeChangeEqual = prevProps.onTimeChange === nextProps.onTimeChange;
    const onDurationChangeEqual =
      prevProps.onDurationChange === nextProps.onDurationChange;
    const onDeleteEqual = prevProps.onDelete === nextProps.onDelete;
    const onStartEntryEqual = prevProps.onStartEntry === nextProps.onStartEntry;
    const projectsEqual = prevProps.projects === nextProps.projects;
    const availableTagsEqual =
      prevProps.availableTags === nextProps.availableTags;
    const setIsEditingCellEqual =
      prevProps.setIsEditingCell === nextProps.setIsEditingCell;
    const setIsProjectSelectorOpenEqual =
      prevProps.setIsProjectSelectorOpen === nextProps.setIsProjectSelectorOpen;
    const setIsTagSelectorOpenEqual =
      prevProps.setIsTagSelectorOpen === nextProps.setIsTagSelectorOpen;
    const setIsActionsMenuOpenEqual =
      prevProps.setIsActionsMenuOpen === nextProps.setIsActionsMenuOpen;
    const setIsTimeEditorOpenEqual =
      prevProps.setIsTimeEditorOpen === nextProps.setIsTimeEditorOpen;
    const navigateToNextCellEqual =
      prevProps.navigateToNextCell === nextProps.navigateToNextCell;
    const navigateToPrevCellEqual =
      prevProps.navigateToPrevCell === nextProps.navigateToPrevCell;
    const navigateToNextRowEqual =
      prevProps.navigateToNextRow === nextProps.navigateToNextRow;

    const shouldNotRerender =
      entryEqual &&
      rowIndexEqual &&
      onSelectCellEqual &&
      onDescriptionSaveEqual &&
      onProjectChangeEqual &&
      onTagsChangeEqual &&
      onTimeChangeEqual &&
      onDurationChangeEqual &&
      onDeleteEqual &&
      onStartEntryEqual &&
      projectsEqual &&
      availableTagsEqual &&
      setIsEditingCellEqual &&
      setIsProjectSelectorOpenEqual &&
      setIsTagSelectorOpenEqual &&
      setIsActionsMenuOpenEqual &&
      setIsTimeEditorOpenEqual &&
      navigateToNextCellEqual &&
      navigateToPrevCellEqual &&
      navigateToNextRowEqual;

    return shouldNotRerender;
  }
);

export function TimeTrackerTable({
  onFullscreenChange,
}: { onFullscreenChange?: (isFullscreen: boolean) => void } = {}) {
  const { pinnedEntries, pinEntry, unpinEntry, isPinned } = usePinnedEntries();
  const [showPinnedEntries, setShowPinnedEntries] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

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
  const timeEntriesRef = React.useRef<TimeEntry[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [availableTags, setAvailableTags] = React.useState<Tag[]>([]);
  const availableTagsRef = React.useRef<Tag[]>([]);
  const [loading, setLoading] = React.useState(false);
  const currentPageRef = React.useRef(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [selectedCell, setSelectedCell] = React.useState<SelectedCell>(null);
  const lastErrorToastRef = React.useRef<number>(0);

  const [isEditingCell, setIsEditingCell] = React.useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] =
    React.useState(false);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = React.useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = React.useState(false);
  const [isTimeEditorOpen, setIsTimeEditorOpen] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [newlyLoadedEntries, setNewlyLoadedEntries] = React.useState<
    Set<number>
  >(new Set());
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [entryToDelete, setEntryToDelete] = React.useState<TimeEntry | null>(
    null
  );
  const [splitDialogOpen, setSplitDialogOpen] = React.useState(false);
  const [entryToSplit, setEntryToSplit] = React.useState<TimeEntry | null>(
    null
  );
  const [syncStatus, setSyncStatus] = React.useState<
    "synced" | "syncing" | "error" | "session_expired" | "offline"
  >("synced");
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | undefined>();

  // Toast duration - read from localStorage (default 4000ms)
  const toastDuration = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("toast_duration");
      return saved ? parseInt(saved, 10) : 4000;
    }
    return 4000;
  }, []);
  const FETCH_DELAY_AFTER_TOAST = toastDuration + 500; // Add 500ms buffer


  const showUpdateToast = React.useCallback(
    (message: string, undoAction: () => void, apiCall: () => Promise<void>) => {
      toast(message, {
        action: {
          label: "Undo",
          onClick: undoAction,
        },
        duration: toastDuration,
        onAutoClose: async () => {
          try {
            await apiCall();
            setTimeout(() => {
              fetchData(false, false);
            }, FETCH_DELAY_AFTER_TOAST);
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
    [toastDuration, FETCH_DELAY_AFTER_TOAST, fetchData]
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
            const sessionToken = localStorage.getItem("toggl_session_token");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
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
            const sessionToken = localStorage.getItem("toggl_session_token");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
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

  const handleTagsChange = React.useCallback(
    (entryId: number) => (newTags: string[]) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Create updated entries
        const updatedEntries = currentEntries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                tags: newTags,
              }
            : entry
        );

        showUpdateToast(
          "Tags updated.",
          () => setTimeEntries(originalEntries),
          async () => {
            // Convert tag names to tag IDs using cached mapping
            const tagIds = newTags
              .map((tagName) => {
                const tag = availableTags.find((t) => t.name === tagName);
                return tag ? tag.id : null;
              })
              .filter((id): id is number => id !== null);

            const sessionToken = localStorage.getItem("toggl_session_token");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
              },
              body: JSON.stringify({ tag_ids: tagIds }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              let errorMessage = `Failed to update tags (${response.status})`;
              if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              } else if (response.status === 400) {
                errorMessage = "Invalid tags";
              }

              throw new Error(errorMessage);
            }
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast, availableTags]
  );

  const handleTimeChange = React.useCallback(
    (entryId: number) => (startTime: string, endTime: string | null) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Calculate new duration for optimistic UI update
        const start = new Date(startTime);
        const end = endTime ? new Date(endTime) : null;
        const duration = end
          ? Math.floor((end.getTime() - start.getTime()) / 1000)
          : -1;

        // Create updated entries for optimistic update
        const updatedEntries = currentEntries.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                start: startTime,
                stop: endTime || "",
                duration: duration,
              }
            : entry
        );

        // Sort by start time (most recent first)
        updatedEntries.sort(
          (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
        );

        showUpdateToast(
          "Time updated.",
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");
            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
              },
              body: JSON.stringify({
                start: startTime,
                stop: endTime || undefined,
                // Don't send duration - let Toggl calculate it
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              let errorMessage = `Failed to update time (${response.status})`;
              if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              } else if (response.status === 400) {
                errorMessage = "Invalid time range";
              }

              throw new Error(errorMessage);
            }

            // After successful API call, refresh to get accurate duration from Toggl
            setTimeout(() => {
              fetchData(false, false);
            }, FETCH_DELAY_AFTER_TOAST);
          }
        );

        return updatedEntries;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showUpdateToast]
  );

  const handleDurationChange = React.useCallback(
    (entryId: number) => (newDuration: number) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Find the entry to check if it's running
        const entry = currentEntries.find((e) => e.id === entryId);
        const isRunning = entry && (!entry.stop || entry.duration === -1);

        // Create updated entries for optimistic update
        const updatedEntries = currentEntries.map((entry) => {
          if (entry.id === entryId) {
            if (isRunning) {
              // For running timers, move start time backwards (now - duration)
              const now = new Date();
              const newStartDate = new Date(now.getTime() - newDuration * 1000);

              return {
                ...entry,
                start: newStartDate.toISOString(),
                duration: -1, // Keep it running
              };
            } else {
              // For stopped timers, calculate new stop time based on start + duration
              const startDate = new Date(entry.start);
              const newStopDate = new Date(
                startDate.getTime() + newDuration * 1000
              );

              return {
                ...entry,
                duration: newDuration,
                stop: newStopDate.toISOString(),
              };
            }
          }
          return entry;
        });

        showUpdateToast(
          "Duration updated.",
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");

            // For running timers, send new start time instead of duration
            const payload = isRunning
              ? {
                  start: new Date(
                    new Date().getTime() - newDuration * 1000
                  ).toISOString(),
                }
              : {
                  duration: newDuration,
                };

            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
              },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

              let errorMessage = `Failed to update duration (${response.status})`;
              if (response.status === 401) {
                errorMessage =
                  "Authentication failed. Please check your API key";
              } else if (response.status === 403) {
                errorMessage = "Permission denied";
              } else if (response.status === 400) {
                errorMessage = "Invalid duration";
              }

              throw new Error(errorMessage);
            }

            // After successful API call, refresh to get accurate duration from Toggl
            setTimeout(() => {
              fetchData(false, false);
            }, FETCH_DELAY_AFTER_TOAST);
          }
        );

        return updatedEntries;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showUpdateToast]
  );

  const handleDurationChangeWithStartTimeAdjustment = React.useCallback(
    (entryId: number) => (newDuration: number) => {
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Find the entry
        const entry = currentEntries.find((e) => e.id === entryId);
        if (!entry) return currentEntries;

        const isRunning = !entry.stop || entry.duration === -1;

        // Create updated entries - ALWAYS adjust start time
        const updatedEntries = currentEntries.map((entry) => {
          if (entry.id === entryId) {
            if (isRunning) {
              // For running timers, move start time backwards (now - duration)
              const now = new Date();
              const newStartDate = new Date(now.getTime() - newDuration * 1000);

              return {
                ...entry,
                start: newStartDate.toISOString(),
                duration: -1, // Keep it running
              };
            } else {
              // For stopped timers, adjust start time while keeping stop time fixed
              const stopDate = new Date(entry.stop!);
              const newStartDate = new Date(
                stopDate.getTime() - newDuration * 1000
              );

              return {
                ...entry,
                start: newStartDate.toISOString(),
                duration: newDuration,
              };
            }
          }
          return entry;
        });

        showUpdateToast(
          "Start time adjusted.",
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");

            // Always send new start time
            const newStart = isRunning
              ? new Date(new Date().getTime() - newDuration * 1000).toISOString()
              : new Date(
                  new Date(entry.stop!).getTime() - newDuration * 1000
                ).toISOString();

            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
              },
              body: JSON.stringify({ start: newStart }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);
              throw new Error("Failed to update start time");
            }

            setTimeout(() => {
              fetchData(false, false);
            }, FETCH_DELAY_AFTER_TOAST);
          }
        );

        return updatedEntries;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showUpdateToast]
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
            const sessionToken = localStorage.getItem("toggl_session_token");
            const response = await fetch(
              `/api/time-entries/${entryToDelete.id}`,
              {
                method: "DELETE",
                headers: {
                  "x-toggl-session-token": sessionToken || "",
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

  const handleSplit = React.useCallback((entry: TimeEntry) => {
    if (!entry.stop || entry.duration === -1) {
      toast.error("Cannot split a running time entry");
      return;
    }
    setEntryToSplit(entry);
    setSplitDialogOpen(true);
  }, []);

  const handleConfirmSplit = React.useCallback(
    (offsetMinutes: number) => {
      if (!entryToSplit) return;

      const originalEntries = [...timeEntries];
      const startTime = new Date(entryToSplit.start);
      const endTime = new Date(entryToSplit.stop!);
      const offsetMs = offsetMinutes * 60 * 1000;

      // Split point is offsetMinutes from the end
      const splitPoint = endTime.getTime() - offsetMs;

      // Optimistically create the split entries
      const splitEntries: TimeEntry[] = [];

      // Update the first entry (original, ending at split point)
      const firstEntry: TimeEntry = {
        ...entryToSplit,
        stop: new Date(splitPoint).toISOString(),
        duration: Math.floor((splitPoint - startTime.getTime()) / 1000),
      };
      splitEntries.push(firstEntry);

      // Create second entry (from split point to original end)
      splitEntries.push({
        ...entryToSplit,
        id: -Date.now(), // Temporary negative ID
        start: new Date(splitPoint).toISOString(),
        stop: endTime.toISOString(),
        duration: Math.floor(offsetMs / 1000),
      });

      // Update UI optimistically
      setTimeEntries((currentEntries) => {
        const entriesWithoutOriginal = currentEntries.filter(
          (entry) => entry.id !== entryToSplit.id
        );

        // Insert split entries in the correct position (sorted by start time)
        const updatedEntries = [...entriesWithoutOriginal, ...splitEntries];
        updatedEntries.sort(
          (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
        );

        return updatedEntries;
      });

      // Make API call
      const sessionToken = localStorage.getItem("toggl_session_token");

      toast(`Splitting entry with ${offsetMinutes} minute offset...`, {
        duration: toastDuration,
      });

      fetch("/api/time-entries/split", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-toggl-session-token": sessionToken || "",
        },
        body: JSON.stringify({
          entryId: entryToSplit.id,
          offsetMinutes,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error:", response.status, errorText);
            throw new Error("Failed to split entry");
          }
          return response.json();
        })
        .then((data) => {
          console.log("[Split] API response:", data);

          // Instead of trying to merge API data (which lacks enriched fields),
          // just refresh the data to get the properly enriched entries
          toast.success(data.message || "Entry split successfully");

          // Refresh data to get properly enriched entries with project names, colors, tags, etc.
          setTimeout(() => {
            fetchData(false);
          }, FETCH_DELAY_AFTER_TOAST);
        })
        .catch((error) => {
          console.error("Failed to split time entry:", error);
          toast.error("Failed to split entry. Reverting changes.");
          setTimeEntries(originalEntries);
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entryToSplit, timeEntries, toastDuration]
  );

  const startNewTimeEntry = React.useCallback(
    (
      description: string = "",
      projectName: string = "No Project",
      projectColor: string = "#6b7280",
      tags: string[] = []
    ) => {
      let originalEntries: TimeEntry[] = [];
      let tempId = 0;
      let newEntry: TimeEntry | null = null;
      let runningEntry: TimeEntry | null = null;

      // Create timestamp once at the start
      const now = new Date().toISOString();

      setTimeEntries((currentEntries) => {
        originalEntries = [...currentEntries];

        tempId = -Date.now(); // Temporary negative ID

        // Find currently running entry (no stop time) for UI feedback
        runningEntry = currentEntries.find((entry) => !entry.stop) || null;

        newEntry = {
          id: tempId,
          description,
          project_name: projectName,
          project_color: projectColor,
          start: now,
          stop: "", // Empty stop means it's running
          duration: 0,
          tags,
        };

        // Optimistically stop the previous running timer and add new entry
        const updatedEntries = runningEntry
          ? currentEntries.map((entry) => {
              if (entry.id === runningEntry.id) {
                const startDate = new Date(entry.start);
                const stopDate = new Date(now);
                const calculatedDuration = Math.floor(
                  (stopDate.getTime() - startDate.getTime()) / 1000
                );
                return {
                  ...entry,
                  stop: now,
                  duration: calculatedDuration,
                };
              }
              return entry;
            })
          : currentEntries;

        return [newEntry, ...updatedEntries];
      });

      // Select the new entry's description field for immediate editing
      setTimeout(() => {
        setSelectedCell({ rowIndex: 0, cellIndex: 0 });
      }, 50);

      // Make the API call immediately to ensure precise timing
      const sessionToken = localStorage.getItem("toggl_session_token");
      let createdEntryId: number | null = null;

      (async () => {
        try {
          const response = await fetch("/api/time-entries", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken || "",
            },
            body: JSON.stringify({
              description,
              start: now,
              project_name: projectName,
              tag_ids: tags
                .map((tagName) => {
                  const tag = availableTagsRef.current.find((t) => t.name === tagName);
                  return tag ? tag.id : null;
                })
                .filter((id): id is number => id !== null),
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
          }, FETCH_DELAY_AFTER_TOAST);
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
                    "x-toggl-session-token": sessionToken || "",
                  },
                });

                // Refresh data to restore any stopped timer
                setTimeout(() => {
                  fetchData(false);
                }, FETCH_DELAY_AFTER_TOAST);
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timeEntries, availableTags]
  );

  const handleCopyAndStartEntry = React.useCallback(
    (entry: TimeEntry) => {
      startNewTimeEntry(
        entry.description,
        entry.project_name || "No Project",
        entry.project_color || "#6b7280",
        entry.tags || []
      );
    },
    [startNewTimeEntry]
  );

  // Add a ref to track last fetch time for global debouncing
  const lastFetchTimeRef = React.useRef(0);
  const FETCH_DEBOUNCE_DELAY = 1000; // 1 second minimum between fetches

  const fetchData = React.useCallback(
    async (showLoadingState = true, resetData = true) => {
      if (!date?.from || !date?.to) return;

      // Global debouncing to prevent rapid consecutive fetches
      // BUT: allow Load More calls (resetData=false) to always go through
      const now = Date.now();
      if (
        now - lastFetchTimeRef.current < FETCH_DEBOUNCE_DELAY &&
        !showLoadingState &&
        resetData // Only debounce background refreshes, not pagination
      ) {
        return; // Skip if we're doing a background fetch and recently fetched
      }
      lastFetchTimeRef.current = now;

      // Only show main loading state for initial loads, not infinite scroll
      if (showLoadingState && resetData) setLoading(true);
      const fromISO = date.from.toISOString();
      const toISO = date.to.toISOString();

      // Use consistent limit to avoid pagination issues
      const limit = 100;
      const pageToFetch = resetData ? 0 : currentPageRef.current + 1;

      // Get credentials from localStorage
      const sessionToken = localStorage.getItem("toggl_session_token");

      try {
        setSyncStatus("syncing");
        const response = await fetch(
          `/api/time-entries?start_date=${fromISO}&end_date=${toISO}&page=${pageToFetch}&limit=${limit}`,
          {
            headers: {
              "x-toggl-session-token": sessionToken || "",
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 401 || errorData.isSessionExpired) {
            setSyncStatus("session_expired");
            throw new Error("Session expired");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Handle the new response structure
        if (data.timeEntries && data.projects && data.pagination) {
          if (resetData) {
            setTimeEntries(data.timeEntries);
            setNewlyLoadedEntries(new Set()); // Clear new entries on reset
            currentPageRef.current = 0;
            // Set tags from the response - only update if they actually changed
            if (data.tags) {
              setAvailableTags((currentTags) => {
                if (JSON.stringify(currentTags) === JSON.stringify(data.tags)) {
                  return currentTags; // Keep same reference
                }
                return data.tags;
              });
            }
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

          // Only update projects if they actually changed
          setProjects((currentProjects) => {
            if (JSON.stringify(currentProjects) === JSON.stringify(data.projects)) {
              return currentProjects; // Keep same reference
            }
            return data.projects;
          });

          setHasMore(data.pagination.hasMore);
          setSyncStatus("synced");
          setLastSyncTime(new Date());
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

        // Set appropriate sync status based on error
        if (
          error instanceof Error &&
          error.message.includes("Session expired")
        ) {
          setSyncStatus("session_expired");
        } else if (!navigator.onLine) {
          setSyncStatus("offline");
        } else {
          setSyncStatus("error");
        }

        // Only show toast for initial load, not for infinite scroll loads
        // And debounce error toasts to prevent spam
        if (resetData) {
          const now = Date.now();
          if (now - lastErrorToastRef.current > 5000) {
            // Max one error toast per 5 seconds
            if (
              error instanceof Error &&
              error.message.includes("Session expired")
            ) {
              toast.error("Session expired. Please reauthenticate.");
            } else {
              toast.error("Failed to fetch data.");
            }
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
    await fetchData(false, false);
    setIsLoadingMore(false);
  }, [hasMore, loading, isLoadingMore, fetchData]);

  // Optimized activateCell using React.useCallback to prevent recreation
  const activateCell = React.useCallback(
    (rowIndex: number, cellIndex: number) => {
      // Use a ref to get the latest timeEntries without causing re-creation
      const entry = timeEntriesRef.current[rowIndex];
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
          case 3: // Tags
            const tagElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="tag-selector"]`
            ) as HTMLElement;
            if (tagElement) {
              tagElement.click();
            }
            break;
          case 4: // Time
            const timeElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="time-editor"]`
            ) as HTMLElement;
            if (timeElement) {
              timeElement.click();
            }
            break;
          case 5: // Duration
            const durationElement = document.querySelector(
              `[data-entry-id="${entry.id}"] [data-testid="duration-editor"]`
            ) as HTMLElement;
            if (durationElement) {
              durationElement.click();
            }
            break;
          case 6: // Actions menu
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
    [] // No dependencies - use ref for timeEntries
  );

  const navigateToNextCell = React.useCallback(() => {
    // Store current cell info before updating state
    let shouldAutoOpen = false;
    let targetRowIndex = 0;
    let targetCellIndex = 0;

    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      const maxCellIndex = 6; // 7 columns: date, description, project, tags, time, duration, actions
      const currentEntriesLength = timeEntries.length;

      if (currentSelectedCell.cellIndex < maxCellIndex) {
        const nextCellIndex = currentSelectedCell.cellIndex + 1;

        // Check if we should auto-open project selector, tag selector, time editor, or duration editor
        if (nextCellIndex === 2 || nextCellIndex === 3 || nextCellIndex === 4 || nextCellIndex === 5) {
          shouldAutoOpen = true;
          targetRowIndex = currentSelectedCell.rowIndex;
          targetCellIndex = nextCellIndex;
        }

        return {
          ...currentSelectedCell,
          cellIndex: nextCellIndex,
        };
      } else if (currentSelectedCell.rowIndex < currentEntriesLength - 1) {
        return { rowIndex: currentSelectedCell.rowIndex + 1, cellIndex: 0 };
      }

      return currentSelectedCell; // No change if at the end
    });

    // Call activateCell AFTER state update, outside the callback
    if (shouldAutoOpen) {
      setTimeout(() => activateCell(targetRowIndex, targetCellIndex), 0);
    }
  }, [timeEntries.length, activateCell]);

  const navigateToPrevCell = React.useCallback(() => {
    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      if (currentSelectedCell.cellIndex > 0) {
        return {
          ...currentSelectedCell,
          cellIndex: currentSelectedCell.cellIndex - 1,
        };
      } else if (currentSelectedCell.rowIndex > 0) {
        return {
          rowIndex: currentSelectedCell.rowIndex - 1,
          cellIndex: 6, // Move to last cell of previous row
        };
      }

      return currentSelectedCell; // No change if at the beginning
    });
  }, [timeEntries.length]);

  const navigateToNextRow = React.useCallback(() => {
    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      const currentEntriesLength = timeEntries.length;

      // Move to same column in next row
      if (currentSelectedCell.rowIndex < currentEntriesLength - 1) {
        const newCell = {
          rowIndex: currentSelectedCell.rowIndex + 1,
          cellIndex: currentSelectedCell.cellIndex,
        };

        // Activate the cell after navigation
        activateCell(newCell.rowIndex, newCell.cellIndex);

        return newCell;
      }

      return currentSelectedCell; // No change if at the end
    });
  }, [timeEntries.length, activateCell]);

  // Keep refs in sync with state
  React.useEffect(() => {
    timeEntriesRef.current = timeEntries;
  }, [timeEntries]);

  React.useEffect(() => {
    availableTagsRef.current = availableTags;
  }, [availableTags]);

  React.useEffect(() => {
    currentPageRef.current = 0;
    setHasMore(true);
    // Use fetchData instead of duplicating the logic
    if (date?.from && date?.to) {
      fetchData(true, true); // Show loading, reset data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]); // Note: fetchData is intentionally not in deps to avoid infinite loop

  // Refresh data when tab becomes visible or window gains focus (with debouncing)
  React.useEffect(() => {
    // Track if this is the initial mount
    let isMounted = false;
    let lastFetchTime = 0;
    const DEBOUNCE_DELAY = 3000; // Minimum 3 seconds between visibility/focus fetches

    // Wait a bit after mount before enabling auto-refresh
    const mountTimer = setTimeout(() => {
      isMounted = true;
    }, 2000);

    const debouncedFetch = () => {
      if (!isMounted) return; // Don't fetch on initial mount

      // Don't sync if any input field is being edited
      if (
        isEditingCell ||
        isProjectSelectorOpen ||
        isTagSelectorOpen ||
        isActionsMenuOpen ||
        isTimeEditorOpen
      ) {
        return; // Skip auto-sync while editing
      }

      const now = Date.now();
      if (now - lastFetchTime < DEBOUNCE_DELAY) {
        return; // Skip if we fetched recently
      }
      lastFetchTime = now;

      if (date?.from && date?.to) {
        // Silently refresh data without showing loading state
        fetchData(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        debouncedFetch();
      }
    };

    const handleFocus = () => {
      debouncedFetch();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearTimeout(mountTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [
    fetchData,
    date,
    isEditingCell,
    isProjectSelectorOpen,
    isTagSelectorOpen,
    isActionsMenuOpen,
    isTimeEditorOpen,
  ]);

  // Memoize expensive calculations
  const keyboardNavigationData = React.useMemo(
    () => ({
      currentEntriesLength: timeEntries.length,
      maxCellIndex: 6, // 7 columns: date, description, project, tags, time, duration, actions
    }),
    [timeEntries.length]
  );

  // Handlers for pinning/unpinning entries
  const handlePinEntry = React.useCallback(
    (entry: TimeEntry) => {
      const pinnedEntry: PinnedEntry = {
        id: entry.id.toString(),
        description: entry.description,
        project_name: entry.project_name,
        project_color: entry.project_color,
        tags: entry.tags,
      };
      pinEntry(pinnedEntry);
      toast("Entry pinned");
    },
    [pinEntry]
  );

  const handleUnpinEntry = React.useCallback(
    (id: string) => {
      unpinEntry(id);
      toast("Entry unpinned");
    },
    [unpinEntry]
  );

  const handleStartTimerFromPinned = React.useCallback(
    (entry: PinnedEntry) => {
      startNewTimeEntry(
        entry.description,
        entry.project_name,
        entry.project_color,
        entry.tags
      );
    },
    [startNewTimeEntry]
  );

  // Stable functions for keyboard navigation
  const handleNewEntry = React.useCallback(() => {
    startNewTimeEntry();
  }, [startNewTimeEntry]);

  const handleNewEntryClick = React.useCallback(() => {
    // If already showing pinned entries, create empty timer
    if (showPinnedEntries) {
      setShowPinnedEntries(false);
      handleNewEntry();
      return;
    }

    // If we have pinned entries, show them
    if (pinnedEntries.length > 0) {
      setShowPinnedEntries(true);

      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowPinnedEntries(false);
      }, 3000);
      return;
    }

    // No pinned entries, just create new timer
    handleNewEntry();
  }, [showPinnedEntries, pinnedEntries.length, handleNewEntry]);

  const handleRefreshData = React.useCallback(() => {
    if (date?.from && date?.to) {
      currentPageRef.current = 0;
      setHasMore(true);
      fetchData(false, true); // Reset data but don't show loading spinner - just show syncing badge
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
        setEntryToDelete(entry);
        setDeleteDialogOpen(true);
      }
    }
  }, [selectedCell, timeEntries]);

  const handleDeleteWithConfirmation = React.useCallback((entry: TimeEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    if (entryToDelete) {
      handleDelete(entryToDelete);
      setSelectedCell(null);
      setEntryToDelete(null);
    }
  }, [entryToDelete, handleDelete]);

  const handleReauthenticate = React.useCallback(() => {
    // Clear the session token and redirect to login
    localStorage.removeItem("toggl_session_token");
    window.location.reload(); // This will trigger the welcome form
  }, []);

  // Stable cell selection callback
  const handleSelectCell = React.useCallback(
    (rowIndex: number, cellIndex: number) => {
      setSelectedCell({ rowIndex, cellIndex });
    },
    []
  );

  // Keyboard navigation
  React.useEffect(() => {
    let awaitingPinnedNumber = false;
    let pinnedTimeoutId: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input/textarea OR editing a cell
      const activeElement = document.activeElement;
      const isInInput =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement)?.contentEditable === "true" ||
        activeElement?.getAttribute("role") === "textbox";

      // If we're editing a cell, any selector is open, or actions menu is open, don't handle global navigation
      if (
        isEditingCell ||
        isProjectSelectorOpen ||
        isTagSelectorOpen ||
        isActionsMenuOpen ||
        isTimeEditorOpen
      )
        return;

      // Handle 'n' key - show pinned entries if available, otherwise create new entry
      if (e.key === "n" && !isInInput) {
        e.preventDefault();

        // If already showing pinned entries and waiting for number, create empty timer
        if (awaitingPinnedNumber) {
          awaitingPinnedNumber = false;
          setShowPinnedEntries(false);
          if (pinnedTimeoutId) clearTimeout(pinnedTimeoutId);
          handleNewEntry();
          return;
        }

        // If we have pinned entries, show them and wait for number selection
        if (pinnedEntries.length > 0) {
          awaitingPinnedNumber = true;
          setShowPinnedEntries(true);

          // Clear any existing timeout
          if (pinnedTimeoutId) clearTimeout(pinnedTimeoutId);

          // Reset after 3 seconds if no number is pressed
          pinnedTimeoutId = setTimeout(() => {
            awaitingPinnedNumber = false;
            setShowPinnedEntries(false);
          }, 3000);
          return;
        }

        // No pinned entries, just create new timer
        handleNewEntry();
        return;
      }

      // If waiting for a number after 'n'
      if (awaitingPinnedNumber && !isInInput) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          awaitingPinnedNumber = false;
          setShowPinnedEntries(false);
          if (pinnedTimeoutId) clearTimeout(pinnedTimeoutId);

          const index = num - 1;
          if (index < pinnedEntries.length) {
            handleStartTimerFromPinned(pinnedEntries[index]);
          } else {
            toast.error(`No pinned entry at position ${num}`);
          }
          return;
        }
      }

      // Only handle plain 'r' for refresh, allow Cmd+R/Ctrl+R for browser refresh
      if (e.key === "r" && !isInInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleRefreshData();
        return;
      }

      if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && !isInInput) {
        e.preventDefault();
        handleDeleteSelectedWithConfirmation();
        return;
      }

      if (e.key === "u" && !isInInput) {
        e.preventDefault();
        triggerUndo();
        return;
      }

      if (e.key === "f" && !isInInput) {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
        return;
      }

      // Navigation shortcuts (only when not in input)
      if (isInInput) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          e.stopPropagation();

          // If showing pinned entries, hide them
          if (showPinnedEntries) {
            awaitingPinnedNumber = false;
            setShowPinnedEntries(false);
            if (pinnedTimeoutId) clearTimeout(pinnedTimeoutId);
            return;
          }

          // Only clear selection if no menus are open
          if (
            !isActionsMenuOpen &&
            !isProjectSelectorOpen &&
            !isTagSelectorOpen
          ) {
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
          handleDeleteSelectedWithConfirmation();
          break;

        case "s":
          e.preventDefault();
          if (selectedCell) {
            const entry = timeEntries[selectedCell.rowIndex];
            if (entry) {
              handleSplit(entry);
            }
          }
          break;

        case "p":
          e.preventDefault();
          if (selectedCell) {
            const entry = timeEntries[selectedCell.rowIndex];
            if (entry) {
              handleCopyAndStartEntry(entry);
            }
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (pinnedTimeoutId) clearTimeout(pinnedTimeoutId);
    };
  }, [
    // Essential dependencies only - remove functions that don't need to be in deps
    selectedCell,
    keyboardNavigationData.currentEntriesLength,
    keyboardNavigationData.maxCellIndex,
    isEditingCell,
    isProjectSelectorOpen,
    isTagSelectorOpen,
    isActionsMenuOpen,
    isTimeEditorOpen,
    pinnedEntries,
    showPinnedEntries,
    timeEntries,
    // Stable callback functions
    activateCell,
    navigateToNextCell,
    handleNewEntry,
    handleRefreshData,
    handleDeleteSelected,
    handleDeleteSelectedWithConfirmation,
    handleStartTimerFromPinned,
    handleSplit,
    handleCopyAndStartEntry,
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
              targetScrollTop =
                rowOffsetTop -
                containerHeight +
                rowElement.offsetHeight +
                padding;
            }

            // Ensure we don't scroll beyond bounds
            targetScrollTop = Math.max(
              0,
              Math.min(
                targetScrollTop,
                container.scrollHeight - containerHeight
              )
            );

            // Smooth scroll to target position
            container.scrollTo({
              top: targetScrollTop,
              behavior: "smooth",
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
      className={cn(
        "space-y-6 overflow-auto overscroll-none",
        isFullscreen
          ? "fixed inset-0 z-50 bg-background p-4 fullscreen-mode"
          : "h-[calc(100vh-8rem)] border rounded-xl p-6"
      )}
      ref={tableRef}
    >
      {showPinnedEntries && (
        <PinnedTimeEntries
          pinnedEntries={pinnedEntries}
          onUnpin={handleUnpinEntry}
          onStartTimer={handleStartTimerFromPinned}
          onNewEntry={() => {
            setShowPinnedEntries(false);
            handleNewEntry();
          }}
          showShortcuts={true}
        />
      )}
      <div className="flex items-center justify-between mb-4">
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
            <PopoverContent
              className="w-auto p-0 border-border/60"
              align="start"
            >
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
          <SyncStatusBadge
            status={syncStatus}
            lastSyncTime={lastSyncTime}
            onReauthenticate={handleReauthenticate}
            onRetry={() => fetchData()}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setIsFullscreen(!isFullscreen)}
            size="icon"
            variant="outline"
            className="rounded-full h-9 w-9 border-border/40 shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
            title={
              isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"
            }
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
          <Button
            onClick={handleNewEntryClick}
            size="icon"
            variant="outline"
            className="rounded-full h-9 w-9 border-border/40 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
            title="Start new timer (N)"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
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
        <div
          className={cn(
            "bg-card",
            isFullscreen
              ? "overflow-x-auto"
              : "rounded-lg border border-border/60 shadow-sm overflow-hidden"
          )}
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/30 transition-colors duration-200 border-border/60">
                <TableHead className="px-4 py-3 sm:w-28 w-24 font-medium text-muted-foreground">
                  Date
                </TableHead>
                <TableHead className="px-4 py-3 font-medium text-muted-foreground description-cell">
                  Description
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                  Project
                </TableHead>
                <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                  Tags
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
                  onTagsChange={handleTagsChange}
                  onTimeChange={handleTimeChange}
                  onDurationChange={handleDurationChange}
                  onDurationChangeWithStartTimeAdjustment={handleDurationChangeWithStartTimeAdjustment}
                  onDelete={handleDeleteWithConfirmation}
                  onPin={handlePinEntry}
                  onUnpin={handleUnpinEntry}
                  onSplit={handleSplit}
                  onStartEntry={handleCopyAndStartEntry}
                  isPinned={isPinned(entry.id.toString())}
                  projects={projects}
                  availableTags={availableTags}
                  setIsEditingCell={setIsEditingCell}
                  setIsProjectSelectorOpen={setIsProjectSelectorOpen}
                  setIsTagSelectorOpen={setIsTagSelectorOpen}
                  setIsActionsMenuOpen={setIsActionsMenuOpen}
                  setIsTimeEditorOpen={setIsTimeEditorOpen}
                  navigateToNextCell={navigateToNextCell}
                  navigateToPrevCell={navigateToPrevCell}
                  navigateToNextRow={navigateToNextRow}
                  isNewlyLoaded={newlyLoadedEntries.has(entry.id)}
                />
              ))}
              {hasMore && (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center">
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

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        entry={entryToDelete}
        onConfirm={handleConfirmDelete}
      />

      <SplitEntryDialog
        open={splitDialogOpen}
        onOpenChange={setSplitDialogOpen}
        onConfirm={handleConfirmSplit}
        entryDescription={entryToSplit?.description}
      />
    </div>
  );
}
