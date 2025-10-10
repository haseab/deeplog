# Combine Feature Implementation Plan

## Overview
Implement a "Combine" feature that merges a time entry with the one below it (next chronologically). This is the inverse operation of Split.

## Behavior Specification

### For Stopped Entries:
- **Target Entry** (the one being combined): Gets deleted
- **Previous Entry** (the one above it in the list): Inherits the target's stop time
- Result: One continuous time entry spanning from previous entry's start to target entry's stop

### For Running Timers:
- **Target Entry** (running timer): Gets deleted
- **Previous Entry**: Becomes the new running timer (stop time removed, duration set to -1)
- Result: Previous entry continues running from its original start time

### Validation Rules:
- Cannot combine if entry is temp ID (hasn't synced yet)
- Cannot combine the last entry (nothing below it to combine with)
- Cannot combine if entries are not consecutive (different times, gap between them)
- Show confirmation dialog explaining what will happen before executing

## Implementation Tasks

### 1. **Create Combine Confirmation Dialog Component** ⏳
   - File: `src/components/combine-entry-dialog.tsx`
   - Similar structure to `split-entry-dialog.tsx` and `delete-confirmation-dialog.tsx`
   - Show both entries being combined with their descriptions, projects, times
   - Display what the result will be (new time range)
   - Clear explanation: "This will delete [Entry B] and extend [Entry A] to [Entry B]'s end time"
   - For running timers: "This will delete [Running Timer] and make [Entry A] the active timer"
   - Keyboard navigation: Arrow keys to switch focus, Enter to confirm, Escape to cancel

### 2. **Create Backend API Route** ⏳
   - File: `src/app/api/time-entries/combine/route.ts`
   - Similar structure to `split/route.ts`
   - Accept: `{ currentEntryId: number, nextEntryId: number }`
   - Steps:
     1. Fetch both entries from Toggl
     2. Validate they're combinable (consecutive, no gaps)
     3. Delete the next entry (currentEntryId)
     4. Update previous entry with:
        - For stopped: new stop time = next entry's stop time
        - For running: remove stop time, set duration to -1
   - Return: `{ updatedEntry, deletedEntry, message }`
   - Error handling for 401, 403, 404 (same as split)

### 3. **Update Time Tracker Table Component** ⏳
   - File: `src/components/time-tracker-table.tsx`

   **Add State:**
   - `entryToCombine: TimeEntry | null`
   - `combineDialogOpen: boolean`

   **Add handleCombine callback:**
   ```typescript
   const handleCombine = React.useCallback((entry: TimeEntry) => {
     // Check temp ID
     if (syncQueue.isTempId(entry.id)) {
       toast.error("Cannot combine an entry that hasn't been synced yet");
       return;
     }

     // Find next entry (below in list)
     const currentIndex = timeEntries.findIndex(e => e.id === entry.id);
     if (currentIndex === timeEntries.length - 1) {
       toast.error("Cannot combine the last entry");
       return;
     }

     const nextEntry = timeEntries[currentIndex + 1];
     // Validate they're consecutive (entry.stop === nextEntry.start)
     // If not consecutive, show error

     setEntryToCombine(entry);
     setCombineDialogOpen(true);
   }, [timeEntries]);
   ```

   **Add handleConfirmCombine callback:**
   - Optimistically update UI (remove next entry, update previous entry's stop time)
   - Make API call to `/api/time-entries/combine`
   - Handle success/failure with toast notifications
   - On error, revert to original state
   - Similar pattern to `handleConfirmSplit`

   **Add keyboard shortcut:**
   - In keyboard event handler, add case "c":
   ```typescript
   case "c":
     e.preventDefault();
     if (selectedCell) {
       const entry = timeEntries[selectedCell.rowIndex];
       if (entry) {
         handleCombine(entry);
       }
     }
     break;
   ```
   - Add `handleCombine` to useEffect dependencies

### 4. **Update Actions Menu Component** ⏳
   - File: `src/components/actions-menu.tsx`

   **Add prop:**
   - `onCombine?: () => void`

   **Add menu option:**
   ```typescript
   { label: "🔗 Combine", action: onCombine || (() => {}) }
   ```
   - Position it after Split in the menu array

### 5. **Update MemoizedTableRow Props** ⏳
   - File: `src/components/time-tracker-table.tsx`

   **Add to component props:**
   - `onCombine: (entry: TimeEntry) => void;`

   **Pass to ActionsMenu:**
   ```typescript
   onCombine={() => onCombine(entry)}
   ```

   **Update propsAreEqual memo check:**
   - Add `onCombineEqual` comparison

### 6. **Render Combine Dialog** ⏳
   - File: `src/components/time-tracker-table.tsx`

   Add below existing Split dialog:
   ```typescript
   <CombineEntryDialog
     open={combineDialogOpen}
     onOpenChange={setCombineDialogOpen}
     currentEntry={entryToCombine}
     nextEntry={/* find next entry */}
     onConfirm={handleConfirmCombine}
   />
   ```

## Testing Checklist
- [ ] Combine two consecutive stopped entries
- [ ] Combine to make a running timer (delete running, extend previous)
- [ ] Try to combine last entry (should error)
- [ ] Try to combine temp ID entry (should error)
- [ ] Try to combine non-consecutive entries (should error)
- [ ] Test keyboard shortcut 'C'
- [ ] Test from actions menu (three dots)
- [ ] Verify optimistic update and revert on error
- [ ] Verify confirmation dialog displays correct information
- [ ] Verify keyboard navigation in dialog (Enter/Escape/Arrows)

## Files to Create/Modify

**Create:**
1. `src/components/combine-entry-dialog.tsx` (~150 lines)
2. `src/app/api/time-entries/combine/route.ts` (~200 lines)

**Modify:**
1. `src/components/time-tracker-table.tsx` (~150 lines added)
2. `src/components/actions-menu.tsx` (~5 lines)

## Estimated Effort
- Dialog component: 30 min
- API route: 45 min
- Table integration: 45 min
- Actions menu update: 10 min
- Testing & refinement: 30 min
**Total: ~2.5 hours**
