"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, AlertTriangle } from "lucide-react";
import { validatePin } from "@/lib/encryption";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "setup" | "verify" | "change";
  onSuccess: (pin: string, newPin?: string) => void;
  error?: string;
  lockoutTimeRemaining?: number;
}

export function PinDialog({
  open,
  onOpenChange,
  mode,
  onSuccess,
  error: externalError,
  lockoutTimeRemaining,
}: PinDialogProps) {
  const [pin, setPin] = useState<string[]>(["", "", "", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState<string[]>(["", "", "", "", "", ""]);
  const [newPin, setNewPin] = useState<string[]>(["", "", "", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string>("");
  const [step, setStep] = useState<"current" | "new">("current");
  const [savedCurrentPin, setSavedCurrentPin] = useState<string>("");

  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const newPinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset state when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      setPin(["", "", "", "", "", ""]);
      setConfirmPin(["", "", "", "", "", ""]);
      setNewPin(["", "", "", "", "", ""]);
      setError("");
      setStep("current");
      setSavedCurrentPin("");
      // Focus first input after a short delay
      setTimeout(() => {
        if (mode === "setup" || mode === "verify") {
          pinInputRefs.current[0]?.focus();
        } else if (mode === "change") {
          pinInputRefs.current[0]?.focus();
        }
      }, 100);
    }
  }, [open, mode]);

  // Update error from props
  useEffect(() => {
    if (externalError) {
      setError(externalError);
    }
  }, [externalError]);

  const handlePinChange = (
    index: number,
    value: string,
    pinArray: string[],
    setPinArray: (pin: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newPin = [...pinArray];
    newPin[index] = value;
    setPinArray(newPin);

    // Auto-focus next input
    if (value && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    pinArray: string[],
    setPinArray: (pin: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === "Backspace") {
      if (!pinArray[index] && index > 0) {
        // Move to previous input if current is empty
        refs.current[index - 1]?.focus();
      } else {
        // Clear current input
        const newPin = [...pinArray];
        newPin[index] = "";
        setPinArray(newPin);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      refs.current[index + 1]?.focus();
    } else if (e.key === "Enter") {
      handleSubmit();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  const handlePaste = (
    e: React.ClipboardEvent,
    pinArray: string[],
    setPinArray: (pin: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text");
    const digits = pastedData.replace(/\D/g, "").slice(0, 6);

    if (digits.length > 0) {
      const newPin = [...pinArray];
      for (let i = 0; i < digits.length && i < 6; i++) {
        newPin[i] = digits[i];
      }
      setPinArray(newPin);

      // Focus the next empty input or last input
      const nextIndex = Math.min(digits.length, 5);
      refs.current[nextIndex]?.focus();
    }
  };

  const handleSubmit = () => {
    setError("");

    const pinString = pin.join("");

    if (mode === "verify") {
      // Verify mode - just submit PIN
      const validation = validatePin(pinString);
      if (!validation.valid) {
        setError(validation.error || "Invalid PIN");
        return;
      }
      onSuccess(pinString);
    } else if (mode === "setup") {
      // Setup mode - validate and confirm
      const validation = validatePin(pinString);
      if (!validation.valid) {
        setError(validation.error || "Invalid PIN");
        return;
      }

      const confirmPinString = confirmPin.join("");
      if (pinString !== confirmPinString) {
        setError("PINs do not match");
        return;
      }

      onSuccess(pinString);
    } else if (mode === "change") {
      // Change mode - two steps
      if (step === "current") {
        const validation = validatePin(pinString);
        if (!validation.valid) {
          setError(validation.error || "Invalid PIN");
          return;
        }
        setSavedCurrentPin(pinString);
        setStep("new");
        setPin(["", "", "", "", "", ""]);
        setTimeout(() => newPinInputRefs.current[0]?.focus(), 100);
      } else {
        // Validate new PIN
        const newPinString = newPin.join("");
        const validation = validatePin(newPinString);
        if (!validation.valid) {
          setError(validation.error || "Invalid PIN");
          return;
        }

        const confirmPinString = confirmPin.join("");
        if (newPinString !== confirmPinString) {
          setError("PINs do not match");
          return;
        }

        // Submit both old and new PINs
        onSuccess(savedCurrentPin, newPinString);
      }
    }
  };

  const isComplete = () => {
    if (mode === "verify") {
      return pin.every((digit) => digit !== "");
    } else if (mode === "setup") {
      return pin.every((digit) => digit !== "") && confirmPin.every((digit) => digit !== "");
    } else if (mode === "change") {
      if (step === "current") {
        return pin.every((digit) => digit !== "");
      } else {
        return newPin.every((digit) => digit !== "") && confirmPin.every((digit) => digit !== "");
      }
    }
    return false;
  };

  const renderPinInputs = (
    pinArray: string[],
    setPinArray: (pin: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    label: string
  ) => (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex gap-2 justify-center">
        {pinArray.map((digit, index) => (
          <Input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handlePinChange(index, e.target.value, pinArray, setPinArray, refs)}
            onKeyDown={(e) => handleKeyDown(e, index, pinArray, setPinArray, refs)}
            onPaste={(e) => handlePaste(e, pinArray, setPinArray, refs)}
            className="w-12 h-12 text-center text-lg font-semibold"
          />
        ))}
      </div>
    </div>
  );

  const getTitle = () => {
    if (mode === "setup") return "Set up Encryption PIN";
    if (mode === "verify") return "Enter PIN";
    if (mode === "change") {
      return step === "current" ? "Enter Current PIN" : "Set New PIN";
    }
    return "";
  };

  const getDescription = () => {
    if (lockoutTimeRemaining && lockoutTimeRemaining > 0) {
      return `Too many attempts. Try again in ${lockoutTimeRemaining} seconds.`;
    }
    if (mode === "setup") {
      return "Create a 6-digit PIN to encrypt your time entry descriptions. This PIN will be required to decrypt your data.";
    }
    if (mode === "verify") {
      return "Enter your 6-digit PIN to unlock encrypted time entries.";
    }
    if (mode === "change") {
      if (step === "current") {
        return "Enter your current PIN to proceed.";
      }
      return "Choose a new 6-digit PIN for encryption.";
    }
    return "";
  };

  const isLocked = lockoutTimeRemaining && lockoutTimeRemaining > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-xl">{getTitle()}</DialogTitle>
        </div>

        <DialogDescription className="text-sm text-muted-foreground mb-4">
          {getDescription()}
        </DialogDescription>

        {!isLocked && (
          <div className="space-y-6">
            {/* Warning banner for setup mode */}
            {mode === "setup" && (
              <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200 ml-2">
                  <strong>Warning:</strong> If you forget your PIN, all encrypted data will be permanently lost. There is no recovery option.
                </AlertDescription>
              </Alert>
            )}

            {/* Current PIN or Main PIN input */}
            {(mode === "verify" || mode === "setup" || (mode === "change" && step === "current")) &&
              renderPinInputs(pin, setPin, pinInputRefs, mode === "setup" ? "PIN" : "PIN")}

            {/* New PIN input (for change mode) */}
            {mode === "change" && step === "new" &&
              renderPinInputs(newPin, setNewPin, newPinInputRefs, "New PIN")}

            {/* Confirm PIN input */}
            {((mode === "setup") || (mode === "change" && step === "new")) &&
              renderPinInputs(confirmPin, setConfirmPin, confirmPinInputRefs, "Confirm PIN")}

            {/* Show/Hide toggle */}
            <div className="flex items-center justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPin(!showPin)}
                className="text-sm"
              >
                {showPin ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Hide PIN
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Show PIN
                  </>
                )}
              </Button>
            </div>

            {/* Error message */}
            {error && (
              <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded">
                {error}
              </div>
            )}

            {/* Submit button */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isComplete()}
                className="flex-1"
              >
                {mode === "change" && step === "current" ? "Continue" : "Confirm"}
              </Button>
            </div>
          </div>
        )}

        {isLocked && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
