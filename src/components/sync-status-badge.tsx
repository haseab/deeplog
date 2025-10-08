"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SyncStatus = "synced" | "syncing" | "error" | "session_expired" | "offline";

interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncTime?: Date;
  onReauthenticate?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function SyncStatusBadge({
  status,
  lastSyncTime,
  onReauthenticate,
  onRetry,
  className,
}: SyncStatusBadgeProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const getStatusConfig = () => {
    switch (status) {
      case "synced":
        return {
          icon: CheckCircle2,
          text: "In Sync",
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-900/20",
          borderColor: "border-green-200 dark:border-green-800",
          description: lastSyncTime
            ? `Last synced: ${new Date(lastSyncTime).toLocaleTimeString()}`
            : "Data is up to date",
        };
      case "syncing":
        return {
          icon: RefreshCw,
          text: "Syncing...",
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-900/20",
          borderColor: "border-blue-200 dark:border-blue-800",
          description: "Fetching latest data from Toggl",
          animate: true,
        };
      case "session_expired":
        return {
          icon: AlertCircle,
          text: "Reauthenticate",
          color: "text-amber-600 dark:text-amber-400",
          bgColor: "bg-amber-50 dark:bg-amber-900/20",
          borderColor: "border-amber-200 dark:border-amber-800",
          description: "Session expired - click to refresh token",
          actionable: true,
        };
      case "error":
        return {
          icon: AlertCircle,
          text: "Sync Error",
          color: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50 dark:bg-red-900/20",
          borderColor: "border-red-200 dark:border-red-800",
          description: "Failed to sync - click to retry",
          actionable: true,
        };
      case "offline":
        return {
          icon: WifiOff,
          text: "Offline",
          color: "text-gray-600 dark:text-gray-400",
          bgColor: "bg-gray-50 dark:bg-gray-900/20",
          borderColor: "border-gray-200 dark:border-gray-800",
          description: "No internet connection",
        };
      default:
        return {
          icon: CheckCircle2,
          text: "Unknown",
          color: "text-gray-600",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          description: "Status unknown",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const handleClick = () => {
    if (status === "session_expired" && onReauthenticate) {
      onReauthenticate();
    } else if (status === "error" && onRetry) {
      onRetry();
    } else if (status === "synced" && onRetry) {
      onRetry();
    }
  };

  const showRefreshOnHover = status === "synced";
  const isClickable = config.actionable || showRefreshOnHover;

  const badge = (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 relative overflow-hidden",
        config.bgColor,
        config.borderColor,
        config.color,
        isClickable && "cursor-pointer hover:scale-105 hover:shadow-sm",
        showRefreshOnHover && isHovered && "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400",
        className
      )}
      onClick={isClickable ? handleClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={cn(
        "flex items-center gap-2 transition-all duration-200",
        showRefreshOnHover && isHovered && "blur-sm opacity-0"
      )}>
        <Icon
          className={cn(
            "w-4 h-4",
            config.animate && "animate-spin"
          )}
        />
        <span>{config.text}</span>
      </div>

      {showRefreshOnHover && (
        <div className={cn(
          "absolute inset-0 flex items-center justify-center gap-2 transition-all duration-200",
          isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </div>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-sm">
          <p>{config.description}</p>
          {config.actionable && (
            <p className="text-xs text-muted-foreground mt-1">
              Click to {status === "session_expired" ? "reauthenticate" : "retry"}
            </p>
          )}
          {showRefreshOnHover && (
            <p className="text-xs text-muted-foreground mt-1">
              Click to refresh
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}