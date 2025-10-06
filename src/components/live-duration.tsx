"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

interface LiveDurationProps {
  startTime: string;
  stopTime: string | null;
  staticDuration: number; // Duration in seconds from the API
  className?: string;
}

export function LiveDuration({
  startTime,
  stopTime,
  staticDuration,
  className,
}: LiveDurationProps) {
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    // Only set up interval for running entries (no stop time or duration is -1)
    if (!stopTime || staticDuration === -1) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [stopTime, staticDuration]);

  const formatDuration = (seconds: number): string => {
    const absSeconds = Math.abs(seconds); // Handle negative durations
    const hours = Math.floor(absSeconds / 3600);
    const minutes = Math.floor((absSeconds % 3600) / 60);
    const secs = absSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // If the entry is completed (has stop time AND duration is not -1), show the static duration
  if (stopTime && staticDuration !== -1) {
    return (
      <span
        className={cn("font-mono transition-colors duration-200", className)}
      >
        {formatDuration(staticDuration)}
      </span>
    );
  }

  // For running entries, calculate live duration
  const startDate = new Date(startTime);
  const elapsedSeconds = Math.floor(
    (currentTime.getTime() - startDate.getTime()) / 1000
  );

  return (
    <span
      className={cn(
        "text-green-500 font-mono animate-pulse transition-all duration-200",
        className
      )}
    >
      {formatDuration(elapsedSeconds)}
    </span>
  );
}
