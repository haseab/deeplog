"use client";

import { useEncryptionContext } from "@/contexts/encryption-context";
import { usePinnedEntries } from "@/hooks/use-pinned-entries";
import { decryptDescription, encryptDescription } from "@/lib/encryption";
import {
  SyncQueueManager,
  type OperationType,
  type QueuedOperation,
} from "@/lib/sync-queue";
import { hasActiveToast, toast, triggerUndo } from "@/lib/toast";
import type { PinnedEntry, SyncStatus } from "@/types";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import {
  AlertCircle,
  BarChart3,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Loader2,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { updateRecentTimersCache } from "@/lib/recent-timers-cache";
import { cn } from "@/lib/utils";
import type { Project, SelectedCell, Tag, TimeEntry } from "../types";
import { ActionsMenu } from "./actions-menu";
import { CombineEntryDialog } from "./combine-entry-dialog";
import { DeleteConfirmationDialog } from "./delete-confirmation-dialog";
import { DurationEditor } from "./duration-editor";
import { EncryptionStatus } from "./encryption-status";
import { ExpandableDescription } from "./expandable-description";
import { PinDialog } from "./pin-dialog";
import { ProjectSelector } from "./project-selector";
import { SplitEntryDialog } from "./split-entry-dialog";
import { TagSelector } from "./tag-selector";
import { TimeEditor } from "./time-editor";

const MemoizedTableRow = React.memo(
  function TableRowComponent({
    entry,
    rowIndex,
    prevEntryEnd,
    nextEntryStart,
    selectedCell,
    onSelectCell,
    onDescriptionSave,
    onProjectChange,
    onTagsChange,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onBulkEntryUpdate: _onBulkEntryUpdate,
    onBulkEntryUpdateByRowIndex,
    onTimeChange,
    onDurationChange,
    onDurationChangeWithStartTimeAdjustment,
    onDelete,
    onPin,
    onUnpin,
    onSplit,
    onCombine,
    onStartEntry,
    onStopTimer,
    isPinned,
    projects,
    availableTags,
    onProjectCreated,
    onTagCreated,
    setIsEditingCell,
    setIsProjectSelectorOpen,
    setIsTagSelectorOpen,
    setIsActionsMenuOpen,
    setIsTimeEditorOpen,
    navigateToNextCell,
    navigateToPrevCell,
    navigateToNextRow,
    isNewlyLoaded,
    syncStatus,
    onRetrySync,
    isFullscreen,
  }: {
    entry: TimeEntry;
    rowIndex: number;
    prevEntryEnd?: string | null;
    nextEntryStart?: string | null;
    selectedCell: SelectedCell;
    onSelectCell: (rowIndex: number, cellIndex: number) => void;
    onDescriptionSave: (entryId: number) => (newDescription: string) => void;
    onProjectChange: (entryId: number) => (newProject: string) => void;
    onTagsChange: (entryId: number) => (newTags: string[]) => void;
    onBulkEntryUpdate: (
      entryId: number
    ) => (updates: {
      description?: string;
      projectName?: string;
      tags?: string[];
    }) => void;
    onBulkEntryUpdateByRowIndex: (
      capturedId: number
    ) => (updates: {
      description?: string;
      projectName?: string;
      tags?: string[];
    }) => void;
    onTimeChange: (
      entryId: number
    ) => (startTime: string, endTime: string | null) => void;
    onDurationChange: (entryId: number) => (newDuration: number) => void;
    onDurationChangeWithStartTimeAdjustment: (
      entryId: number
    ) => (newDuration: number) => void;
    onDelete: (entry: TimeEntry) => void;
    onPin: (entry: TimeEntry) => void;
    onUnpin: (id: string) => void;
    onSplit: (entry: TimeEntry) => void;
    onCombine: (entry: TimeEntry) => void;
    onStartEntry: (entry: TimeEntry) => void;
    onStopTimer: (entry: TimeEntry) => void;
    isPinned: boolean;
    projects: Project[];
    availableTags: Tag[];
    onProjectCreated: (project: Project) => void;
    onTagCreated: (tag: Tag) => void;
    setIsEditingCell: (editing: boolean) => void;
    setIsProjectSelectorOpen: (open: boolean) => void;
    setIsTagSelectorOpen: (open: boolean) => void;
    setIsActionsMenuOpen: (open: boolean) => void;
    setIsTimeEditorOpen: (open: boolean) => void;
    navigateToNextCell: () => void;
    navigateToPrevCell: () => void;
    navigateToNextRow: () => void;
    isNewlyLoaded: boolean;
    syncStatus?: SyncStatus;
    onRetrySync: (entryId: number) => void;
    isFullscreen: boolean;
  }) {
    // Debug: Log when component renders to see entry IDs
    if (entry.id && entry.id < 0 && rowIndex === 0) {
    }

    return (
      <>
        {/* Mobile View */}
        <TableRow
          key={`${entry.tempId || entry.id}-mobile`}
          data-entry-id={entry.id}
          className={cn(
            "md:hidden hover:bg-accent/20 border-border/40 group",
            isNewlyLoaded && "bg-blue-100 dark:bg-blue-900/50"
          )}
        >
          <TableCell colSpan={8} className="p-3 max-w-0">
            <div className="space-y-0 max-w-full overflow-hidden">
              {/* Description */}
              <div className="max-w-full overflow-hidden">
                <ExpandableDescription
                  description={entry.description || ""}
                  onSave={(newDescription) =>
                    onDescriptionSave(entry.id)(newDescription)
                  }
                  onEditingChange={setIsEditingCell}
                  onNavigateNext={navigateToNextCell}
                  projects={projects}
                  availableTags={availableTags}
                  onRecentTimerSelect={(selected) => {
                    const tagNames = availableTags
                      .filter((tag) => selected.tagIds.includes(tag.id))
                      .map((tag) => tag.name);

                    const project = projects.find(
                      (p) => p.id === selected.projectId
                    );

                    onBulkEntryUpdateByRowIndex(entry.id)({
                      description: selected.description,
                      projectName: project?.name,
                      tags: tagNames,
                    });
                  }}
                  data-testid="expandable-description"
                />
              </div>

              {/* Project + Time row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="shrink-0 max-w-[52%]">
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
                    onProjectCreated={onProjectCreated}
                    data-testid="project-selector"
                  />
                </div>
                <div className="shrink-0 max-w-[48%]">
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
                    prevEntryEnd={prevEntryEnd}
                    nextEntryStart={nextEntryStart}
                    data-testid="time-editor"
                  />
                </div>
              </div>

              {/* Tags + Duration + Actions row */}
              <div className="flex items-center justify-between gap-2">
                <div className="shrink-0">
                  <TagSelector
                    currentTags={entry.tags || []}
                    onTagsChange={(newTags) => onTagsChange(entry.id)(newTags)}
                    availableTags={availableTags}
                    onOpenChange={setIsTagSelectorOpen}
                    onNavigateNext={navigateToNextCell}
                    onNavigatePrev={navigateToPrevCell}
                    onTagCreated={onTagCreated}
                    data-testid="tag-selector"
                  />
                </div>
                <div className="flex items-center shrink-0">
                  <DurationEditor
                    duration={entry.duration}
                    startTime={entry.start}
                    endTime={entry.stop}
                    onSave={(newDuration) =>
                      onDurationChange(entry.id)(newDuration)
                    }
                    onSaveWithStartTimeAdjustment={(newDuration) =>
                      onDurationChangeWithStartTimeAdjustment(entry.id)(
                        newDuration
                      )
                    }
                    onEditingChange={setIsEditingCell}
                    onNavigateDown={navigateToNextRow}
                    data-testid="duration-editor"
                  />
                  <ActionsMenu
                    onPin={() => onPin(entry)}
                    onUnpin={() => onUnpin(entry.id.toString())}
                    isPinned={isPinned}
                    onSplit={() => onSplit(entry)}
                    onCombine={() => onCombine(entry)}
                    onStartEntry={() => onStartEntry(entry)}
                    onStopTimer={() => onStopTimer(entry)}
                    onDelete={() => onDelete(entry)}
                    onOpenChange={setIsActionsMenuOpen}
                    onNavigateNext={navigateToNextCell}
                    isSelected={false}
                    isRunning={!entry.stop || entry.duration === -1}
                    data-testid="actions-menu"
                  />
                </div>
              </div>

              {/* Sync status indicator */}
              {syncStatus && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {syncStatus === "pending" && (
                    <>
                      <Clock className="w-3 h-3 text-yellow-500" />
                      <span>Queued</span>
                    </>
                  )}
                  {syncStatus === "syncing" && (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                      <span>Syncing...</span>
                    </>
                  )}
                  {syncStatus === "synced" && (
                    <>
                      <Check className="w-3 h-3 text-green-500" />
                      <span>Synced</span>
                    </>
                  )}
                  {syncStatus === "error" && (
                    <button
                      onClick={() => onRetrySync(entry.id)}
                      className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                    >
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      <span className="text-red-500">Failed - retry</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>

        {/* Desktop View */}
        <TableRow
          key={entry.tempId || entry.id}
          data-entry-id={entry.id}
          className={cn(
            "hidden md:table-row hover:bg-accent/20 border-border/40 group hover:shadow-sm",
            isNewlyLoaded && "bg-blue-100 dark:bg-blue-900/50"
          )}
        >
          <TableCell className="px-2 w-8 md:table-cell hidden">
            {syncStatus === "pending" && (
              <div title="Update queued">
                <Clock className="w-4 h-4 text-yellow-500" />
              </div>
            )}
            {syncStatus === "syncing" && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            )}
            {syncStatus === "synced" && (
              <Check className="w-4 h-4 text-green-500" />
            )}
            {syncStatus === "error" && (
              <button
                onClick={() => onRetrySync(entry.id)}
                className="hover:opacity-70 transition-opacity"
                title="Click to retry"
              >
                <AlertCircle className="w-4 h-4 text-red-500" />
              </button>
            )}
          </TableCell>
          <TableCell
            className={cn(
              "px-4 font-mono text-sm text-muted-foreground sm:w-28 w-24 cursor-pointer md:table-cell hidden",
              selectedCell?.rowIndex === rowIndex &&
                selectedCell?.cellIndex === 0 &&
                "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
            )}
            onClick={() => onSelectCell(rowIndex, 0)}
          >
            {format(new Date(entry.start), "yyyy-MM-dd")}
          </TableCell>
          {isFullscreen ? (
            <>
              <TableCell
                className={cn(
                  "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 1 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
                )}
                onClick={() => onSelectCell(rowIndex, 1)}
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
                  onProjectCreated={onProjectCreated}
                  data-testid="project-selector"
                />
              </TableCell>
              <TableCell
                className={cn(
                  "px-4 pr-2 pl-2 cursor-pointer description-cell",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 2 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
                )}
                onClick={() => onSelectCell(rowIndex, 2)}
              >
                <ExpandableDescription
                  description={entry.description || ""}
                  onSave={(newDescription) =>
                    onDescriptionSave(entry.id)(newDescription)
                  }
                  onEditingChange={setIsEditingCell}
                  onNavigateNext={navigateToNextCell}
                  projects={projects}
                  availableTags={availableTags}
                  onRecentTimerSelect={(selected) => {
                    // Pass the captured entry.id - helper will resolve to current ID

                    const tagNames = availableTags
                      .filter((tag) => selected.tagIds.includes(tag.id))
                      .map((tag) => tag.name);

                    const project = projects.find(
                      (p) => p.id === selected.projectId
                    );

                    onBulkEntryUpdateByRowIndex(entry.id)({
                      description: selected.description,
                      projectName: project?.name,
                      tags: tagNames,
                    });
                  }}
                  data-testid="expandable-description"
                />
              </TableCell>
              <TableCell
                className={cn(
                  "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 3 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
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
                  onTagCreated={onTagCreated}
                  data-testid="tag-selector"
                />
              </TableCell>
            </>
          ) : (
            <>
              <TableCell
                className={cn(
                  "px-4 pr-2 pl-2 cursor-pointer description-cell",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 1 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
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
                  projects={projects}
                  availableTags={availableTags}
                  onRecentTimerSelect={(selected) => {
                    // Pass the captured entry.id - helper will resolve to current ID

                    const tagNames = availableTags
                      .filter((tag) => selected.tagIds.includes(tag.id))
                      .map((tag) => tag.name);

                    const project = projects.find(
                      (p) => p.id === selected.projectId
                    );

                    onBulkEntryUpdateByRowIndex(entry.id)({
                      description: selected.description,
                      projectName: project?.name,
                      tags: tagNames,
                    });
                  }}
                  data-testid="expandable-description"
                />
              </TableCell>
              <TableCell
                className={cn(
                  "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 2 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
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
                  onProjectCreated={onProjectCreated}
                  data-testid="project-selector"
                />
              </TableCell>
              <TableCell
                className={cn(
                  "px-4 pr-0 pl-0 cursor-pointer sm:w-48 w-32",
                  selectedCell?.rowIndex === rowIndex &&
                    selectedCell?.cellIndex === 3 &&
                    "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
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
                  onTagCreated={onTagCreated}
                  data-testid="tag-selector"
                />
              </TableCell>
            </>
          )}
          <TableCell
            className={cn(
              "px-4 pr-0 pl-0 cursor-pointer sm:w-32 w-24",
              selectedCell?.rowIndex === rowIndex &&
                selectedCell?.cellIndex === 4 &&
                "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
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
              prevEntryEnd={prevEntryEnd}
              nextEntryStart={nextEntryStart}
              data-testid="time-editor"
            />
          </TableCell>
          <TableCell
            className={cn(
              "px-4 pl-2 pr-0 cursor-pointer sm:w-32 w-24",
              selectedCell?.rowIndex === rowIndex &&
                selectedCell?.cellIndex === 5 &&
                "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
            )}
            onClick={() => onSelectCell(rowIndex, 5)}
          >
            <DurationEditor
              duration={entry.duration}
              startTime={entry.start}
              endTime={entry.stop}
              onSave={(newDuration) => onDurationChange(entry.id)(newDuration)}
              onSaveWithStartTimeAdjustment={(newDuration) =>
                onDurationChangeWithStartTimeAdjustment(entry.id)(newDuration)
              }
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
                "ring-1 ring-gray-300 dark:ring-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-md"
            )}
            onClick={() => onSelectCell(rowIndex, 6)}
          >
            <ActionsMenu
              onPin={() => onPin(entry)}
              onUnpin={() => onUnpin(entry.id.toString())}
              isPinned={isPinned}
              onSplit={() => onSplit(entry)}
              onCombine={() => onCombine(entry)}
              onStartEntry={() => onStartEntry(entry)}
              onStopTimer={() => onStopTimer(entry)}
              onDelete={() => onDelete(entry)}
              onOpenChange={setIsActionsMenuOpen}
              onNavigateNext={navigateToNextCell}
              isSelected={
                selectedCell?.rowIndex === rowIndex &&
                selectedCell?.cellIndex === 6
              }
              isRunning={!entry.stop || entry.duration === -1}
              data-testid="actions-menu"
            />
          </TableCell>
        </TableRow>
      </>
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
    const onBulkEntryUpdateEqual =
      prevProps.onBulkEntryUpdate === nextProps.onBulkEntryUpdate;
    const onBulkEntryUpdateByRowIndexEqual =
      prevProps.onBulkEntryUpdateByRowIndex ===
      nextProps.onBulkEntryUpdateByRowIndex;
    const onTimeChangeEqual = prevProps.onTimeChange === nextProps.onTimeChange;
    const onDurationChangeEqual =
      prevProps.onDurationChange === nextProps.onDurationChange;
    const onDeleteEqual = prevProps.onDelete === nextProps.onDelete;
    const onStartEntryEqual = prevProps.onStartEntry === nextProps.onStartEntry;
    const projectsEqual = prevProps.projects === nextProps.projects;
    const availableTagsEqual =
      prevProps.availableTags === nextProps.availableTags;
    const onProjectCreatedEqual =
      prevProps.onProjectCreated === nextProps.onProjectCreated;
    const onTagCreatedEqual = prevProps.onTagCreated === nextProps.onTagCreated;
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
    const syncStatusEqual = prevProps.syncStatus === nextProps.syncStatus;
    const onRetrySyncEqual = prevProps.onRetrySync === nextProps.onRetrySync;
    const isFullscreenEqual = prevProps.isFullscreen === nextProps.isFullscreen;

    const shouldNotRerender =
      entryEqual &&
      rowIndexEqual &&
      onSelectCellEqual &&
      onDescriptionSaveEqual &&
      onProjectChangeEqual &&
      onTagsChangeEqual &&
      onBulkEntryUpdateEqual &&
      onBulkEntryUpdateByRowIndexEqual &&
      onTimeChangeEqual &&
      onDurationChangeEqual &&
      onDeleteEqual &&
      onStartEntryEqual &&
      projectsEqual &&
      availableTagsEqual &&
      onProjectCreatedEqual &&
      onTagCreatedEqual &&
      setIsEditingCellEqual &&
      setIsProjectSelectorOpenEqual &&
      setIsTagSelectorOpenEqual &&
      setIsActionsMenuOpenEqual &&
      setIsTimeEditorOpenEqual &&
      navigateToNextCellEqual &&
      navigateToPrevCellEqual &&
      navigateToNextRowEqual &&
      syncStatusEqual &&
      onRetrySyncEqual &&
      isFullscreenEqual;

    return shouldNotRerender;
  }
);

export function TimeTrackerTable({
  onFullscreenChange,
}: { onFullscreenChange?: (isFullscreen: boolean) => void } = {}) {
  const { pinnedEntries, pinEntry, unpinEntry, isPinned } = usePinnedEntries();
  const encryption = useEncryptionContext();

  // Decrypt pinned entries for display
  const decryptedPinnedEntries = React.useMemo(() => {
    if (!encryption.isE2EEEnabled || !encryption.isUnlocked) {
      return pinnedEntries;
    }

    const sessionKey = encryption.getSessionKey();
    if (!sessionKey) {
      return pinnedEntries;
    }

    return pinnedEntries.map((entry) => {
      // Check if description looks encrypted (format: IV:AuthTag:Ciphertext)
      const looksEncrypted =
        entry.description &&
        entry.description.includes(":") &&
        entry.description.split(":").length === 3;
      const entryId = parseInt(entry.id, 10);

      if (looksEncrypted) {
        try {
          const decryptedDescription = decryptDescription(
            entry.description,
            sessionKey,
            entryId
          );
          return { ...entry, description: decryptedDescription };
        } catch (error) {
          console.error(
            `[E2EE] Failed to decrypt pinned entry ${entry.id}:`,
            error
          );
          return entry;
        }
      }
      return entry;
    });
  }, [
    pinnedEntries,
    encryption.isE2EEEnabled,
    encryption.isUnlocked,
    encryption.getSessionKey,
  ]);

  const [pinDialogOpen, setPinDialogOpen] = React.useState(false);
  const [pinError, setPinError] = React.useState<string>("");
  const [showPinnedEntries, setShowPinnedEntries] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  React.useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  const handleFullscreenToggle = React.useCallback(() => {
    setIsTransitioning(true);
    // Brief delay to show animation
    setTimeout(() => {
      setIsFullscreen((prev) => !prev);
      // End transition after columns have reorganized
      setTimeout(() => {
        setIsTransitioning(false);
      }, 600);
    }, 0);
  }, []);

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

  // Decrypt entries when E2EE is enabled and unlocked
  const decryptedEntries = React.useMemo(() => {
    if (!encryption.isE2EEEnabled || !encryption.isUnlocked) {
      return timeEntries;
    }

    const sessionKey = encryption.getSessionKey();
    if (!sessionKey) {
      return timeEntries;
    }

    return timeEntries.map((entry) => {
      // Check if description looks encrypted (IV:AuthTag:Ciphertext format)
      const looksEncrypted =
        entry.description?.includes(":") &&
        entry.description?.split(":").length === 3;

      if (looksEncrypted) {
        try {
          const decryptedDescription = decryptDescription(
            entry.description,
            sessionKey,
            entry.id
          );
          return { ...entry, description: decryptedDescription };
        } catch {
          // Not actually encrypted or wrong key, return as-is
          return entry;
        }
      }
      return entry;
    });
  }, [
    timeEntries,
    encryption.isE2EEEnabled,
    encryption.isUnlocked,
    encryption.getSessionKey,
  ]);

  const [projects, setProjects] = React.useState<Project[]>([]);
  const projectsRef = React.useRef<Project[]>([]);
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
  const deleteDialogOpenRef = React.useRef(false);
  const [entryToDelete, setEntryToDelete] = React.useState<TimeEntry | null>(
    null
  );
  const [splitDialogOpen, setSplitDialogOpen] = React.useState(false);
  const splitDialogOpenRef = React.useRef(false);
  const [entryToSplit, setEntryToSplit] = React.useState<TimeEntry | null>(
    null
  );
  const [combineDialogOpen, setCombineDialogOpen] = React.useState(false);
  const combineDialogOpenRef = React.useRef(false);
  const [entryToCombine, setEntryToCombine] = React.useState<TimeEntry | null>(
    null
  );
  const [syncStatus, setSyncStatus] = React.useState<
    "synced" | "syncing" | "error" | "session_expired" | "offline"
  >("synced");
  const [lastSyncTime, setLastSyncTime] = React.useState<Date | undefined>();
  const [entrySyncStatus, setEntrySyncStatus] = React.useState<
    Map<number, SyncStatus>
  >(new Map());
  const entrySyncStatusRef = React.useRef<Map<number, SyncStatus>>(new Map());
  const entryRetryFunctions = React.useRef<Map<number, () => Promise<void>>>(
    new Map()
  );

  // Sync queue manager for handling operations on temp IDs
  const syncQueueRef = React.useRef<SyncQueueManager>(new SyncQueueManager());

  // Keep ref in sync with state
  React.useEffect(() => {
    entrySyncStatusRef.current = entrySyncStatus;
  }, [entrySyncStatus]);

  // Toast duration - read from localStorage (default 4000ms)
  const toastDuration = React.useMemo(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("toast_duration");
      return saved ? parseInt(saved, 10) : 4000;
    }
    return 4000;
  }, []);

  const showUpdateToast = React.useCallback(
    (
      message: string,
      entryId: number,
      undoAction: () => void,
      apiCall: () => Promise<void>
    ) => {
      // Store the retry function for this entry
      const existingRetry = entryRetryFunctions.current.get(entryId);
      if (existingRetry) {
      }
      entryRetryFunctions.current.set(entryId, apiCall);

      let toastDismissed = false;

      toast(message, {
        action: {
          label: "Undo (U)",
          onClick: () => {
            toastDismissed = true;
            undoAction();
          },
        },
        duration: toastDuration,
      });

      // Use setTimeout instead of onAutoClose to ensure it runs regardless of tab visibility
      setTimeout(async () => {
        if (toastDismissed) {
          return;
        }

        // Mark as syncing
        setEntrySyncStatus((prev) => {
          const next = new Map(prev);
          next.set(entryId, "syncing");
          return next;
        });

        try {
          await apiCall();

          // Mark as synced and clear retry function
          setEntrySyncStatus((prev) => {
            const next = new Map(prev);
            next.set(entryId, "synced");
            return next;
          });
          entryRetryFunctions.current.delete(entryId);

          // Clear synced status after 2 seconds
          setTimeout(() => {
            setEntrySyncStatus((prev) => {
              const next = new Map(prev);
              next.delete(entryId);
              return next;
            });
          }, 2000);
        } catch (error) {
          console.error("API call failed:", error);
          const errorMessage =
            error instanceof Error && error.message
              ? error.message
              : "Failed to update entry. Please try again.";

          // Mark as error - DON'T revert the UI, let user see the error and retry
          setEntrySyncStatus((prev) => {
            const next = new Map(prev);
            next.set(entryId, "error");
            return next;
          });

          toast.error(errorMessage);
          // Don't call undoAction() - keep the optimistic update visible with error indicator
          // Retry function is already stored in entryRetryFunctions
        }
      }, toastDuration);
    },
    [toastDuration]
  );

  // Reusable helper to handle updates on temp IDs (queues them) or real IDs (uses showUpdateToast)
  const handleUpdateWithQueue = React.useCallback(
    <T extends Record<string, unknown>>(
      entryId: number,
      updates: T,
      operationType: OperationType,
      optimisticUpdate: (entry: TimeEntry) => Partial<TimeEntry>,
      apiCall: (realId: number, sessionToken: string) => Promise<Response>
    ): boolean => {
      const syncQueue = syncQueueRef.current;
      const isTempId = syncQueue.isTempId(entryId);

      if (isTempId) {
        // Apply optimistic update
        setTimeEntries((currentEntries) =>
          currentEntries.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  ...optimisticUpdate(entry),
                  syncStatus: "pending" as SyncStatus,
                }
              : entry
          )
        );

        // Queue the operation
        const sessionToken = localStorage.getItem("toggl_session_token");
        const operation: QueuedOperation = {
          type: operationType,
          tempId: entryId,
          payload: updates,
          retryCount: 0,
          timestamp: Date.now(),
          execute: async (realId: number) => {
            const response = await apiCall(realId, sessionToken || "");

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);
              throw new Error(`${operationType} failed (${response.status})`);
            }

            return response.json();
          },
        };

        syncQueue.queueOperation(operation);
        setEntrySyncStatus((prev) => new Map(prev).set(entryId, "pending"));

        toast("Update queued", {
          description: "Changes will sync once entry is created",
          duration: 2000,
        });

        return true; // Indicates operation was queued
      }

      return false; // Indicates should continue with normal flow
    },
    []
  );

  const handleDescriptionSave = React.useCallback(
    (entryId: number) => (newDescription: string) => {
      // Try to queue if temp ID
      const wasQueued = handleUpdateWithQueue(
        entryId,
        { description: newDescription },
        "UPDATE_DESCRIPTION",
        () => ({ description: newDescription }),
        (realId, sessionToken) => {
          // Encrypt description if E2EE is enabled and unlocked
          let finalDescription = newDescription;
          if (encryption.isE2EEEnabled && encryption.isUnlocked) {
            const sessionKey = encryption.getSessionKey();
            if (sessionKey) {
              try {
                finalDescription = encryptDescription(
                  newDescription,
                  sessionKey,
                  realId
                );
                encryption.markEntryEncrypted(realId);
              } catch (error) {
                console.error("[E2EE] Failed to encrypt description:", error);
              }
            }
          }

          return fetch(`/api/time-entries/${realId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken,
            },
            body: JSON.stringify({ description: finalDescription }),
          });
        }
      );

      if (wasQueued) return;

      // Original logic for real IDs
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        const updatedEntries = currentEntries.map((entry) =>
          entry.id === entryId
            ? { ...entry, description: newDescription }
            : entry
        );

        showUpdateToast(
          "Description updated.",
          entryId,
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");

            // Encrypt description if E2EE is enabled and unlocked
            let finalDescription = newDescription;
            console.log("[E2EE DEBUG] Editing entry:", {
              isE2EEEnabled: encryption.isE2EEEnabled,
              isUnlocked: encryption.isUnlocked,
              hasSessionKey: !!encryption.getSessionKey(),
              originalDescription: newDescription,
              entryId,
            });

            if (encryption.isE2EEEnabled && encryption.isUnlocked) {
              const sessionKey = encryption.getSessionKey();
              if (sessionKey) {
                try {
                  finalDescription = encryptDescription(
                    newDescription,
                    sessionKey,
                    entryId
                  );
                  encryption.markEntryEncrypted(entryId);
                  console.log("[E2EE DEBUG] Encrypted edited description:", {
                    original: newDescription,
                    encrypted: finalDescription,
                    lengthMatch:
                      newDescription.length === finalDescription.length,
                  });
                } catch (error) {
                  console.error("[E2EE] Failed to encrypt description:", error);
                }
              }
            } else {
              console.log(
                "[E2EE DEBUG] Skipping encryption - not enabled or locked"
              );
            }

            const response = await fetch(`/api/time-entries/${entryId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-toggl-session-token": sessionToken || "",
              },
              body: JSON.stringify({ description: finalDescription }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error("API Error:", response.status, errorText);

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

            await response.json();
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast, handleUpdateWithQueue, encryption]
  );

  const handleProjectChange = React.useCallback(
    (entryId: number) => (newProject: string) => {
      // Try to queue if temp ID
      const wasQueued = handleUpdateWithQueue(
        entryId,
        { project_name: newProject },
        "UPDATE_PROJECT",
        () => {
          const selectedProject = projectsRef.current.find(
            (p) => p.name === newProject
          );
          const newProjectColor =
            newProject === "No Project" || newProject === ""
              ? "#6b7280"
              : selectedProject?.color || "#6b7280";
          return {
            project_name: newProject || "No Project",
            project_color: newProjectColor,
          };
        },
        (realId, sessionToken) =>
          fetch(`/api/time-entries/${realId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken,
            },
            body: JSON.stringify({ project_name: newProject }),
          })
      );

      if (wasQueued) return;

      // Original logic for real IDs
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Find the project color for optimistic update using ref for up-to-date data
        const selectedProject = projectsRef.current.find(
          (p) => p.name === newProject
        );
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
          entryId,
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

            await response.json();
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast, handleUpdateWithQueue]
  );

  const handleTagsChange = React.useCallback(
    (entryId: number) => (newTags: string[]) => {
      // Convert tag names to tag IDs for API payload using ref for up-to-date data
      const tagIds = newTags
        .map((tagName) => {
          const tag = availableTagsRef.current.find((t) => t.name === tagName);
          return tag ? tag.id : null;
        })
        .filter((id): id is number => id !== null);

      // Try to queue if temp ID
      const wasQueued = handleUpdateWithQueue(
        entryId,
        { tag_ids: tagIds },
        "UPDATE_TAGS",
        () => ({ tags: newTags }),
        (realId, sessionToken) =>
          fetch(`/api/time-entries/${realId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken,
            },
            body: JSON.stringify({ tag_ids: tagIds }),
          })
      );

      if (wasQueued) return;

      // Original logic for real IDs
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
          entryId,
          () => setTimeEntries(originalEntries),
          async () => {
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
    [showUpdateToast, handleUpdateWithQueue]
  );

  const handleTagCreated = React.useCallback((newTag: Tag) => {
    // Update ref immediately for synchronous access
    if (!availableTagsRef.current.find((t) => t.id === newTag.id)) {
      availableTagsRef.current = [...availableTagsRef.current, newTag];
    }

    // Also update state for UI
    setAvailableTags((current) => {
      if (current.find((t) => t.id === newTag.id)) {
        return current;
      }
      return [...current, newTag];
    });
  }, []);

  const handleProjectCreated = React.useCallback((newProject: Project) => {
    // Update ref immediately for synchronous access
    if (!projectsRef.current.find((p) => p.id === newProject.id)) {
      projectsRef.current = [...projectsRef.current, newProject];
    }

    // Also update state for UI
    setProjects((current) => {
      if (current.find((p) => p.id === newProject.id)) {
        return current;
      }
      return [...current, newProject];
    });
  }, []);

  const handleBulkEntryUpdate = React.useCallback(
    (entryId: number) =>
      (updates: {
        description?: string;
        projectName?: string;
        tags?: string[];
      }) => {
        // Encrypt description if E2EE is enabled
        let finalDescription = updates.description;
        if (
          finalDescription !== undefined &&
          encryption.isE2EEEnabled &&
          encryption.isUnlocked
        ) {
          const sessionKey = encryption.getSessionKey();
          if (sessionKey) {
            try {
              finalDescription = encryptDescription(
                finalDescription,
                sessionKey,
                entryId
              );
              encryption.markEntryEncrypted(entryId);
            } catch (error) {
              console.error(
                "[E2EE] Failed to encrypt description in bulk update:",
                error
              );
            }
          }
        }

        // Check if this is a temp ID
        const syncQueue = syncQueueRef.current;
        const isTempId = syncQueue.isTempId(entryId);

        if (isTempId) {
          // Still apply optimistic update to UI
          setTimeEntries((currentEntries) => {
            const entry = currentEntries.find((e) => e.id === entryId);
            if (!entry) return currentEntries;

            // Find project ID if project name provided
            let projectId = entry.project_id;
            let projectName = entry.project_name;
            let projectColor = entry.project_color;

            if (updates.projectName !== undefined) {
              if (
                updates.projectName === "" ||
                updates.projectName === "No Project"
              ) {
                projectId = null;
                projectName = "";
                projectColor = "#6b7280";
              } else {
                const project = projects.find(
                  (p) => p.name === updates.projectName
                );
                if (project) {
                  projectId = project.id;
                  projectName = project.name;
                  projectColor = project.color;
                }
              }
            }

            return currentEntries.map((e) =>
              e.id === entryId
                ? {
                    ...e,
                    description:
                      finalDescription !== undefined
                        ? finalDescription
                        : e.description,
                    project_id: projectId,
                    project_name: projectName,
                    project_color: projectColor,
                    tags: updates.tags !== undefined ? updates.tags : e.tags,
                    syncStatus: "pending" as SyncStatus,
                  }
                : e
            );
          });

          // Queue the operation
          const operation: QueuedOperation = {
            type: "UPDATE_BULK",
            tempId: entryId,
            payload: { ...updates, description: finalDescription },
            retryCount: 0,
            timestamp: Date.now(),
            execute: async (realId: number) => {
              const sessionToken = localStorage.getItem("toggl_session_token");
              const payload: Record<string, string | number | number[] | null> =
                {};

              if (finalDescription !== undefined) {
                payload.description = finalDescription;
              }
              if (updates.projectName !== undefined) {
                payload.project_name = updates.projectName;
              }
              if (updates.tags !== undefined) {
                const tagIds = updates.tags
                  .map(
                    (tagName) =>
                      availableTagsRef.current.find((t) => t.name === tagName)
                        ?.id
                  )
                  .filter((id): id is number => id !== null);
                payload.tag_ids = tagIds;
              }

              const response = await fetch(`/api/time-entries/${realId}`, {
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
                throw new Error(`Failed to update entry (${response.status})`);
              }

              return response.json();
            },
          };

          syncQueue.queueOperation(operation);

          // Update sync status
          setEntrySyncStatus((prev) => new Map(prev).set(entryId, "pending"));

          toast("Update queued", {
            description: "Changes will sync once entry is created",
            duration: 2000,
          });

          return;
        }

        // Original logic for real IDs
        setTimeEntries((currentEntries) => {
          const originalEntries = [...currentEntries];
          const entry = currentEntries.find((e) => e.id === entryId);
          if (!entry) return currentEntries;

          // Find project ID if project name provided
          let projectId = entry.project_id;
          let projectName = entry.project_name;
          let projectColor = entry.project_color;

          if (updates.projectName !== undefined) {
            if (
              updates.projectName === "" ||
              updates.projectName === "No Project"
            ) {
              projectId = null;
              projectName = "";
              projectColor = "#6b7280";
            } else {
              const project = projects.find(
                (p) => p.name === updates.projectName
              );
              if (project) {
                projectId = project.id;
                projectName = project.name;
                projectColor = project.color;
              }
            }
          }

          // Create updated entries
          const updatedEntries = currentEntries.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  description:
                    finalDescription !== undefined
                      ? finalDescription
                      : e.description,
                  project_id: projectId,
                  project_name: projectName,
                  project_color: projectColor,
                  tags: updates.tags !== undefined ? updates.tags : e.tags,
                }
              : e
          );

          showUpdateToast(
            "Entry updated.",
            entryId,
            () => setTimeEntries(originalEntries),
            async () => {
              const sessionToken = localStorage.getItem("toggl_session_token");
              const payload: Record<string, string | number | number[] | null> =
                {};

              if (finalDescription !== undefined) {
                payload.description = finalDescription;
              }
              if (updates.projectName !== undefined) {
                payload.project_name = updates.projectName;
              }
              if (updates.tags !== undefined) {
                // Convert tag names to IDs
                const tagIds = updates.tags
                  .map(
                    (tagName) =>
                      availableTags.find((t) => t.name === tagName)?.id
                  )
                  .filter((id): id is number => id !== null);
                payload.tag_ids = tagIds;
              }

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
                throw new Error(`Failed to update entry (${response.status})`);
              }

              await response.json();
            }
          );

          return updatedEntries;
        });
      },
    [showUpdateToast, projects, availableTags, encryption]
  );

  // Helper to handle bulk update resolving temp ID to real ID (avoids closure issues)
  const handleBulkEntryUpdateByRowIndex = React.useCallback(
    (capturedId: number) =>
      (updates: {
        description?: string;
        projectName?: string;
        tags?: string[];
      }) => {
        // Find the entry - it might still have the temp ID or it might have been updated to real ID
        let currentEntry = timeEntriesRef.current.find(
          (e) => e.id === capturedId
        );

        if (currentEntry) {
        }

        // If not found by ID, try finding by tempId field (ID might have changed)
        if (!currentEntry) {
          currentEntry = timeEntriesRef.current.find(
            (e) => e.tempId === capturedId
          );
          if (currentEntry) {
          }
        }

        if (!currentEntry) {
          console.error(
            `[handleBulkEntryUpdateByRowIndex] ❌ No entry found with ID or tempId ${capturedId}`
          );
          return;
        }

        // Call the actual bulk update with the CURRENT entry ID
        handleBulkEntryUpdate(currentEntry.id)(updates);
      },
    [handleBulkEntryUpdate]
  );

  const handleTimeChange = React.useCallback(
    (entryId: number) => (startTime: string, endTime: string | null) => {
      // Calculate duration for optimistic update
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : null;
      const duration = end
        ? Math.floor((end.getTime() - start.getTime()) / 1000)
        : -1;

      // Try to queue if temp ID
      const wasQueued = handleUpdateWithQueue(
        entryId,
        { start: startTime, stop: endTime || undefined },
        "UPDATE_TIME",
        () => ({
          start: startTime,
          stop: endTime || "",
          duration: duration,
        }),
        (realId, sessionToken) =>
          fetch(`/api/time-entries/${realId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken,
            },
            body: JSON.stringify({
              start: startTime,
              stop: endTime || undefined,
            }),
          })
      );

      if (wasQueued) return;

      // Original logic for real IDs
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

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
          entryId,
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
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast, handleUpdateWithQueue]
  );

  const handleDurationChange = React.useCallback(
    (entryId: number) => (newDuration: number) => {
      // Need to check if entry is running before queueing
      const entry = timeEntriesRef.current.find((e) => e.id === entryId);
      const isRunning = entry && (!entry.stop || entry.duration === -1);

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

      // Try to queue if temp ID
      const wasQueued = handleUpdateWithQueue(
        entryId,
        payload,
        "UPDATE_DURATION",
        (entry) => {
          if (isRunning) {
            // For running timers, move start time backwards (now - duration)
            const now = new Date();
            const newStartDate = new Date(now.getTime() - newDuration * 1000);
            return {
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
              duration: newDuration,
              stop: newStopDate.toISOString(),
            };
          }
        },
        (realId, sessionToken) =>
          fetch(`/api/time-entries/${realId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken,
            },
            body: JSON.stringify(payload),
          })
      );

      if (wasQueued) return;

      // Original logic for real IDs
      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

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
          entryId,
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");

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
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast, handleUpdateWithQueue]
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
          entryId,
          () => setTimeEntries(originalEntries),
          async () => {
            const sessionToken = localStorage.getItem("toggl_session_token");

            // Always send new start time
            const newStart = isRunning
              ? new Date(
                  new Date().getTime() - newDuration * 1000
                ).toISOString()
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
          }
        );

        return updatedEntries;
      });
    },
    [showUpdateToast]
  );

  const handleDelete = React.useCallback(
    (entryToDelete: TimeEntry) => {
      // Find the index of the entry being deleted
      const deletedIndex = timeEntries.findIndex(
        (e) => e.id === entryToDelete.id
      );

      setTimeEntries((currentEntries) => {
        const originalEntries = [...currentEntries];

        // Create filtered entries
        const filteredEntries = currentEntries.filter(
          (entry) => entry.id !== entryToDelete.id
        );

        showUpdateToast(
          "Time entry deleted.",
          entryToDelete.id,
          () => {
            setTimeEntries(originalEntries);
          },
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
              console.error(`[handleDelete] ❌ DELETE FAILED:`, {
                status: response.status,
                errorText,
                entryId: entryToDelete.id,
              });

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

      // Adjust selector position after deletion
      if (selectedCell && selectedCell.rowIndex === deletedIndex) {
        // If we deleted the selected row, move selector to the same position (or previous if last row)
        const newRowIndex = Math.min(deletedIndex, timeEntries.length - 2); // -2 because we removed one
        if (newRowIndex >= 0) {
          setTimeout(() => {
            setSelectedCell({
              rowIndex: newRowIndex,
              cellIndex: selectedCell.cellIndex,
            });
          }, 50);
        }
      } else if (selectedCell && selectedCell.rowIndex > deletedIndex) {
        // If selector is below deleted row, shift it up by 1
        setSelectedCell({
          rowIndex: selectedCell.rowIndex - 1,
          cellIndex: selectedCell.cellIndex,
        });
      }
    },
    [showUpdateToast, selectedCell, timeEntries]
  );

  const handleSplit = React.useCallback((entry: TimeEntry) => {
    setEntryToSplit(entry);
    setSplitDialogOpen(true);
  }, []);

  const handleConfirmSplit = React.useCallback(
    (offsetMinutes: number, isReverse = false) => {
      if (!entryToSplit) return;

      let originalEntries: TimeEntry[] = [];
      const isRunning = !entryToSplit.stop || entryToSplit.duration === -1;
      const startTime = new Date(entryToSplit.start);
      const endTime = isRunning ? new Date() : new Date(entryToSplit.stop!);
      const offsetMs = offsetMinutes * 60 * 1000;

      // Split point is offsetMinutes from the end (or from now if running)
      // OR offsetMinutes from the start if isReverse is true
      const splitPoint = isReverse
        ? startTime.getTime() + offsetMs
        : endTime.getTime() - offsetMs;

      // Generate temp ID for the second entry
      const tempId = -Date.now();

      // Optimistically create the split entries
      const splitEntries: TimeEntry[] = [];

      // Update the first entry (original, ending at split point)
      const firstEntry: TimeEntry = {
        ...entryToSplit,
        stop: new Date(splitPoint).toISOString(),
        duration: Math.floor((splitPoint - startTime.getTime()) / 1000),
      };
      splitEntries.push(firstEntry);

      // Create second entry (from split point to original end or running)
      const secondEntry: TimeEntry = {
        ...entryToSplit,
        id: tempId,
        tempId: tempId,
        start: new Date(splitPoint).toISOString(),
        stop: isRunning ? "" : endTime.toISOString(),
        duration: isRunning
          ? -1
          : Math.floor((endTime.getTime() - splitPoint) / 1000),
      };
      splitEntries.push(secondEntry);

      // Update UI optimistically
      setTimeEntries((currentEntries) => {
        originalEntries = [...currentEntries];

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
          isReverse,
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
          const { createdEntry } = data;
          if (createdEntry && createdEntry.id) {
            const realId = createdEntry.id;

            // Register ID mapping for the sync queue
            const syncQueue = syncQueueRef.current;
            syncQueue.registerIdMapping(tempId, realId);

            // Swap temp ID with real ID in encrypted entries tracking
            encryption.swapEncryptedEntryId(tempId, realId);

            // Replace the temporary entry with the real one from the server
            setTimeEntries((prev) =>
              prev.map((entry) =>
                entry.id === tempId
                  ? ({
                      ...entry,
                      id: realId,
                      tempId,
                      syncStatus: "syncing" as SyncStatus,
                    } as TimeEntry)
                  : entry
              )
            );

            // Move sync status from temp ID to real ID
            setEntrySyncStatus((prev) => {
              const newMap = new Map(prev);
              const tempStatus = newMap.get(tempId);
              newMap.delete(tempId);
              if (tempStatus) {
                newMap.set(realId, "syncing");
              }
              return newMap;
            });

            // Move retry function from temp ID to real ID (if exists)
            const tempRetryFn = entryRetryFunctions.current.get(tempId);
            if (tempRetryFn) {
              entryRetryFunctions.current.delete(tempId);
              entryRetryFunctions.current.set(realId, tempRetryFn);
            }

            // Flush any queued operations for this entry
            syncQueue.flushOperations(tempId, realId).then((results) => {
              const allSucceeded = results.every((r) => r.success);

              // Update final sync status based on results
              setEntrySyncStatus((prev) => {
                const newMap = new Map(prev);
                newMap.set(realId, allSucceeded ? "synced" : "error");
                return newMap;
              });

              // Clear synced status after 2 seconds
              setTimeout(() => {
                setEntrySyncStatus((prev) => {
                  const newMap = new Map(prev);
                  newMap.delete(realId);
                  return newMap;
                });
              }, 2000);
            });
          }

          toast.success(data.message || "Entry split successfully");
        })
        .catch((error) => {
          console.error("Failed to split time entry:", error);
          toast.error("Failed to split entry. Reverting changes.");
          setTimeEntries(originalEntries);
        });
    },
    [entryToSplit, toastDuration]
  );

  const handleCombine = React.useCallback(
    (entry: TimeEntry) => {
      // Find chronologically previous entry (older entry, which is at HIGHER index since list is sorted newest first)
      const currentIndex = timeEntries.findIndex((e) => e.id === entry.id);
      if (currentIndex === timeEntries.length - 1) {
        toast.error("Cannot combine the last entry (oldest entry)");
        return;
      }

      setEntryToCombine(entry);
      combineDialogOpenRef.current = true;
      setCombineDialogOpen(true);
    },
    [timeEntries]
  );

  const handleConfirmCombine = React.useCallback(() => {
    if (!entryToCombine) return;

    // Find the older entry again (chronologically previous, at higher index)
    const currentIndex = timeEntries.findIndex(
      (e) => e.id === entryToCombine.id
    );
    if (currentIndex === timeEntries.length - 1) {
      toast.error("Cannot combine the last entry (oldest entry)");
      return;
    }

    const olderEntry = timeEntries[currentIndex + 1];
    const syncQueue = syncQueueRef.current;
    const currentIsTempId = syncQueue.isTempId(entryToCombine.id);
    const olderIsTempId = syncQueue.isTempId(olderEntry.id);

    const isCurrentEntryRunning =
      !entryToCombine.stop || entryToCombine.duration === -1;

    let originalEntries: TimeEntry[] = [];

    // Optimistically update UI
    setTimeEntries((currentEntries) => {
      originalEntries = [...currentEntries];

      // Remove current entry and update older entry
      const updatedEntries = currentEntries
        .filter((e) => e.id !== entryToCombine.id)
        .map((e) => {
          if (e.id === olderEntry.id) {
            if (isCurrentEntryRunning) {
              // Make older entry a running timer
              return {
                ...e,
                stop: "",
                duration: -1,
                syncStatus:
                  currentIsTempId || olderIsTempId
                    ? ("pending" as SyncStatus)
                    : e.syncStatus,
              };
            } else {
              // Extend older entry to current entry's stop time
              const start = new Date(e.start);
              const stop = new Date(entryToCombine.stop!);
              const newDuration = Math.floor(
                (stop.getTime() - start.getTime()) / 1000
              );
              return {
                ...e,
                stop: entryToCombine.stop!,
                duration: newDuration,
                syncStatus:
                  currentIsTempId || olderIsTempId
                    ? ("pending" as SyncStatus)
                    : e.syncStatus,
              };
            }
          }
          return e;
        });

      return updatedEntries;
    });

    const sessionToken = localStorage.getItem("toggl_session_token");

    // If either entry has a temp ID, queue the operation
    if (currentIsTempId || olderIsTempId) {
      // If both are temp IDs, we can't execute yet - need both to have real IDs
      if (currentIsTempId && olderIsTempId) {
        toast.error("Cannot combine two entries that haven't been synced yet");
        // Revert optimistic UI update
        setTimeEntries(originalEntries);
        return;
      }

      // Only one is a temp ID - queue it
      const operation: QueuedOperation = {
        type: "COMBINE",
        tempId: currentIsTempId ? entryToCombine.id : olderEntry.id,
        payload: {
          currentEntryId: entryToCombine.id,
          olderEntryId: olderEntry.id,
          isCurrentEntryRunning,
        },
        retryCount: 0,
        timestamp: Date.now(),
        execute: async (realId: number) => {
          // Determine which ID to use - replace the temp ID with the real ID
          const finalCurrentId = currentIsTempId ? realId : entryToCombine.id;
          const finalOlderId = olderIsTempId ? realId : olderEntry.id;

          const response = await fetch("/api/time-entries/combine", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken || "",
            },
            body: JSON.stringify({
              currentEntryId: finalCurrentId,
              olderEntryId: finalOlderId,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("API Error:", response.status, errorText);
            throw new Error(`Combine failed (${response.status})`);
          }

          const data = await response.json();

          // Update UI with server response
          setTimeEntries((currentEntries) =>
            currentEntries.map((e) =>
              e.id === finalOlderId
                ? {
                    ...e,
                    stop: data.updatedEntry.stop,
                    duration: data.updatedEntry.duration,
                  }
                : e
            )
          );

          // Update sync status to synced on the older entry
          setEntrySyncStatus((prev) => {
            const newMap = new Map(prev);
            newMap.set(finalOlderId, "synced");
            return newMap;
          });

          // Clear sync status after 2 seconds
          setTimeout(() => {
            setEntrySyncStatus((prev) => {
              const newMap = new Map(prev);
              newMap.delete(finalOlderId);
              return newMap;
            });
          }, 2000);

          toast.success(data.message || "Entries combined successfully");
        },
      };

      syncQueue.queueOperation(operation);
      // Set sync status on the older entry (the one that remains visible)
      // Even though we queue on the temp ID, we display status on the older entry
      setEntrySyncStatus((prev) => new Map(prev).set(olderEntry.id, "pending"));

      toast("Combine queued", {
        description: "Changes will sync once entry is created",
        duration: 2000,
      });

      return;
    }

    // Both IDs are real - execute immediately
    toast(`Combining entries...`, {
      duration: toastDuration,
    });

    fetch("/api/time-entries/combine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-toggl-session-token": sessionToken || "",
      },
      body: JSON.stringify({
        currentEntryId: entryToCombine.id,
        olderEntryId: olderEntry.id,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error:", response.status, errorText);
          throw new Error("Failed to combine entries");
        }
        return response.json();
      })
      .then((data) => {
        // Update only stop and duration from server response, keep everything else
        setTimeEntries((currentEntries) =>
          currentEntries.map((e) =>
            e.id === olderEntry.id
              ? {
                  ...e,
                  stop: data.updatedEntry.stop,
                  duration: data.updatedEntry.duration,
                }
              : e
          )
        );

        toast.success(data.message || "Entries combined successfully");
      })
      .catch((error) => {
        console.error("Failed to combine time entries:", error);
        toast.error("Failed to combine entries. Reverting changes.");
        setTimeEntries(originalEntries);
      });
  }, [entryToCombine, timeEntries, toastDuration]);

  const startNewTimeEntry = React.useCallback(
    (
      description: string = "",
      projectName: string = "No Project",
      projectColor: string = "#6b7280",
      tags: string[] = [],
      stopTime?: string
    ) => {
      let originalEntries: TimeEntry[] = [];
      let newEntry: TimeEntry | null = null;
      let runningEntry: TimeEntry | null = null;

      // CRITICAL: Generate temp ID ONCE before any callbacks to ensure consistency
      const tempId = -Date.now();

      // Create timestamp once at the start
      const now = new Date().toISOString();
      const isRunning = stopTime === undefined;

      // Get project_id from projectName
      const project = projects.find((p) => p.name === projectName);
      const project_id = project ? project.id : null;

      // Convert tag names to tag IDs
      const tag_ids = tags
        .map((tagName) => {
          const tag = availableTags.find((t) => t.name === tagName);
          return tag ? tag.id : null;
        })
        .filter((id): id is number => id !== null);

      setTimeEntries((currentEntries) => {
        originalEntries = [...currentEntries];

        // Use the temp ID generated above (NOT -Date.now() again!)

        // Find currently running entry (no stop time) for UI feedback
        runningEntry = currentEntries.find((entry) => !entry.stop) || null;

        newEntry = {
          id: tempId,
          tempId: tempId, // Set tempId from the start so React key remains stable
          description,
          project_id,
          project_name: projectName,
          project_color: projectColor,
          start: now,
          stop: isRunning ? "" : stopTime || now,
          duration: isRunning ? -1 : 0,
          tags,
          tag_ids,
        };

        // Optimistically stop the previous running timer and add new entry (only if new entry is running)
        const updatedEntries =
          isRunning && runningEntry
            ? currentEntries.map((entry) => {
                if (runningEntry && entry.id === runningEntry.id) {
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

      // Select the new entry for immediate editing (cellIndex 1 to skip date column)
      setTimeout(() => {
        setSelectedCell({ rowIndex: 0, cellIndex: 1 });
      }, 50);

      // Use the same toast + delayed API pattern as updates for consistency
      const sessionToken = localStorage.getItem("toggl_session_token");
      let createdEntryId: number | null = null;

      const apiCall = async () => {
        try {
          // Encrypt description if E2EE is enabled and unlocked
          let finalDescription = description;

          if (encryption.isE2EEEnabled && encryption.isUnlocked) {
            const sessionKey = encryption.getSessionKey();
            if (sessionKey) {
              try {
                finalDescription = encryptDescription(
                  description,
                  sessionKey,
                  tempId
                );
                encryption.markEntryEncrypted(tempId);
              } catch (error) {
                console.error("[E2EE] Failed to encrypt description:", error);
                // Continue with unencrypted description if encryption fails
              }
            }
          }

          const response = await fetch("/api/time-entries", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-toggl-session-token": sessionToken || "",
            },
            body: JSON.stringify({
              description: finalDescription,
              start: now,
              ...(stopTime !== undefined && { stop: stopTime || now }),
              project_name: projectName,
              tag_ids: tags
                .map((tagName) => {
                  const tag = availableTagsRef.current.find(
                    (t) => t.name === tagName
                  );
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

          // Register ID mapping for the sync queue
          if (createdEntryId) {
            const realId = createdEntryId; // Assign to const for TypeScript
            const syncQueue = syncQueueRef.current;

            syncQueue.registerIdMapping(tempId, realId);

            // Swap temp ID with real ID in encrypted entries tracking
            encryption.swapEncryptedEntryId(tempId, realId);

            // Update the entry's ID from temp to real, preserving any optimistic updates made to the entry
            setTimeEntries((prev) =>
              prev.map((entry) =>
                entry.id === tempId
                  ? ({
                      ...entry,
                      id: realId,
                      tempId,
                      syncStatus: "syncing" as SyncStatus,
                    } as TimeEntry)
                  : entry
              )
            );

            // Move sync status from temp ID to real ID
            setEntrySyncStatus((prev) => {
              const newMap = new Map(prev);
              const tempStatus = newMap.get(tempId);
              newMap.delete(tempId);
              if (tempStatus) {
                newMap.set(realId, "syncing");
              }
              return newMap;
            });

            // Move retry function from temp ID to real ID (if exists)
            const tempRetryFn = entryRetryFunctions.current.get(tempId);
            if (tempRetryFn) {
              entryRetryFunctions.current.delete(tempId);
              entryRetryFunctions.current.set(realId, tempRetryFn);
            }

            // Flush any queued operations for this entry
            const results = await syncQueue.flushOperations(tempId, realId);

            const allSucceeded = results.every((r) => r.success);

            // Update final sync status based on results
            setEntrySyncStatus((prev) => {
              const newMap = new Map(prev);
              newMap.set(realId, allSucceeded ? "synced" : "error");
              return newMap;
            });

            // Clear synced status after 2 seconds (same as showUpdateToast)
            setTimeout(() => {
              setEntrySyncStatus((prev) => {
                const newMap = new Map(prev);
                newMap.delete(realId);
                return newMap;
              });
            }, 2000);
          }
        } catch (error) {
          console.error("Failed to create time entry:", error);
          throw error;
        }
      };

      const undoAction = () => {
        setTimeEntries(originalEntries);

        // If the API call succeeded, delete the created entry
        if (createdEntryId) {
          fetch(`/api/time-entries/${createdEntryId}`, {
            method: "DELETE",
            headers: {
              "x-toggl-session-token": sessionToken || "",
            },
          }).catch((error) => {
            console.error("Failed to undo time entry creation:", error);
          });
        }
      };

      showUpdateToast(
        runningEntry
          ? "Stopped previous timer and started new one"
          : "New time entry started",
        tempId,
        undoAction,
        apiCall
      );
    },
    [projects, availableTags, showUpdateToast, encryption]
  );

  const handleCopyAndStartEntry = React.useCallback(
    (entry: TimeEntry) => {
      // Decrypt description if it's encrypted (due to React.memo caching stale entry objects)
      let description = entry.description;

      if (
        encryption.isE2EEEnabled &&
        encryption.isUnlocked &&
        encryption.isEntryEncrypted(entry.id)
      ) {
        const sessionKey = encryption.getSessionKey();
        if (sessionKey) {
          try {
            description = decryptDescription(
              entry.description,
              sessionKey,
              entry.id
            );
          } catch (error) {
            console.error("[E2EE] Failed to decrypt entry description:", error);
          }
        }
      }

      startNewTimeEntry(
        description,
        entry.project_name || "No Project",
        entry.project_color || "#6b7280",
        entry.tags || []
      );
    },
    [startNewTimeEntry, encryption]
  );

  const handleStopTimer = React.useCallback(async (entry: TimeEntry) => {
    const now = new Date();
    const start = new Date(entry.start);
    const durationInSeconds = Math.floor(
      (now.getTime() - start.getTime()) / 1000
    );

    try {
      const sessionToken = localStorage.getItem("toggl_session_token");
      const response = await fetch(`/api/time-entries/${entry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-toggl-session-token": sessionToken || "",
        },
        body: JSON.stringify({
          stop: now.toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Failed to stop timer");

      // Update the time entries to reflect the stopped timer
      setTimeEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, stop: now.toISOString(), duration: durationInSeconds }
            : e
        )
      );
    } catch (error) {
      console.error("Error stopping timer:", error);
      toast.error("Failed to stop timer");
    }
  }, []);

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
        // Get user's timezone offset in minutes
        const timezoneOffset = new Date().getTimezoneOffset();
        const response = await fetch(
          `/api/time-entries?start_date=${fromISO}&end_date=${toISO}&page=${pageToFetch}&limit=${limit}&timezone_offset=${timezoneOffset}`,
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
            // Update recent timers cache with new entries
            updateRecentTimersCache(data.timeEntries);

            // Preserve entries that have errors - don't overwrite with server data
            setTimeEntries((prevEntries) => {
              const erroredEntryIds = Array.from(
                entrySyncStatusRef.current.entries()
              )
                .filter(([, status]) => status === "error")
                .map(([id]) => id);

              // If no errored entries, just use the new data
              if (erroredEntryIds.length === 0) {
                return data.timeEntries;
              }

              // Keep errored entries from previous state, use server data for rest
              const erroredEntries = prevEntries.filter((entry) =>
                erroredEntryIds.includes(entry.id)
              );

              // Merge: use server data, but override with errored entries
              const serverEntryIds = new Set(
                data.timeEntries.map((e: TimeEntry) => e.id)
              );
              const mergedEntries = [
                ...data.timeEntries.map((serverEntry: TimeEntry) => {
                  // If this entry has an error, use the local version instead
                  const erroredVersion = erroredEntries.find(
                    (e) => e.id === serverEntry.id
                  );
                  return erroredVersion || serverEntry;
                }),
                // Add any errored entries that aren't in the server response
                ...erroredEntries.filter((e) => !serverEntryIds.has(e.id)),
              ];

              return mergedEntries;
            });
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
            if (
              JSON.stringify(currentProjects) === JSON.stringify(data.projects)
            ) {
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
        // Column mapping depends on fullscreen mode
        // Normal mode: Date(0), Description(1), Project(2), Tags(3), Time(4), Duration(5), Actions(6)
        // Fullscreen mode: Date(0), Project(1), Description(2), Tags(3), Time(4), Duration(5), Actions(6)

        if (isFullscreen) {
          switch (cellIndex) {
            case 1: // Project (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const projectElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="project-selector"]`
              ) as HTMLElement;
              if (projectElementFS) {
                projectElementFS.click();
              }
              break;
            case 2: // Description (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const descriptionElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="expandable-description"]`
              ) as HTMLElement;
              if (descriptionElementFS) {
                descriptionElementFS.click();
              }
              break;
            case 3: // Tags (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const tagElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="tag-selector"]`
              ) as HTMLElement;
              if (tagElementFS) {
                tagElementFS.click();
              }
              break;
            case 4: // Time (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const timeElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="time-editor"]`
              ) as HTMLElement;
              if (timeElementFS) {
                timeElementFS.click();
              }
              break;
            case 5: // Duration (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const durationElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="duration-editor"]`
              ) as HTMLElement;
              if (durationElementFS) {
                durationElementFS.click();
              }
              break;
            case 6: // Actions (fullscreen)
              // In fullscreen, use the desktop view (not mobile view)
              const menuElementFS = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="actions-menu"]`
              ) as HTMLElement;
              if (menuElementFS) {
                menuElementFS.click();
              }
              break;
          }
        } else {
          switch (cellIndex) {
            case 1: // Description (normal)
              // Query for visible desktop row only (not mobile)
              const descriptionElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="expandable-description"]`
              ) as HTMLElement;
              if (descriptionElement) {
                descriptionElement.click();
              }
              break;
            case 2: // Project (normal)
              // Query for visible desktop row only (not mobile)
              const projectElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="project-selector"]`
              ) as HTMLElement;
              if (projectElement) {
                projectElement.click();
              }
              break;
            case 3: // Tags (normal)
              // Query for visible desktop row only (not mobile)
              const tagElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="tag-selector"]`
              ) as HTMLElement;
              if (tagElement) {
                tagElement.click();
              }
              break;
            case 4: // Time (normal)
              // Query for visible desktop row only (not mobile)
              const timeElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="time-editor"]`
              ) as HTMLElement;
              if (timeElement) {
                timeElement.click();
              }
              break;
            case 5: // Duration (normal)
              // Query for visible desktop row only (not mobile)
              const durationElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="duration-editor"]`
              ) as HTMLElement;
              if (durationElement) {
                durationElement.click();
              }
              break;
            case 6: // Actions (normal)
              // Query for visible desktop row only (not mobile)
              const menuElement = document.querySelector(
                `[data-entry-id="${entry.id}"]:not(.md\\:hidden) [data-testid="actions-menu"]`
              ) as HTMLElement;
              if (menuElement) {
                menuElement.click();
              }
              break;
          }
        }
      });
    },
    [isFullscreen] // Need isFullscreen to determine column mapping
  );

  const navigateToNextCell = React.useCallback(
    (wrapToSameRow = false) => {
      // Store current cell info before updating state
      let shouldAutoOpen = false;
      let targetRowIndex = 0;
      let targetCellIndex = 0;

      setSelectedCell((currentSelectedCell) => {
        if (!currentSelectedCell) return null;

        const maxCellIndex = 6; // 7 columns: date, project, tags, description, time, duration, actions
        const currentEntriesLength = timeEntriesRef.current.length;

        if (currentSelectedCell.cellIndex < maxCellIndex) {
          const nextCellIndex = currentSelectedCell.cellIndex + 1;

          // Check if we should auto-open project selector (1), tag selector (2), description (3), time editor (4), or duration editor (5)
          if (
            nextCellIndex === 1 ||
            nextCellIndex === 2 ||
            nextCellIndex === 3 ||
            nextCellIndex === 4 ||
            nextCellIndex === 5
          ) {
            shouldAutoOpen = true;
            targetRowIndex = currentSelectedCell.rowIndex;
            targetCellIndex = nextCellIndex;
          }

          return {
            ...currentSelectedCell,
            cellIndex: nextCellIndex,
          };
        } else if (wrapToSameRow) {
          // When Option+Tab is pressed at the end, wrap to cellIndex 1 of same row
          shouldAutoOpen = true;
          targetRowIndex = currentSelectedCell.rowIndex;
          targetCellIndex = 1;
          return { rowIndex: currentSelectedCell.rowIndex, cellIndex: 1 };
        } else if (currentSelectedCell.rowIndex < currentEntriesLength - 1) {
          // When wrapping to next row, skip cellIndex 0 (date column) and start at 1
          return { rowIndex: currentSelectedCell.rowIndex + 1, cellIndex: 1 };
        }

        return currentSelectedCell; // No change if at the end
      });

      // Call activateCell AFTER state update, outside the callback
      if (shouldAutoOpen) {
        setTimeout(() => activateCell(targetRowIndex, targetCellIndex), 0);
      }
    },
    [activateCell]
  );

  const navigateToPrevCell = React.useCallback(() => {
    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      // cellIndex 0 = date (not editable, skip it)
      // cellIndex 1 = first editable cell
      if (currentSelectedCell.cellIndex > 1) {
        const prevCellIndex = currentSelectedCell.cellIndex - 1;
        return {
          ...currentSelectedCell,
          cellIndex: prevCellIndex,
        };
      } else if (currentSelectedCell.cellIndex === 1) {
        // At first editable cell, wrap to previous row's last cell
        if (currentSelectedCell.rowIndex > 0) {
          return {
            rowIndex: currentSelectedCell.rowIndex - 1,
            cellIndex: 6, // Move to last cell of previous row
          };
        }
      }

      return currentSelectedCell; // No change if at the beginning
    });
  }, []);

  const navigateToNextRow = React.useCallback(() => {
    setSelectedCell((currentSelectedCell) => {
      if (!currentSelectedCell) return null;

      const currentEntriesLength = timeEntriesRef.current.length;

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
  }, [activateCell]);

  // Keep refs in sync with state
  React.useEffect(() => {
    timeEntriesRef.current = timeEntries;
  }, [timeEntries]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

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

      // Don't sync if there's an active toast to prevent accidental data loss
      const toastActive = hasActiveToast();
      if (toastActive) {
        return;
      }

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
      // Decrypt the description if it's encrypted (since startNewTimeEntry expects plaintext)
      let description = entry.description;
      const entryId = parseInt(entry.id, 10);

      if (
        encryption.isE2EEEnabled &&
        encryption.isUnlocked &&
        encryption.isEntryEncrypted(entryId)
      ) {
        const sessionKey = encryption.getSessionKey();
        if (sessionKey) {
          try {
            description = decryptDescription(
              entry.description,
              sessionKey,
              entryId
            );
          } catch (error) {
            console.error(
              "[E2EE] Failed to decrypt pinned entry description:",
              error
            );
          }
        }
      }

      startNewTimeEntry(
        description,
        entry.project_name,
        entry.project_color,
        entry.tags
      );
    },
    [startNewTimeEntry, encryption]
  );

  // Stable functions for keyboard navigation
  const handleNewTimer = React.useCallback(() => {
    startNewTimeEntry();
  }, [startNewTimeEntry]);

  const handleNewStoppedEntry = React.useCallback(() => {
    const now = new Date().toISOString();
    startNewTimeEntry("", "No Project", "#6b7280", [], now);
  }, [startNewTimeEntry]);

  const handleNewEntryClick = React.useCallback(() => {
    // If already showing pinned entries, create empty timer
    if (showPinnedEntries) {
      setShowPinnedEntries(false);
      handleNewTimer();
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
    handleNewTimer();
  }, [showPinnedEntries, pinnedEntries.length, handleNewTimer]);

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
      const entry = decryptedEntries[selectedCell.rowIndex];
      if (entry) {
        setEntryToDelete(entry);
        deleteDialogOpenRef.current = true;
        setDeleteDialogOpen(true);
      }
    }
  }, [selectedCell, decryptedEntries]);

  const handleDeleteWithConfirmation = React.useCallback((entry: TimeEntry) => {
    setEntryToDelete(entry);
    deleteDialogOpenRef.current = true;
    setDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    if (entryToDelete) {
      handleDelete(entryToDelete);
      // Don't clear selectedCell - handleDelete now maintains it
      setEntryToDelete(null);
    }
  }, [entryToDelete, handleDelete]);

  const handleReauthenticate = React.useCallback(() => {
    // Clear the session token and redirect to login
    localStorage.removeItem("toggl_session_token");
    window.location.reload(); // This will trigger the welcome form
  }, []);

  const handleRetrySync = React.useCallback(async (entryId: number) => {
    const syncQueue = syncQueueRef.current;

    // Check if this entry has queued operations that failed
    if (syncQueue.hasPendingOperations(entryId)) {
      setEntrySyncStatus((prev) => {
        const next = new Map(prev);
        next.set(entryId, "syncing");
        return next;
      });

      try {
        const results = await syncQueue.retryFailedOperations(entryId);
        const allSucceeded = results.every((r) => r.success);

        setEntrySyncStatus((prev) => {
          const next = new Map(prev);
          next.set(entryId, allSucceeded ? "synced" : "error");
          return next;
        });

        if (allSucceeded) {
          toast.success("Operations synced successfully");
          // Clear synced status after 2 seconds
          setTimeout(() => {
            setEntrySyncStatus((prev) => {
              const next = new Map(prev);
              next.delete(entryId);
              return next;
            });
          }, 2000);
        } else {
          toast.error("Some operations failed to sync");
        }
      } catch (error) {
        console.error("Retry failed:", error);
        setEntrySyncStatus((prev) => {
          const next = new Map(prev);
          next.set(entryId, "error");
          return next;
        });
        toast.error("Retry failed. Please try again.");
      }

      return;
    }

    // Get the stored retry function (existing logic)
    const retryFn = entryRetryFunctions.current.get(entryId);

    if (!retryFn) {
      console.warn(`No retry function found for entry ${entryId}`);
      // Clear error status if no retry function
      setEntrySyncStatus((prev) => {
        const next = new Map(prev);
        next.delete(entryId);
        return next;
      });
      return;
    }

    // Mark as syncing
    setEntrySyncStatus((prev) => {
      const next = new Map(prev);
      next.set(entryId, "syncing");
      return next;
    });

    try {
      // Retry the API call
      await retryFn();

      // Mark as synced and clear retry function
      setEntrySyncStatus((prev) => {
        const next = new Map(prev);
        next.set(entryId, "synced");
        return next;
      });
      entryRetryFunctions.current.delete(entryId);

      // Clear synced status after 2 seconds
      setTimeout(() => {
        setEntrySyncStatus((prev) => {
          const next = new Map(prev);
          next.delete(entryId);
          return next;
        });
      }, 2000);
    } catch (error) {
      console.error("Retry failed:", error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Retry failed. Please try again.";

      // Mark as error again
      setEntrySyncStatus((prev) => {
        const next = new Map(prev);
        next.set(entryId, "error");
        return next;
      });

      toast.error(errorMessage);
    }
  }, []);

  // Stable cell selection callback
  const handleSelectCell = React.useCallback(
    (rowIndex: number, cellIndex: number) => {
      setSelectedCell({ rowIndex, cellIndex });
    },
    []
  );

  // Keyboard navigation
  const awaitingPinnedNumberRef = React.useRef(false);
  const pinnedTimeoutIdRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input/textarea OR editing a cell
      const activeElement = document.activeElement;
      const isInInput =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement)?.contentEditable === "true" ||
        activeElement?.getAttribute("role") === "textbox";

      // If we're editing a cell, any selector is open, or actions menu is open, don't handle global navigation
      // Exception: allow action shortcuts (d, x, c, s, p) to work when actions menu is open
      const isActionShortcut = ["d", "x", "c", "s", "p"].includes(e.key.toLowerCase());
      if (
        isEditingCell ||
        isProjectSelectorOpen ||
        isTagSelectorOpen ||
        isTimeEditorOpen ||
        (isActionsMenuOpen && !isActionShortcut)
      )
        return;

      // Handle 'n' key - show pinned entries if available, otherwise create new timer
      if (e.key.toLowerCase() === "n" && !isInInput) {
        e.preventDefault();

        // If already showing pinned entries, create new timer
        if (awaitingPinnedNumberRef.current) {
          awaitingPinnedNumberRef.current = false;
          setShowPinnedEntries(false);
          if (pinnedTimeoutIdRef.current)
            clearTimeout(pinnedTimeoutIdRef.current);
          handleNewTimer();
          return;
        }

        // If we have pinned entries, show them and wait for action
        if (pinnedEntries.length > 0) {
          awaitingPinnedNumberRef.current = true;
          setShowPinnedEntries(true);

          // Clear any existing timeout
          if (pinnedTimeoutIdRef.current)
            clearTimeout(pinnedTimeoutIdRef.current);

          // Reset after 3 seconds if no action is taken
          pinnedTimeoutIdRef.current = setTimeout(() => {
            awaitingPinnedNumberRef.current = false;
            setShowPinnedEntries(false);
          }, 3000);
          return;
        }

        // No pinned entries, just create new timer
        handleNewTimer();
        return;
      }

      // Handle 'e' key - create new stopped entry
      if (e.key.toLowerCase() === "e" && !isInInput) {
        e.preventDefault();

        // If showing pinned entries, close them first
        if (awaitingPinnedNumberRef.current) {
          awaitingPinnedNumberRef.current = false;
          setShowPinnedEntries(false);
          if (pinnedTimeoutIdRef.current)
            clearTimeout(pinnedTimeoutIdRef.current);
        }

        handleNewStoppedEntry();
        return;
      }

      // If waiting for a number after 'n'
      if (awaitingPinnedNumberRef.current && !isInInput) {
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          awaitingPinnedNumberRef.current = false;
          setShowPinnedEntries(false);
          if (pinnedTimeoutIdRef.current)
            clearTimeout(pinnedTimeoutIdRef.current);

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
      // Block refresh if there's an active toast to prevent accidental data loss
      if (e.key.toLowerCase() === "r" && !isInInput && !e.ctrlKey && !e.metaKey) {
        const toastActive = hasActiveToast();
        if (toastActive) {
          // Don't refresh while toast is showing
          return;
        }
        e.preventDefault();
        handleRefreshData();
        return;
      }

      if (e.key === "Backspace" && (e.metaKey || e.ctrlKey) && !isInInput) {
        e.preventDefault();
        handleDeleteSelectedWithConfirmation();
        return;
      }

      if (e.key.toLowerCase() === "u" && !isInInput) {
        e.preventDefault();
        triggerUndo();
        return;
      }

      if (e.key.toLowerCase() === "f" && !isInInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleFullscreenToggle();
        return;
      }

      // Cmd+Period: Refocus selector to a row within current viewport (middle)
      if (e.key === "." && (e.metaKey || e.ctrlKey) && !isInInput) {
        e.preventDefault();

        const container = tableRef.current;
        if (!container || timeEntries.length === 0) return;

        // Find the row closest to the middle of the viewport
        const containerRect = container.getBoundingClientRect();
        const viewportMiddle = containerRect.top + containerRect.height / 2;
        const rows = container.querySelectorAll("[data-entry-id]");

        let targetRowIndex = 0;
        let closestDistance = Infinity;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as HTMLElement;
          const rowRect = row.getBoundingClientRect();

          // Check if row is visible in viewport
          const isVisible =
            rowRect.bottom > containerRect.top &&
            rowRect.top < containerRect.bottom;

          if (isVisible) {
            // Calculate distance from row center to viewport middle
            const rowCenter = rowRect.top + rowRect.height / 2;
            const distance = Math.abs(rowCenter - viewportMiddle);

            if (distance < closestDistance) {
              closestDistance = distance;
              targetRowIndex = i;
            }
          }
        }

        // Set selector to the row closest to middle, keeping current cell index if possible
        setSelectedCell({
          rowIndex: targetRowIndex,
          cellIndex: selectedCell?.cellIndex ?? 0,
        });
        return;
      }

      // Option+Number: Jump to specific column (before isInInput check)
      if (e.altKey && /^Digit[1-6]$/.test(e.code) && selectedCell && !isInInput) {
        e.preventDefault();
        const targetColumn = Number.parseInt(e.code.replace('Digit', ''));
        setSelectedCell({
          ...selectedCell,
          cellIndex: targetColumn,
        });
        return;
      }

      // Navigation shortcuts (only when not in input)
      if (isInInput) {
        return;
      }

      // Don't handle navigation keys if any dialog is open
      const anyDialogOpen =
        deleteDialogOpen ||
        splitDialogOpen ||
        combineDialogOpen ||
        deleteDialogOpenRef.current ||
        splitDialogOpenRef.current ||
        combineDialogOpenRef.current;

      if (anyDialogOpen) {
        return;
      }

      // Normalize key to lowercase for case-insensitive comparison
      const key = e.key.toLowerCase();

      switch (key) {
        case "escape":
          e.preventDefault();
          e.stopPropagation();

          // If showing pinned entries, hide them
          if (showPinnedEntries) {
            awaitingPinnedNumberRef.current = false;
            setShowPinnedEntries(false);
            if (pinnedTimeoutIdRef.current)
              clearTimeout(pinnedTimeoutIdRef.current);
            return;
          }

          // DO NOT REMOVE: Uncomment to clear selection on Escape
          // if (
          //   !isActionsMenuOpen &&
          //   !isProjectSelectorOpen &&
          //   !isTagSelectorOpen
          // ) {
          //   setSelectedCell(null);
          // }
          break;

        case "enter":
          e.preventDefault();
          if (selectedCell) {
            activateCell(selectedCell.rowIndex, selectedCell.cellIndex);
          } else if (keyboardNavigationData.currentEntriesLength > 0) {
            // If no cell selected, select first cell of first row
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          }
          break;

        case "tab":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (selectedCell) {
            if (e.shiftKey) {
              // Shift+Tab or Option+Shift+Tab: Move backward
              if (selectedCell.cellIndex > 1) {
                setSelectedCell({
                  ...selectedCell,
                  cellIndex: selectedCell.cellIndex - 1,
                });
              } else if (selectedCell.cellIndex === 1) {
                // At first editable cell
                if (e.altKey) {
                  // Option+Shift+Tab: wrap to last cell of same row
                  setSelectedCell({
                    ...selectedCell,
                    cellIndex: keyboardNavigationData.maxCellIndex,
                  });
                } else if (selectedCell.rowIndex > 0) {
                  // Shift+Tab: wrap to last cell (actions) of previous row
                  setSelectedCell({
                    rowIndex: selectedCell.rowIndex - 1,
                    cellIndex: keyboardNavigationData.maxCellIndex,
                  });
                } else {
                  // At first row, wrap to last cell of same row
                  setSelectedCell({
                    ...selectedCell,
                    cellIndex: keyboardNavigationData.maxCellIndex,
                  });
                }
              }
            } else {
              // Tab or Option+Tab: Move forward
              navigateToNextCell(e.altKey);
            }
          }
          break;

        case "arrowdown":
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

        case "arrowup":
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

        case "arrowleft":
          e.preventDefault();
          // cellIndex 0 is date column (not editable), so stop at cellIndex 1
          if (selectedCell && selectedCell.cellIndex > 1) {
            setSelectedCell({
              ...selectedCell,
              cellIndex: selectedCell.cellIndex - 1,
            });
          }
          break;

        case "arrowright":
          e.preventDefault();
          if (
            !selectedCell &&
            keyboardNavigationData.currentEntriesLength > 0
          ) {
            // Start at cellIndex 1 (skip date column at 0)
            setSelectedCell({ rowIndex: 0, cellIndex: 1 });
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

        case "home":
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            setSelectedCell({ rowIndex: 0, cellIndex: 0 });
          } else if (selectedCell) {
            setSelectedCell({ ...selectedCell, cellIndex: 0 });
          }
          break;

        case "end":
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

        case "x":
          e.preventDefault();
          if (selectedCell) {
            const entry = decryptedEntries[selectedCell.rowIndex];
            if (entry) {
              handleSplit(entry);
            }
          }
          break;

        case "c":
          e.preventDefault();
          if (selectedCell) {
            const entry = decryptedEntries[selectedCell.rowIndex];
            if (entry) {
              handleCombine(entry);
            }
          }
          break;

        case "s":
          e.preventDefault();
          if (selectedCell) {
            const entry = timeEntries[selectedCell.rowIndex];
            if (entry) {
              // Check if Alt/Option key is pressed
              if (e.altKey) {
                // Stop timer if it's running
                if (!entry.stop || entry.duration === -1) {
                  handleStopTimer(entry);
                }
              } else {
                // Start new entry (copy and start)
                handleCopyAndStartEntry(entry);
              }
            }
          }
          break;

        case "p":
          e.preventDefault();
          if (selectedCell) {
            const entry = timeEntries[selectedCell.rowIndex];
            if (entry) {
              const entryId = entry.id.toString();
              if (isPinned(entryId)) {
                handleUnpinEntry(entryId);
              } else {
                handlePinEntry(entry);
              }
            }
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (pinnedTimeoutIdRef.current) clearTimeout(pinnedTimeoutIdRef.current);
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
    handleNewTimer,
    handleNewStoppedEntry,
    handleRefreshData,
    handleDeleteSelected,
    handleDeleteSelectedWithConfirmation,
    handleStartTimerFromPinned,
    handleSplit,
    handleCombine,
    handleCopyAndStartEntry,
    handleStopTimer,
    handleFullscreenToggle,
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
        // Query for all matching rows and find the visible one
        const rowElements = document.querySelectorAll(
          `[data-entry-id="${entry.id}"]`
        );

        let rowElement: HTMLElement | null = null;
        for (const el of Array.from(rowElements)) {
          const htmlEl = el as HTMLElement;
          // Check if element is actually visible (not display: none)
          if (htmlEl.offsetParent !== null) {
            rowElement = htmlEl;
            break;
          }
        }

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
        }
      });
    }
  }, [selectedCell, timeEntries]);

  // Update selected cell to follow manual scroll
  React.useEffect(() => {
    if (!tableRef.current || timeEntries.length === 0) return;

    const container = tableRef.current;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      // Debounce the scroll handler
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setSelectedCell((current) => {
          if (!current) return current;

          const containerRect = container.getBoundingClientRect();

          // Check if current selected row is out of view
          const currentEntry = timeEntries[current.rowIndex];
          if (!currentEntry) return current;

          const rowElements = document.querySelectorAll(
            `[data-entry-id="${currentEntry.id}"]`
          );

          let currentRowElement: HTMLElement | null = null;
          for (const el of Array.from(rowElements)) {
            const htmlEl = el as HTMLElement;
            if (htmlEl.offsetParent !== null) {
              currentRowElement = htmlEl;
              break;
            }
          }

          if (!currentRowElement) return current;

          const rowRect = currentRowElement.getBoundingClientRect();
          const isAboveViewport = rowRect.bottom < containerRect.top;
          const isBelowViewport = rowRect.top > containerRect.bottom;

          // If current selection is still in view, don't change anything
          if (!isAboveViewport && !isBelowViewport) {
            return current;
          }

          // Current selection is out of view, find the nearest visible row
          let targetRow: number | null = null;

          for (let index = 0; index < timeEntries.length; index++) {
            const entry = timeEntries[index];
            const rowElements = document.querySelectorAll(
              `[data-entry-id="${entry.id}"]`
            );

            let rowElement: HTMLElement | null = null;
            for (const el of Array.from(rowElements)) {
              const htmlEl = el as HTMLElement;
              if (htmlEl.offsetParent !== null) {
                rowElement = htmlEl;
                break;
              }
            }

            if (rowElement) {
              const rect = rowElement.getBoundingClientRect();
              const isVisible = rect.bottom >= containerRect.top && rect.top <= containerRect.bottom;

              if (isVisible) {
                if (isAboveViewport) {
                  // Scrolling down: selector went above viewport, move to first visible row
                  targetRow = index;
                  break;
                } else if (isBelowViewport) {
                  // Scrolling up: selector went below viewport, keep updating to find last visible row
                  targetRow = index;
                }
              }
            }
          }

          if (targetRow !== null) {
            return {
              rowIndex: targetRow,
              cellIndex: current.cellIndex,
            };
          }

          return current;
        });
      }, 150); // 150ms debounce
    };

    container.addEventListener("scroll", handleScroll);

    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [timeEntries]);

  // Handle encryption lock/unlock
  const handleLockEncryption = React.useCallback(() => {
    encryption.lockE2EE();
    toast.success("Encryption locked");
  }, [encryption]);

  const handleUnlockEncryption = React.useCallback(() => {
    setPinError("");
    setPinDialogOpen(true);
  }, []);

  const handlePinSuccess = React.useCallback(
    (pin: string) => {
      const result = encryption.unlockE2EE(pin);
      if (result.success) {
        toast.success("Encryption unlocked");
        setPinDialogOpen(false);
        setPinError("");
      } else {
        setPinError(result.error || "Failed to unlock");
      }
    },
    [encryption]
  );

  // No need to show unlock dialog - it auto-unlocks from localStorage

  return (
    <TooltipProvider delayDuration={0}>
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
            pinnedEntries={decryptedPinnedEntries}
            onUnpin={handleUnpinEntry}
            onStartTimer={handleStartTimerFromPinned}
            onNewTimer={() => {
              setShowPinnedEntries(false);
              handleNewTimer();
            }}
            onNewEntry={() => {
              setShowPinnedEntries(false);
              handleNewStoppedEntry();
            }}
            showShortcuts={true}
          />
        )}
        <div className="mb-4">
          {/* Desktop layout - single row */}
          <div className="hidden md:flex items-center justify-between">
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
              <EncryptionStatus
                isE2EEEnabled={encryption.isE2EEEnabled}
                isUnlocked={encryption.isUnlocked}
                onLock={handleLockEncryption}
                onUnlock={handleUnlockEncryption}
              />
            </div>
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() =>
                      window.open("https://track.toggl.com/reports/", "_blank")
                    }
                    size="icon"
                    variant="outline"
                    className="rounded-full h-9 w-9 border-border/40 shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Analytics</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleFullscreenToggle}
                    size="icon"
                    variant="outline"
                    className="rounded-full h-9 w-9 border-border/40 shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
                    disabled={isTransitioning}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleNewEntryClick}
                    size="icon"
                    variant="outline"
                    className="rounded-full h-9 w-9 border-border/40 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New (N)</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Mobile layout - two rows */}
          <div className="md:hidden space-y-3">
            {/* First row - Date picker */}
            <div className="flex items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date-mobile"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal border-border/60 hover:border-border transition-all duration-200",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "MMM dd")} -{" "}
                          {format(date.to, "MMM dd, y")}
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
                      }
                    }}
                    numberOfMonths={1}
                    className="rounded-md border-0"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Second row - Buttons and status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SyncStatusBadge
                  status={syncStatus}
                  lastSyncTime={lastSyncTime}
                  onReauthenticate={handleReauthenticate}
                  onRetry={() => fetchData()}
                />
                <EncryptionStatus
                  isE2EEEnabled={encryption.isE2EEEnabled}
                  isUnlocked={encryption.isUnlocked}
                  onLock={handleLockEncryption}
                  onUnlock={handleUnlockEncryption}
                />
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://track.toggl.com/reports/",
                          "_blank"
                        )
                      }
                      size="icon"
                      variant="outline"
                      className="rounded-full h-9 w-9 border-border/40 shadow-sm"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View Analytics</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleFullscreenToggle}
                      size="icon"
                      variant="outline"
                      className="rounded-full h-9 w-9 border-border/40 shadow-sm"
                      disabled={isTransitioning}
                    >
                      {isFullscreen ? (
                        <Minimize2 className="w-4 h-4" />
                      ) : (
                        <Maximize2 className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleNewEntryClick}
                      size="icon"
                      variant="outline"
                      className="rounded-full h-9 w-9 border-border/40 shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New (N)</TooltipContent>
                </Tooltip>
              </div>
            </div>
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
              "bg-card transition-opacity duration-500 rounded-lg",
              isFullscreen
                ? "overflow-x-auto"
                : "rounded-lg border border-border/60 shadow-sm overflow-hidden",
              isTransitioning && "opacity-30"
            )}
          >
            <Table className="md:table-auto table-fixed w-full">
              <TableHeader>
                <TableRow className="hidden md:table-row hover:bg-muted/30 transition-colors duration-200 border-border/60">
                  <TableHead className="px-2 w-8"></TableHead>
                  <TableHead className="px-4 py-3 sm:w-28 w-24 font-medium text-muted-foreground">
                    Date
                  </TableHead>
                  {isFullscreen ? (
                    <>
                      <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                        Project
                      </TableHead>
                      <TableHead className="px-4 py-3 font-medium text-muted-foreground description-cell">
                        Description
                      </TableHead>
                      <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                        Tags
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="px-4 py-3 font-medium text-muted-foreground description-cell">
                        Description
                      </TableHead>
                      <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                        Project
                      </TableHead>
                      <TableHead className="px-4 py-3 sm:w-48 w-32 font-medium text-muted-foreground">
                        Tags
                      </TableHead>
                    </>
                  )}
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
                {decryptedEntries.map((entry, rowIndex) => {
                  // Calculate adjacent entries for snap functionality
                  // Entries are sorted newest-first (descending chronologically)
                  // rowIndex - 1 = newer entry (happened after current) = next chronologically
                  // rowIndex + 1 = older entry (happened before current) = previous chronologically
                  const prevEntry =
                    rowIndex < decryptedEntries.length - 1
                      ? decryptedEntries[rowIndex + 1]
                      : null;
                  const nextEntry =
                    rowIndex > 0 ? decryptedEntries[rowIndex - 1] : null;

                  return (
                    <MemoizedTableRow
                      key={entry.tempId || entry.id}
                      entry={entry}
                      rowIndex={rowIndex}
                      prevEntryEnd={prevEntry?.stop || null}
                      nextEntryStart={nextEntry?.start || null}
                      selectedCell={selectedCell}
                      onSelectCell={handleSelectCell}
                      onDescriptionSave={handleDescriptionSave}
                      onProjectChange={handleProjectChange}
                      onTagsChange={handleTagsChange}
                      onBulkEntryUpdate={handleBulkEntryUpdate}
                      onBulkEntryUpdateByRowIndex={
                        handleBulkEntryUpdateByRowIndex
                      }
                      onTimeChange={handleTimeChange}
                      onDurationChange={handleDurationChange}
                      onDurationChangeWithStartTimeAdjustment={
                        handleDurationChangeWithStartTimeAdjustment
                      }
                      onDelete={handleDeleteWithConfirmation}
                      onPin={handlePinEntry}
                      onUnpin={handleUnpinEntry}
                      onSplit={handleSplit}
                      onCombine={handleCombine}
                      onStartEntry={handleCopyAndStartEntry}
                      onStopTimer={handleStopTimer}
                      isPinned={isPinned(entry.id.toString())}
                      projects={projects}
                      availableTags={availableTags}
                      onProjectCreated={handleProjectCreated}
                      onTagCreated={handleTagCreated}
                      setIsEditingCell={setIsEditingCell}
                      setIsProjectSelectorOpen={setIsProjectSelectorOpen}
                      setIsTagSelectorOpen={setIsTagSelectorOpen}
                      setIsActionsMenuOpen={setIsActionsMenuOpen}
                      setIsTimeEditorOpen={setIsTimeEditorOpen}
                      navigateToNextCell={navigateToNextCell}
                      navigateToPrevCell={navigateToPrevCell}
                      navigateToNextRow={navigateToNextRow}
                      isNewlyLoaded={newlyLoadedEntries.has(entry.id)}
                      syncStatus={entrySyncStatus.get(entry.id)}
                      onRetrySync={handleRetrySync}
                      isFullscreen={isFullscreen}
                    />
                  );
                })}
                {hasMore && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-20 text-center">
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
          onOpenChange={(open) => {
            setDeleteDialogOpen(open);
            if (!open) {
              deleteDialogOpenRef.current = false;
              setEntryToDelete(null);
            }
          }}
          entry={entryToDelete}
          onConfirm={handleConfirmDelete}
        />

        <SplitEntryDialog
          open={splitDialogOpen}
          onOpenChange={(open) => {
            splitDialogOpenRef.current = open;
            setSplitDialogOpen(open);
          }}
          onConfirm={handleConfirmSplit}
          entryDescription={entryToSplit?.description}
        />
        <CombineEntryDialog
          open={combineDialogOpen}
          onOpenChange={(open) => {
            combineDialogOpenRef.current = open;
            setCombineDialogOpen(open);
          }}
          currentEntry={entryToCombine}
          previousEntry={
            entryToCombine
              ? decryptedEntries[
                  decryptedEntries.findIndex(
                    (e) => e.id === entryToCombine.id
                  ) + 1
                ]
              : null
          }
          onConfirm={handleConfirmCombine}
        />
        <PinDialog
          open={pinDialogOpen}
          onOpenChange={setPinDialogOpen}
          mode="verify"
          onSuccess={handlePinSuccess}
          error={pinError}
          lockoutTimeRemaining={
            encryption.isLockedOut()
              ? encryption.getLockoutTimeRemaining()
              : undefined
          }
        />
      </div>
    </TooltipProvider>
  );
}
