"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  addCalendarDays,
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatTimeInTimeZone,
  getZonedParts,
  wallTimeToUtc,
  wallTimeToUtcCandidates,
  type WallTimeDisambiguation,
} from "@/lib/timezone";
import { parse } from "date-fns";
import { Clock } from "lucide-react";
import * as React from "react";

interface TimeEditorProps {
  startTime: string;
  endTime: string | null;
  onSave?: (startTime: string, endTime: string | null) => void;
  onSaveWithForcePush?: (
    startTime: string,
    endTime: string | null,
    direction: "next" | "previous" | "both"
  ) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onNavigateNext?: () => void;
  onNavigatePrev?: () => void;
  onNavigateVertical?: (direction: "up" | "down" | "left" | "right") => void;
  prevEntryEnd?: string | null; // End time of the previous entry (chronologically before)
  nextEntryStart?: string | null; // Start time of the next entry (chronologically after)
  timeZone: string;
  "data-testid"?: string;
}

export function TimeEditor({
  startTime,
  endTime,
  onSave,
  onSaveWithForcePush,
  onEditingChange,
  onNavigateNext,
  onNavigatePrev,
  onNavigateVertical,
  prevEntryEnd,
  nextEntryStart,
  timeZone,
  "data-testid": dataTestId,
}: TimeEditorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [startDateValue, setStartDateValue] = React.useState("");
  const [startTimeHours, setStartTimeHours] = React.useState("");
  const [startTimeMinutes, setStartTimeMinutes] = React.useState("");
  const [startTimeSeconds, setStartTimeSeconds] = React.useState("");
  const [endDateValue, setEndDateValue] = React.useState("");
  const [endTimeHours, setEndTimeHours] = React.useState("");
  const [endTimeMinutes, setEndTimeMinutes] = React.useState("");
  const [endTimeSeconds, setEndTimeSeconds] = React.useState("");
  const [error, setError] = React.useState("");
  const [startDisambiguation, setStartDisambiguation] = React.useState<WallTimeDisambiguation | null>(null);
  const [endDisambiguation, setEndDisambiguation] = React.useState<WallTimeDisambiguation | null>(null);
  const [startIsAmbiguous, setStartIsAmbiguous] = React.useState(false);
  const [endIsAmbiguous, setEndIsAmbiguous] = React.useState(false);

  const startDateInputRef = React.useRef<HTMLInputElement>(null);
  const startTimeHoursRef = React.useRef<HTMLInputElement>(null);
  const startTimeMinutesRef = React.useRef<HTMLInputElement>(null);
  const startTimeSecondsRef = React.useRef<HTMLInputElement>(null);
  const endDateInputRef = React.useRef<HTMLInputElement>(null);
  const endTimeHoursRef = React.useRef<HTMLInputElement>(null);
  const endTimeMinutesRef = React.useRef<HTMLInputElement>(null);
  const endTimeSecondsRef = React.useRef<HTMLInputElement>(null);

  // Check if Limitless API key exists
  const [hasLimitlessKey, setHasLimitlessKey] = React.useState(false);

  React.useEffect(() => {
    const apiKey = localStorage.getItem("limitless_api_key");
    const hasKey = !!apiKey;
    setHasLimitlessKey(hasKey);
  }, []);

  // Notify parent of editing state changes
  React.useEffect(() => {
    onEditingChange?.(isOpen);
  }, [isOpen, onEditingChange]);

  // Initialize values when opening
  React.useEffect(() => {
    if (isOpen) {
      const start = getZonedParts(startTime, timeZone);
      setStartDateValue(formatDateInTimeZone(startTime, timeZone));
      setStartTimeHours(start.hour.toString().padStart(2, "0"));
      setStartTimeMinutes(start.minute.toString().padStart(2, "0"));
      setStartTimeSeconds(start.second.toString().padStart(2, "0"));

      if (endTime) {
        const end = getZonedParts(endTime, timeZone);
        setEndDateValue(formatDateInTimeZone(endTime, timeZone));
        setEndTimeHours(end.hour.toString().padStart(2, "0"));
        setEndTimeMinutes(end.minute.toString().padStart(2, "0"));
        setEndTimeSeconds(end.second.toString().padStart(2, "0"));
      } else {
        setEndDateValue(formatDateInTimeZone(startTime, timeZone));
        setEndTimeHours("");
        setEndTimeMinutes("");
        setEndTimeSeconds("");
      }
      setError("");
      setStartDisambiguation(null);
      setEndDisambiguation(null);
      setStartIsAmbiguous(false);
      setEndIsAmbiguous(false);

      // Focus the start time hours input first
      setTimeout(() => {
        startTimeHoursRef.current?.focus();
        startTimeHoursRef.current?.select();
      }, 100);
    }
  }, [isOpen, startTime, endTime, timeZone]);

  const parseDateInput = (dateStr: string): Date | null => {
    if (!dateStr.trim()) return null;

    try {
      const parsed = parse(dateStr, "yyyy-MM-dd", new Date());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      // Ignore
    }

    return null;
  };

  const adjustStartDate = (days: number) => {
    const currentDate = parseDateInput(startDateValue);
    if (currentDate) {
      setStartDateValue(addCalendarDays(startDateValue, days));
      setError("");
    }
  };

  const adjustEndDate = (days: number) => {
    const currentDate = parseDateInput(endDateValue);
    if (currentDate) {
      setEndDateValue(addCalendarDays(endDateValue, days));
      setError("");
    }
  };

  const buildDateTime = (
    dateStr: string,
    hours: string,
    minutes: string,
    seconds: string,
    kind: "start" | "end",
    originalTime: string | null,
    disambiguation: WallTimeDisambiguation | null
  ): Date | null => {
    const date = parseDateInput(dateStr);
    if (!date) return null;

    const h = parseInt(hours);
    const m = parseInt(minutes);
    const s = parseInt(seconds);

    if (
      isNaN(h) ||
      isNaN(m) ||
      isNaN(s) ||
      h < 0 ||
      h > 23 ||
      m < 0 ||
      m > 59 ||
      s < 0 ||
      s > 59
    ) {
      return null;
    }

    const wallTime = `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    const candidates = wallTimeToUtcCandidates(dateStr, wallTime, timeZone);
    const setAmbiguous = kind === "start" ? setStartIsAmbiguous : setEndIsAmbiguous;

    if (candidates.length === 0) {
      setAmbiguous(false);
      setError(`That ${kind} time does not exist in ${timeZone} because of a daylight-saving transition.`);
      return null;
    }
    if (candidates.length === 1) {
      setAmbiguous(false);
      return candidates[0];
    }

    setAmbiguous(true);
    const originalMs = originalTime ? new Date(originalTime).getTime() : NaN;
    const originalCandidate = candidates.find((candidate) => candidate.getTime() === originalMs);
    if (originalCandidate && !disambiguation) return originalCandidate;
    if (disambiguation === "earlier") return candidates[0];
    if (disambiguation === "later") return candidates[candidates.length - 1];

    setError(`That ${kind} time occurs twice in ${timeZone}. Choose the first or second occurrence.`);
    return null;
  };

  const handleSave = (): boolean => {
    const finalStartDateTime = buildDateTime(
      startDateValue,
      startTimeHours,
      startTimeMinutes,
      startTimeSeconds,
      "start",
      startTime,
      startDisambiguation
    );

    if (!finalStartDateTime) {
      setError("Invalid start time");
      return false;
    }

    let finalEndDateTime: Date | null = null;
    if (endTimeHours.trim() || endTimeMinutes.trim() || endTimeSeconds.trim()) {
      finalEndDateTime = buildDateTime(
        endDateValue,
        endTimeHours,
        endTimeMinutes,
        endTimeSeconds,
        "end",
        endTime,
        endDisambiguation
      );

      if (!finalEndDateTime) {
        setError("Invalid end time");
        return false;
      }

      if (finalEndDateTime < finalStartDateTime) {
        setError("End time must be at or after start time");
        return false;
      }
    }

    // Check if anything actually changed
    const originalStart = new Date(startTime);
    const originalEnd = endTime ? new Date(endTime) : null;

    const startChanged =
      finalStartDateTime.getTime() !== originalStart.getTime();
    const endChanged = finalEndDateTime
      ? !originalEnd || finalEndDateTime.getTime() !== originalEnd.getTime()
      : originalEnd !== null;

    if (startChanged || endChanged) {
      onSave?.(
        finalStartDateTime.toISOString(),
        finalEndDateTime ? finalEndDateTime.toISOString() : null
      );
    }

    setIsOpen(false);
    setError("");
    return true;
  };

  const handleSaveWithForcePush = (
    direction: "next" | "previous" | "both"
  ) => {
    const finalStartDateTime = buildDateTime(
      startDateValue,
      startTimeHours,
      startTimeMinutes,
      startTimeSeconds,
      "start",
      startTime,
      startDisambiguation
    );

    if (!finalStartDateTime) {
      setError("Invalid start time");
      return;
    }

    let finalEndDateTime: Date | null = null;
    if (endTimeHours.trim() || endTimeMinutes.trim() || endTimeSeconds.trim()) {
      finalEndDateTime = buildDateTime(
        endDateValue,
        endTimeHours,
        endTimeMinutes,
        endTimeSeconds,
        "end",
        endTime,
        endDisambiguation
      );

      if (!finalEndDateTime) {
        setError("Invalid end time");
        return;
      }

      if (finalEndDateTime < finalStartDateTime) {
        setError("End time must be at or after start time");
        return;
      }
    }

    // Force alignment is meaningful even when this entry's own values did
    // not change: the chosen neighboring boundary may still need to snap.
    onSaveWithForcePush?.(
      finalStartDateTime.toISOString(),
      finalEndDateTime ? finalEndDateTime.toISOString() : null,
      direction
    );

    setIsOpen(false);
    setError("");
  };

  const handleCancel = () => {
    setIsOpen(false);
    setError("");
  };

  const adjustTime = (
    field:
      | "startHours"
      | "startMinutes"
      | "startSeconds"
      | "endHours"
      | "endMinutes"
      | "endSeconds",
    delta: number
  ) => {
    if (field === "startHours") {
      const current = parseInt(startTimeHours) || 0;
      const newValue = Math.max(0, Math.min(23, current + delta));
      setStartTimeHours(newValue.toString().padStart(2, "0"));
    } else if (field === "startMinutes") {
      const current = parseInt(startTimeMinutes) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setStartTimeMinutes(newValue.toString().padStart(2, "0"));
    } else if (field === "startSeconds") {
      const current = parseInt(startTimeSeconds) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setStartTimeSeconds(newValue.toString().padStart(2, "0"));
    } else if (field === "endHours") {
      const current = parseInt(endTimeHours) || 0;
      const newValue = Math.max(0, Math.min(23, current + delta));
      setEndTimeHours(newValue.toString().padStart(2, "0"));
    } else if (field === "endMinutes") {
      const current = parseInt(endTimeMinutes) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setEndTimeMinutes(newValue.toString().padStart(2, "0"));
    } else if (field === "endSeconds") {
      const current = parseInt(endTimeSeconds) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setEndTimeSeconds(newValue.toString().padStart(2, "0"));
    }
  };

  const snapStartToPrevEnd = () => {
    if (!prevEntryEnd) return;

    const prevEnd = getZonedParts(prevEntryEnd, timeZone);
    setStartDateValue(formatDateInTimeZone(prevEntryEnd, timeZone));
    setStartTimeHours(prevEnd.hour.toString().padStart(2, "0"));
    setStartTimeMinutes(prevEnd.minute.toString().padStart(2, "0"));
    setStartTimeSeconds(prevEnd.second.toString().padStart(2, "0"));
    setError("");
  };

  const snapEndToNextStart = () => {
    if (!nextEntryStart) return;

    const nextStart = getZonedParts(nextEntryStart, timeZone);
    setEndDateValue(formatDateInTimeZone(nextEntryStart, timeZone));
    setEndTimeHours(nextStart.hour.toString().padStart(2, "0"));
    setEndTimeMinutes(nextStart.minute.toString().padStart(2, "0"));
    setEndTimeSeconds(nextStart.second.toString().padStart(2, "0"));
    setError("");
  };

  const shiftBothTimes = (minutesToShift: number) => {
    const startHours = parseInt(startTimeHours) || 0;
    const startMinutes = parseInt(startTimeMinutes) || 0;
    const startSeconds = parseInt(startTimeSeconds) || 0;

    const currentStart = wallTimeToUtc(
      startDateValue,
      `${startHours}:${startMinutes.toString().padStart(2, "0")}:${startSeconds.toString().padStart(2, "0")}`,
      timeZone,
      startDisambiguation || "earlier"
    );
    if (!currentStart) {
      setError(`The current start time is invalid in ${timeZone}.`);
      return;
    }

    // Shift start time
    const newStart = new Date(currentStart.getTime() + minutesToShift * 60 * 1000);
    const newStartParts = getZonedParts(newStart, timeZone);
    setStartDateValue(formatDateInTimeZone(newStart, timeZone));
    setStartTimeHours(newStartParts.hour.toString().padStart(2, "0"));
    setStartTimeMinutes(newStartParts.minute.toString().padStart(2, "0"));
    setStartTimeSeconds(newStartParts.second.toString().padStart(2, "0"));

    // If there's an end time, shift it too
    if (endDateValue && endTimeHours) {
      const endHours = parseInt(endTimeHours) || 0;
      const endMinutes = parseInt(endTimeMinutes) || 0;
      const endSeconds = parseInt(endTimeSeconds) || 0;

      const currentEnd = wallTimeToUtc(
        endDateValue,
        `${endHours}:${endMinutes.toString().padStart(2, "0")}:${endSeconds.toString().padStart(2, "0")}`,
        timeZone,
        endDisambiguation || "earlier"
      );
      if (!currentEnd) {
        setError(`The current end time is invalid in ${timeZone}.`);
        return;
      }

      const newEnd = new Date(currentEnd.getTime() + minutesToShift * 60 * 1000);
      const newEndParts = getZonedParts(newEnd, timeZone);
      setEndDateValue(formatDateInTimeZone(newEnd, timeZone));
      setEndTimeHours(newEndParts.hour.toString().padStart(2, "0"));
      setEndTimeMinutes(newEndParts.minute.toString().padStart(2, "0"));
      setEndTimeSeconds(newEndParts.second.toString().padStart(2, "0"));
    }

    setError("");
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field:
      | "startHours"
      | "startMinutes"
      | "startSeconds"
      | "endHours"
      | "endMinutes"
      | "endSeconds"
      | "startDate"
      | "endDate"
  ) => {
    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (handleSave()) {
        onNavigateVertical?.(
          e.key === "ArrowDown"
            ? "down"
            : e.key === "ArrowUp"
              ? "up"
              : e.key === "ArrowRight"
                ? "right"
                : "left"
        );
      }
      return;
    }

    // Shift both times: Option+Left/Right
    if (e.altKey && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        shiftBothTimes(-1); // Shift back 1 minute
        return;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        shiftBothTimes(1); // Shift forward 1 minute
        return;
      }
    }

    // Snap shortcuts: Cmd+Shift+Left/Right
    if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
      if (e.key === "ArrowLeft" && prevEntryEnd) {
        e.preventDefault();
        snapStartToPrevEnd();
        return;
      } else if (e.key === "ArrowRight" && nextEntryStart) {
        e.preventDefault();
        snapEndToNextStart();
        return;
      }
    }

    // Ignore standalone modifier keys
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Alt" ||
      e.key === "Meta"
    ) {
      return;
    }

    // Arrow keys for time fields (hours, minutes, and seconds)
    if (
      field === "startHours" ||
      field === "startMinutes" ||
      field === "startSeconds" ||
      field === "endHours" ||
      field === "endMinutes" ||
      field === "endSeconds"
    ) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        adjustTime(field, 1);
        return;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        adjustTime(field, -1);
        return;
      }
    }

    // Arrow keys for date navigation
    if (field === "startDate" || field === "endDate") {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (field === "startDate") adjustStartDate(1);
        else adjustEndDate(1);
        return;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (field === "startDate") adjustStartDate(-1);
        else adjustEndDate(-1);
        return;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (field === "startDate") adjustStartDate(-1);
        else adjustEndDate(-1);
        return;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (field === "startDate") adjustStartDate(1);
        else adjustEndDate(1);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();

      // Cmd+Enter aligns both adjacent boundaries. Adding Option keeps the
      // explicit one-sided shortcut for aligning only the previous boundary.
      if (e.metaKey || e.ctrlKey) {
        handleSaveWithForcePush(e.altKey ? "previous" : "both");
      } else {
        handleSave();
      }
    } else if (e.key === "Tab") {
      if (e.shiftKey) {
        // Shift+Tab (backwards): save → end date → start date → end seconds → end minutes → end hours → start seconds → start minutes → start hours
        if (field === "startMinutes") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            startTimeHoursRef.current?.focus();
            startTimeHoursRef.current?.select();
          }, 0);
        } else if (field === "startSeconds") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            startTimeMinutesRef.current?.focus();
            startTimeMinutesRef.current?.select();
          }, 0);
        } else if (field === "endHours") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            startTimeSecondsRef.current?.focus();
            startTimeSecondsRef.current?.select();
          }, 0);
        } else if (field === "endMinutes") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            endTimeHoursRef.current?.focus();
            endTimeHoursRef.current?.select();
          }, 0);
        } else if (field === "endSeconds") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            endTimeMinutesRef.current?.focus();
            endTimeMinutesRef.current?.select();
          }, 0);
        } else if (field === "startDate") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            endTimeSecondsRef.current?.focus();
            endTimeSecondsRef.current?.select();
          }, 0);
        } else if (field === "endDate") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            startDateInputRef.current?.focus();
            startDateInputRef.current?.select();
          }, 0);
        } else if (field === "startHours") {
          // Shift+Tab from first field: close and navigate to previous cell
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(false);
          onNavigatePrev?.();
        }
      } else {
        // Tab (forward): start hours → start minutes → start seconds → end hours → end minutes → end seconds → start date → end date → save
        if (field === "startHours") {
          e.preventDefault();
          startTimeMinutesRef.current?.focus();
          startTimeMinutesRef.current?.select();
        } else if (field === "startMinutes") {
          e.preventDefault();
          startTimeSecondsRef.current?.focus();
          startTimeSecondsRef.current?.select();
        } else if (field === "startSeconds") {
          e.preventDefault();
          endTimeHoursRef.current?.focus();
          endTimeHoursRef.current?.select();
        } else if (field === "endHours") {
          e.preventDefault();
          endTimeMinutesRef.current?.focus();
          endTimeMinutesRef.current?.select();
        } else if (field === "endMinutes") {
          e.preventDefault();
          endTimeSecondsRef.current?.focus();
          endTimeSecondsRef.current?.select();
        } else if (field === "endSeconds") {
          e.preventDefault();
          startDateInputRef.current?.focus();
          startDateInputRef.current?.select();
        } else if (field === "startDate") {
          e.preventDefault();
          endDateInputRef.current?.focus();
          endDateInputRef.current?.select();
        }
        // For endDate, let Tab continue to Save button naturally (don't preventDefault)
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  // Format display text - always show just time, no dates
  const displayText = React.useMemo(() => {
    const isRunning = !endTime || endTime === "";
    if (isRunning) {
      const start = getZonedParts(startTime, timeZone);
      return `${start.hour.toString().padStart(2, "0")}:${start.minute.toString().padStart(2, "0")} - Now`;
    }
    const start = getZonedParts(startTime, timeZone);
    const end = getZonedParts(endTime!, timeZone);
    return `${start.hour.toString().padStart(2, "0")}:${start.minute.toString().padStart(2, "0")} - ${end.hour.toString().padStart(2, "0")}:${end.minute.toString().padStart(2, "0")}`;
  }, [startTime, endTime, timeZone]);

  // Generate Limitless pendant URL with time range
  const pendantUrl = React.useMemo(() => {
    if (!hasLimitlessKey) return null;

    const endDateObj = endTime ? new Date(endTime) : new Date();

    // Check if start and end are on the same day
    const sameDay = formatDateInTimeZone(startTime, timeZone) === formatDateInTimeZone(endDateObj, timeZone);

    let query: string;
    if (sameDay) {
      // Format: "2025-11-04 from 3:48am to 3:49am"
      // Date first to prevent parsing "2025" as "20:25"
      const dateStr = formatDateInTimeZone(startTime, timeZone);
      const startTimeStr = formatTimeInTimeZone(startTime, timeZone, { compact: true });
      const endTimeStr = formatTimeInTimeZone(endDateObj, timeZone, { compact: true });
      query = `${dateStr} from ${startTimeStr} to ${endTimeStr}`;
    } else {
      // Format: "2025-11-02 11:25am to 2025-11-03 1:35pm"
      // Both dates included, no "from" needed
      const startFormatted = formatDateTimeInTimeZone(startTime, timeZone);
      const endFormatted = formatDateTimeInTimeZone(endDateObj, timeZone);
      query = `${startFormatted} to ${endFormatted}`;
    }

    return `/pendant?q=${encodeURIComponent(query)}`;
  }, [hasLimitlessKey, startTime, endTime, timeZone]);

  const handleClockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (hasLimitlessKey && pendantUrl) {
      window.open(pendantUrl, '_blank');
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          data-testid={dataTestId}
          className={cn(
            "w-full justify-start border-none shadow-none hover:bg-accent/40 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-2 rounded-md transition-all duration-200 group font-mono text-sm font-normal",
            "hover:scale-[1.01] active:scale-[0.99] hover:font-medium"
          )}
        >
          <div
            className={cn(
              "mr-2 shrink-0 hidden md:flex items-center justify-center",
              hasLimitlessKey && "cursor-pointer p-1 -m-1 rounded hover:bg-blue-500/10"
            )}
            onClick={handleClockClick}
            title={hasLimitlessKey ? "Click to view in Limitless" : undefined}
          >
            <Clock
              className={cn(
                "h-3 w-3 opacity-50 group-hover:opacity-70 transition-all",
                hasLimitlessKey && "hover:!text-blue-500 hover:!opacity-100 hover:scale-125"
              )}
            />
          </div>
          <span className="truncate transition-all duration-200 group-hover:translate-x-0.5">
            {displayText}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-4 border-border/60"
        align="start"
        side="bottom"
      >
        <div className="space-y-4">
          {/* Start and End Time on same row */}
          <div className="space-y-2">
            <div className="flex md:flex-row flex-col md:gap-8 gap-2 items-start">
              {/* Start Time */}
              <div className="md:flex-1 w-full space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Start</Label>
                  {prevEntryEnd && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[10px] px-1.5 py-0"
                      onClick={snapStartToPrevEnd}
                      tabIndex={-1}
                    >
                      ← Snap
                    </Button>
                  )}
                </div>
                <div className="flex gap-1 items-center">
                  <Input
                    ref={startTimeHoursRef}
                    placeholder="09"
                    value={startTimeHours}
                    onChange={(e) => {
                      setStartTimeHours(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "startHours")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                  <span className="text-muted-foreground text-sm">:</span>
                  <Input
                    ref={startTimeMinutesRef}
                    placeholder="00"
                    value={startTimeMinutes}
                    onChange={(e) => {
                      setStartTimeMinutes(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "startMinutes")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                  <span className="text-muted-foreground text-sm">:</span>
                  <Input
                    ref={startTimeSecondsRef}
                    placeholder="00"
                    value={startTimeSeconds}
                    onChange={(e) => {
                      setStartTimeSeconds(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "startSeconds")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                </div>
              </div>

              {/* End Time */}
              <div className="md:flex-1 w-full space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    End{" "}
                    {(!endTime || endTime === "") && (
                      <span className="text-[10px]">(running)</span>
                    )}
                  </Label>
                  {nextEntryStart && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[10px] px-1.5 py-0"
                      onClick={snapEndToNextStart}
                      tabIndex={-1}
                    >
                      Snap →
                    </Button>
                  )}
                </div>
                <div className="flex gap-1 items-center">
                  <Input
                    ref={endTimeHoursRef}
                    placeholder="17"
                    value={endTimeHours}
                    onChange={(e) => {
                      setEndTimeHours(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "endHours")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                  <span className="text-muted-foreground text-sm">:</span>
                  <Input
                    ref={endTimeMinutesRef}
                    placeholder="00"
                    value={endTimeMinutes}
                    onChange={(e) => {
                      setEndTimeMinutes(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "endMinutes")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                  <span className="text-muted-foreground text-sm">:</span>
                  <Input
                    ref={endTimeSecondsRef}
                    placeholder="00"
                    value={endTimeSeconds}
                    onChange={(e) => {
                      setEndTimeSeconds(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => handleKeyDown(e, "endSeconds")}
                    className="font-mono h-8 w-12 text-center text-sm p-0"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Start and End Date on same row */}
          <div className="space-y-2">
            <div className="flex md:flex-row flex-col md:gap-8 gap-2 items-start">
              {/* Start Date */}
              <div className="md:flex-1 w-full space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Start Date
                </Label>
                <Input
                  ref={startDateInputRef}
                  placeholder="yyyy-mm-dd"
                  value={startDateValue}
                  onChange={(e) => {
                    setStartDateValue(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => handleKeyDown(e, "startDate")}
                  className="font-mono h-8 text-sm text-center w-full px-0"
                />
              </div>

              {/* End Date */}
              <div className="md:flex-1 w-full space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  End Date
                </Label>
                <Input
                  ref={endDateInputRef}
                  placeholder="yyyy-mm-dd"
                  value={endDateValue}
                  onChange={(e) => {
                    setEndDateValue(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => handleKeyDown(e, "endDate")}
                  className="font-mono h-8 text-sm text-center w-full px-0"
                />
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Editing in {timeZone}
          </div>

          {(startIsAmbiguous || endIsAmbiguous) && (
            <div className="space-y-2 rounded-md border p-2">
              {startIsAmbiguous && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">Start occurs twice</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant={startDisambiguation === "earlier" ? "default" : "outline"} onClick={() => { setStartDisambiguation("earlier"); setError(""); }}>First</Button>
                    <Button size="sm" variant={startDisambiguation === "later" ? "default" : "outline"} onClick={() => { setStartDisambiguation("later"); setError(""); }}>Second</Button>
                  </div>
                </div>
              )}
              {endIsAmbiguous && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs">End occurs twice</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant={endDisambiguation === "earlier" ? "default" : "outline"} onClick={() => { setEndDisambiguation("earlier"); setError(""); }}>First</Button>
                    <Button size="sm" variant={endDisambiguation === "later" ? "default" : "outline"} onClick={() => { setEndDisambiguation("later"); setError(""); }}>Second</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 animate-in fade-in-0 duration-200 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• Tab to move between fields</div>
              <div>• Arrows to adjust time/date</div>
              <div>• Cmd+arrows to save and move one cell</div>
              <div>• Enter to save, Cmd+Enter to overwrite next</div>
              <div>• Cmd+Option+Enter to overwrite previous</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} className="flex-1">
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Tab" && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(false);
                    onNavigateNext?.();
                  }
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
