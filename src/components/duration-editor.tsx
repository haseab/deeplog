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
  onSaveWithForcePush?: (duration: number) => void; // Align next entry's start to this entry's end
  onSaveWithStartTimeAdjustmentAndForcePush?: (duration: number) => void; // Align previous entry's end to this entry's start
  onEditingChange?: (isEditing: boolean) => void;
  onNavigateVertical?: (direction: "up" | "down" | "left" | "right") => void;
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
  onSaveWithForcePush,
  onSaveWithStartTimeAdjustmentAndForcePush,
  onEditingChange,
  onNavigateVertical,
  prevEntryEnd,
  nextEntryStart,
  "data-testid": dataTestId,
}: DurationEditorProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [hours, setHours] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  const [seconds, setSeconds] = React.useState("");
  const [keepSecondsLive, setKeepSecondsLive] = React.useState(false);

  const hoursRef = React.useRef<HTMLInputElement>(null);
  const minutesRef = React.useRef<HTMLInputElement>(null);
  const secondsRef = React.useRef<HTMLInputElement>(null);
  const hoursValueRef = React.useRef("");
  const minutesValueRef = React.useRef("");
  const secondsValueRef = React.useRef("");

  React.useEffect(() => {
    hoursValueRef.current = hours;
    minutesValueRef.current = minutes;
    secondsValueRef.current = seconds;
  }, [hours, minutes, seconds]);

  // Keep a running timer live inside the editor until the user explicitly
  // changes its seconds segment. Hours and minutes remain independently
  // editable and only advance here when seconds roll over.
  React.useEffect(() => {
    if (!isEditing || !keepSecondsLive || duration !== -1 || endTime) return;

    const getElapsedSeconds = () =>
      Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    let lastElapsedSeconds = getElapsedSeconds();

    const tick = () => {
      const elapsedSeconds = getElapsedSeconds();
      const elapsedDelta = elapsedSeconds - lastElapsedSeconds;
      if (elapsedDelta <= 0) return;
      lastElapsedSeconds = elapsedSeconds;

      const currentSeconds = parseInt(secondsValueRef.current, 10) || 0;
      const secondsWithDelta = currentSeconds + elapsedDelta;
      const nextSeconds = secondsWithDelta % 60;
      const minuteCarry = Math.floor(secondsWithDelta / 60);

      const formattedSeconds = nextSeconds.toString().padStart(2, "0");
      secondsValueRef.current = formattedSeconds;
      setSeconds(formattedSeconds);

      if (minuteCarry > 0) {
        const currentMinutes = parseInt(minutesValueRef.current, 10) || 0;
        const minutesWithCarry = currentMinutes + minuteCarry;
        const nextMinutes = minutesWithCarry % 60;
        const hourCarry = Math.floor(minutesWithCarry / 60);
        const formattedMinutes = nextMinutes.toString().padStart(2, "0");
        minutesValueRef.current = formattedMinutes;
        setMinutes(formattedMinutes);

        if (hourCarry > 0) {
          const currentHours = parseInt(hoursValueRef.current, 10) || 0;
          const formattedHours = (currentHours + hourCarry)
            .toString()
            .padStart(2, "0");
          hoursValueRef.current = formattedHours;
          setHours(formattedHours);
        }
      }
    };

    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [duration, endTime, isEditing, keepSecondsLive, startTime]);

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
    setKeepSecondsLive(duration === -1 && !endTime);
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
    setKeepSecondsLive(false);
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
      setKeepSecondsLive(false);
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
    if (
      field === "seconds" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      (e.key === "Backspace" || e.key === "Delete" || /^\d$/.test(e.key))
    ) {
      // Stop before the input event so even a keystroke rejected by maxLength
      // establishes the user's seconds value as authoritative.
      setKeepSecondsLive(false);
    }

    if (
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
      onNavigateVertical?.(
        e.key === "ArrowDown"
          ? "down"
          : e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowRight"
              ? "right"
              : "left"
      );
      return;
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

      // Cmd+Option+Enter: adjust start and overwrite the previous boundary.
      if ((e.metaKey || e.ctrlKey) && e.altKey) {
        onSaveWithStartTimeAdjustmentAndForcePush?.(totalSeconds);
        setIsEditing(false);
      }
      // Cmd+Enter: adjust end and align both adjacent boundaries.
      else if (e.metaKey || e.ctrlKey) {
        onSaveWithForcePush?.(totalSeconds);
        setIsEditing(false);
      }
      // Option+Enter: adjust start time without overwriting the previous entry.
      else if (e.altKey) {
        if (totalSeconds !== duration) {
          onSaveWithStartTimeAdjustment?.(totalSeconds);
        }
        setIsEditing(false);
      } else {
        // Regular Enter: normal behavior (adjust stop time).
        handleSave();
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
          onChange={(e) => {
            hoursValueRef.current = e.target.value;
            setHours(e.target.value);
          }}
          onKeyDown={(e) => handleKeyDown(e, "hours")}
          onBlur={handleBlur}
          className="w-6 h-5 text-center p-0 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 rounded-sm"
          maxLength={2}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          ref={minutesRef}
          value={minutes}
          onChange={(e) => {
            minutesValueRef.current = e.target.value;
            setMinutes(e.target.value);
          }}
          onKeyDown={(e) => handleKeyDown(e, "minutes")}
          onBlur={handleBlur}
          className="w-6 h-5 text-center p-0 font-mono text-xs border-0 bg-transparent focus-visible:ring-1 rounded-sm"
          maxLength={2}
        />
        <span className="text-muted-foreground">:</span>
        <Input
          ref={secondsRef}
          value={seconds}
          onChange={(e) => {
            setKeepSecondsLive(false);
            secondsValueRef.current = e.target.value;
            setSeconds(e.target.value);
          }}
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
