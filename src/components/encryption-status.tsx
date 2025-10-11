"use client";

import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EncryptionStatusProps {
  isE2EEEnabled: boolean;
  isUnlocked: boolean;
  onLock: () => void;
  onUnlock: () => void;
}

export function EncryptionStatus({
  isE2EEEnabled,
  isUnlocked,
  onLock,
  onUnlock,
}: EncryptionStatusProps) {
  if (!isE2EEEnabled) {
    return null;
  }

  const handleClick = () => {
    if (isUnlocked) {
      onLock();
    } else {
      onUnlock();
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className="h-8 w-8"
          >
            {isUnlocked ? (
              <LockOpen className="h-4 w-4 text-green-600" />
            ) : (
              <Lock className="h-4 w-4 text-yellow-600" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isUnlocked ? "Encryption Unlocked (click to lock)" : "Encryption Locked (click to unlock)"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
