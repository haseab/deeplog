import React from "react";
import { toast as sonnerToast } from "sonner";

// Simple global deduplication for toasts
let lastToast: { message: string; timestamp: number } | null = null;

// Store current undo action for keyboard shortcut
let currentUndoAction: ((event?: React.MouseEvent<HTMLButtonElement>) => void) | null = null;

export const toast = (
  message: string,
  options?: Parameters<typeof sonnerToast>[1]
) => {
  const now = Date.now();

  // Prevent duplicate toasts within 300ms
  if (
    lastToast &&
    lastToast.message === message &&
    now - lastToast.timestamp < 300
  ) {
    return;
  }

  lastToast = { message, timestamp: now };

  // Store undo action if present
  if (options?.action && typeof options.action === 'object' && 'onClick' in options.action && typeof options.action.onClick === 'function') {
    const originalOnClick = options.action.onClick;
    currentUndoAction = (event?: React.MouseEvent<HTMLButtonElement>) => {
      originalOnClick(event as React.MouseEvent<HTMLButtonElement>);
    };

    // Clear undo action when toast is dismissed
    const originalOnDismiss = options.onDismiss;
    const originalOnAutoClose = options.onAutoClose;

    options.onDismiss = (toast) => {
      currentUndoAction = null;
      originalOnDismiss?.(toast);
    };

    options.onAutoClose = (toast) => {
      currentUndoAction = null;
      originalOnAutoClose?.(toast);
    };
  } else {
    currentUndoAction = null;
  }

  return sonnerToast(message, options);
};

// Export function to trigger undo via keyboard
export const triggerUndo = () => {
  if (currentUndoAction) {
    currentUndoAction();
    sonnerToast.dismiss();
    currentUndoAction = null;
  }
};

// Re-export other toast methods
toast.success = sonnerToast.success;
toast.error = sonnerToast.error;
toast.info = sonnerToast.info;
toast.warning = sonnerToast.warning;
toast.loading = sonnerToast.loading;
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;
