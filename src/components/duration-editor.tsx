"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as React from "react";
import { LiveDuration } from "./live-duration";

interface DurationEditorProps {
  duration: number; // Duration in seconds
  startTime: string;
  endTime: string | null;
  onSave?: (duration: number) => void;
  onSaveWithStartTimeAdjustment?: (duration: number) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onNavigateDown?: () => void;
  prevEntryEnd?: string | null; // End time of the previous entry (chronologically before)
  nextEntryStart?: string | null; // Start time of the next entry (chronologically after)
  "data-testid"?: string;
}

export function DurationEditor({
  duration,
  startTime,
  endTime,
  onSave,
  onSaveWithStartTimeAdjustment,
  onEditingChange,
  onNavigateDown,
  prevEntryEnd,
  nextEntryStart,
  "data-testid": dataTestId,
}: DurationEditorProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [hours, setHours] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [seconds, setSeconds] = React.useState("");

  const hoursRef = React.useRef<HTMLInputElement>(null);
  const minutesRef = React.useRef<HTMLInputElement>(null);
  const secondsRef = React.useRef<HTMLInputElement>(null);

  // Notify parent of editing state changes
  React.useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  const handleActivate = () => {
    // If timer is running (duration = -1), calculate current duration from start time
    let actualDuration = duration;
    if (duration === -1 && !endTime) {
      const now = new Date();
      const start = new Date(startTime);
      actualDuration = Math.floor((now.getTime() - start.getTime()) / 1000);
    }

    const h = Math.floor(actualDuration / 3600);
    const m = Math.floor((actualDuration % 3600) / 60);
    const s = actualDuration % 60;

    setHours(h.toString().padStart(2, "0"));
    setMinutes(m.toString().padStart(2, "0"));
    setSeconds(s.toString().padStart(2, "0"));
    setIsEditing(true);

    // Focus hours field
    setTimeout(() => {
      hoursRef.current?.focus();
      hoursRef.current?.select();
    }, 0);
  };

  const handleSave = () => {
    const h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    const s = parseInt(seconds) || 0;

    const totalSeconds = h * 3600 + m * 60 + s;

    // Check if anything changed
    if (totalSeconds !== duration) {
      onSave?.(totalSeconds);
    }

    setIsEditing(false);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Check if the new focus target is one of our other input fields
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (
      relatedTarget === hoursRef.current ||
      relatedTarget === minutesRef.current ||
      relatedTarget === secondsRef.current
    ) {
      // Don't save if moving between our fields
      return;
    }
    // Save if focus is leaving the duration editor completely
    handleSave();
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const adjustValue = (
    field: "hours" | "minutes" | "seconds",
    delta: number
  ) => {
    if (field === "hours") {
      const current = parseInt(hours) || 0;
      const newValue = Math.max(0, current + delta);
      setHours(newValue.toString().padStart(2, "0"));
    } else if (field === "minutes") {
      const current = parseInt(minutes) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setMinutes(newValue.toString().padStart(2, "0"));
    } else if (field === "seconds") {
      const current = parseInt(seconds) || 0;
      const newValue = Math.max(0, Math.min(59, current + delta));
      setSeconds(newValue.toString().padStart(2, "0"));
    }
  };

  const snapStartToPrevEnd = () => {
    if (!prevEntryEnd || !endTime) return;

    const prevEnd = new Date(prevEntryEnd);
    const currentEnd = new Date(endTime);
    const newDuration = Math.floor((currentEnd.getTime() - prevEnd.getTime()) / 1000);

    if (newDuration > 0) {
      const h = Math.floor(newDuration / 3600);
      const m = Math.floor((newDuration % 3600) / 60);
      const s = newDuration % 60;

      setHours(h.toString().padStart(2, "0"));
      setMinutes(m.toString().padStart(2, "0"));
      setSeconds(s.toString().padStart(2, "0"));
    }
  };

  const snapEndToNextStart = () => {
    if (!nextEntryStart) return;

    const currentStart = new Date(startTime);
    const nextStart = new Date(nextEntryStart);
    const newDuration = Math.floor((nextStart.getTime() - currentStart.getTime()) / 1000);

    if (newDuration > 0) {
      const h = Math.floor(newDuration / 3600);
      const m = Math.floor((newDuration % 3600) / 60);
      const s = newDuration % 60;

      setHours(h.toString().padStart(2, "0"));
      setMinutes(m.toString().padStart(2, "0"));
      setSeconds(s.toString().padStart(2, "0"));
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    field: "hours" | "minutes" | "seconds"
  ) => {
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
    if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
      return;
    }

    // Arrow keys for incrementing/decrementing
    if (e.key === "ArrowUp") {
      e.preventDefault();
      adjustValue(field, 1);
      return;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      adjustValue(field, -1);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const h = parseInt(hours) || 0;
      const m = parseInt(minutes) || 0;
      const s = parseInt(seconds) || 0;
      const totalSeconds = h * 3600 + m * 60 + s;

      // Option+Enter or Cmd+Option+Enter: adjust start time instead of stop time
      if (e.altKey) {
        if (totalSeconds !== duration) {
          onSaveWithStartTimeAdjustment?.(totalSeconds);
        }
        setIsEditing(false);

        // Cmd+Option+Enter: also navigate down
        if (e.metaKey || e.ctrlKey) {
          onNavigateDown?.();
        }
      } else {
        // Regular Enter or Cmd+Enter: normal behavior (adjust stop time)
        handleSave();
        if (e.metaKey || e.ctrlKey) {
          onNavigateDown?.();
        }
      }
    } else if (e.key === "Tab") {
      if (e.shiftKey) {
        // Shift+Tab (backwards)
        if (field === "minutes") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            hoursRef.current?.focus();
            hoursRef.current?.select();
          }, 0);
        } else if (field === "seconds") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            minutesRef.current?.focus();
            minutesRef.current?.select();
          }, 0);
        }
      } else {
        // Tab (forward)
        if (field === "hours") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            minutesRef.current?.focus();
            minutesRef.current?.select();
          }, 0);
        } else if (field === "minutes") {
          e.preventDefault();
          e.stopPropagation();
          setTimeout(() => {
            secondsRef.current?.focus();
            secondsRef.current?.select();
          }, 0);
        }
        // For seconds, let Tab continue naturally to next cell
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div
        className="flex items-center gap-0 font-mono text-xs px-1 py-0.5"
        data-testid={dataTestId}
      >
        <Input
          ref={hoursRef}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "hours")}
          onBlur={handleBlur}
          className="w-6 h-5 text-center p-0 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 rounded-sm"
          maxLength={2}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          ref={minutesRef}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "minutes")}
          onBlur={handleBlur}
          className="w-6 h-5 text-center p-0 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 rounded-sm"
          maxLength={2}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          ref={secondsRef}
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, "seconds")}
          onBlur={handleBlur}
          className="w-6 h-5 text-center p-0 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 rounded-sm"
          maxLength={2}
        />
      </div>
    );
  }

  const isRunning = !endTime || endTime === "";

  return (
    <div
      onClick={handleActivate}
      className={cn(
        "font-mono text-sm cursor-pointer px-1 py-1 rounded transition-colors flex items-center gap-2",
        "hover:bg-accent/40"
      )}
      data-testid={dataTestId}
    >
      {isRunning && (
        <div className="relative flex-shrink-0 md:order-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-75"></div>
        </div>
      )}
      <LiveDuration
        startTime={startTime}
        stopTime={endTime}
        staticDuration={duration}
        className="block min-w-[60px] md:order-1"
      />
    </div>
  );
}
