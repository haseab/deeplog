import type { useEncryptionContext } from "@/contexts/encryption-context";
import type { DateRange } from "react-day-picker";
import type { Project, SelectedCell, Tag, TimeEntry } from "@/types";

// Memoized component prop types for time-tracker-table.tsx
// These interfaces define the props for memoized cell and row components

export interface MemoizedProjectCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  isFullscreen: boolean;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onProjectChange: (entryId: number) => (newProject: string) => void;
  projects: Project[];
  setIsProjectSelectorOpen: (open: boolean) => void;
  navigateToNextCell: () => void;
  navigateToPrevCell: () => void;
  navigateToNextRow: () => void;
  onProjectCreated: (project: Project) => void;
}

export interface MemoizedTagCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  isFullscreen: boolean;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onTagsChange: (entryId: number) => (newTags: string[]) => void;
  availableTags: Tag[];
  setIsTagSelectorOpen: (open: boolean) => void;
  navigateToNextCell: () => void;
  navigateToPrevCell: () => void;
  onTagCreated: (tag: Tag) => void;
}

export interface MemoizedDescriptionCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  isFullscreen: boolean;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onDescriptionSave: (entryId: number) => (newDescription: string) => void;
  setIsEditingCell: (editing: boolean) => void;
  navigateToNextCell: () => void;
  projects: Project[];
  availableTags: Tag[];
  onBulkEntryUpdateByRowIndex: (
    capturedId: number
  ) => (updates: {
    description?: string;
    projectName?: string;
    tags?: string[];
  }) => void;
}

export interface MemoizedCheckboxCellProps {
  rowIndex: number;
  selectedCell: SelectedCell;
  selectedRows: Set<number>;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onCheckboxToggle: (rowIndex: number, shiftKey: boolean) => void;
}

export interface MemoizedDateCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
}

export interface MemoizedTimeCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onTimeChange: (
    entryId: number
  ) => (startTime: string, endTime: string | null) => void;
  setIsTimeEditorOpen: (open: boolean) => void;
  navigateToNextCell: () => void;
  navigateToNextRow: () => void;
  navigateToPrevCell: () => void;
  prevEntryEnd?: string | null;
  nextEntryStart?: string | null;
}

export interface MemoizedDurationCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
  onDurationChange: (entryId: number) => (newDuration: number) => void;
  onDurationChangeWithStartTimeAdjustment: (
    entryId: number
  ) => (newDuration: number) => void;
  setIsEditingCell: (editing: boolean) => void;
  navigateToNextRow: () => void;
}

export interface MemoizedActionsCellProps {
  entry: TimeEntry;
  rowIndex: number;
  selectedCell: SelectedCell;
  isPinned: boolean;
  onPin: (entry: TimeEntry) => void;
  onUnpin: (id: string) => void;
  onSplit: (entry: TimeEntry) => void;
  onCombine: (entry: TimeEntry) => void;
  onStartEntry: (entry: TimeEntry) => void;
  onStopTimer: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
  setIsActionsMenuOpen: (open: boolean) => void;
  navigateToNextCell: () => void;
  onSelectCell: (rowIndex: number, cellIndex: number) => void;
}

export interface MemoizedDatePickerRowProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  syncStatus?:
    | "synced"
    | "syncing"
    | "error"
    | "session_expired"
    | "offline"
    | "sync_paused";
  hasLoadedMoreEntries: boolean;
  lastSyncTime: Date | undefined;
  handleReauthenticate: () => void;
  fetchData: () => void;
  encryption: ReturnType<typeof useEncryptionContext>;
  handleLockEncryption: () => void;
  handleUnlockEncryption: () => void;
  isFullscreen: boolean;
  isTransitioning: boolean;
  handleFullscreenToggle: () => void;
  handleNewEntryClick: () => void;
}

export interface MemoizedMobileDatePickerRowProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
}

export interface MemoizedMobileButtonsRowProps {
  syncStatus?:
    | "synced"
    | "syncing"
    | "error"
    | "session_expired"
    | "offline"
    | "sync_paused";
  hasLoadedMoreEntries: boolean;
  lastSyncTime: Date | undefined;
  handleReauthenticate: () => void;
  fetchData: () => void;
  encryption: ReturnType<typeof useEncryptionContext>;
  handleLockEncryption: () => void;
  handleUnlockEncryption: () => void;
  isFullscreen: boolean;
  isTransitioning: boolean;
  handleFullscreenToggle: () => void;
  handleNewEntryClick: () => void;
}

export interface MemoizedTableHeaderRowProps {
  isFullscreen: boolean;
  selectedRows: Set<number>;
  decryptedEntriesLength: number;
  setSelectedRows: (
    rows: Set<number> | ((prev: Set<number>) => Set<number>)
  ) => void;
}
