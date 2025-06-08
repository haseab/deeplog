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
    // Only set up interval for running entries (no stop time)
    if (!stopTime) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [stopTime]);

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // If the entry is completed, show the static duration
  if (stopTime) {
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
