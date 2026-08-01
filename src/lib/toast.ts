import React from "react";
import { toast as sonnerToast } from "sonner";

// Simple global deduplication for toasts
let lastToast: { message: string; timestamp: number } | null = null;

// Store current undo action for keyboard shortcut
let currentUndoAction: ((event?: React.MouseEvent<HTMLButtonElement>) => void) | null = null;
let currentSubmitAction: (() => void) | null = null;
let currentToastId: string | number | null = null;

type ToastOptions = NonNullable<Parameters<typeof sonnerToast>[1]> & {
  submitAction?: () => void;
};

export const toast = (
  message: string,
  options?: ToastOptions
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

  const { submitAction, ...toastOptions } = options || {};
  const ownedSubmitAction = submitAction || null;
  let shouldSubmitOnDismiss = ownedSubmitAction !== null;
  const runSubmitAction = () => {
    if (!shouldSubmitOnDismiss) return;
    shouldSubmitOnDismiss = false;
    ownedSubmitAction?.();
  };
  currentSubmitAction = ownedSubmitAction ? runSubmitAction : null;

  // Store undo action if present
  if (toastOptions.action && typeof toastOptions.action === 'object' && 'onClick' in toastOptions.action && typeof toastOptions.action.onClick === 'function') {
    const originalOnClick = toastOptions.action.onClick;
    const wrappedUndoAction = (event?: React.MouseEvent<HTMLButtonElement>) => {
      // Undo and submit are mutually exclusive.
      shouldSubmitOnDismiss = false;
      if (currentSubmitAction === runSubmitAction) {
        currentSubmitAction = null;
      }
      originalOnClick(event as React.MouseEvent<HTMLButtonElement>);
    };
    currentUndoAction = wrappedUndoAction;

    toastOptions.action = {
      ...toastOptions.action,
      onClick: wrappedUndoAction,
    };

    // Clear undo action when toast is dismissed
    const originalOnDismiss = toastOptions.onDismiss;
    const originalOnAutoClose = toastOptions.onAutoClose;

    toastOptions.onDismiss = (toast) => {
      if (currentUndoAction === wrappedUndoAction) currentUndoAction = null;
      if (currentSubmitAction === runSubmitAction) currentSubmitAction = null;
      if (currentToastId === toastId) currentToastId = null;
      runSubmitAction();
      originalOnDismiss?.(toast);
    };

    toastOptions.onAutoClose = (toast) => {
      shouldSubmitOnDismiss = false;
      if (currentUndoAction === wrappedUndoAction) currentUndoAction = null;
      if (currentSubmitAction === runSubmitAction) currentSubmitAction = null;
      if (currentToastId === toastId) currentToastId = null;
      originalOnAutoClose?.(toast);
    };
  } else {
    currentUndoAction = null;
  }

  const toastId = sonnerToast(message, toastOptions);
  if (currentUndoAction || ownedSubmitAction) currentToastId = toastId;
  return toastId;
};

// Export function to trigger undo via keyboard
export const triggerUndo = () => {
  if (currentUndoAction) {
    const action = currentUndoAction;
    currentUndoAction = null;
    currentSubmitAction = null;
    action();
    if (currentToastId !== null) sonnerToast.dismiss(currentToastId);
    currentToastId = null;
    return true;
  }

  return false;
};

// Submit the operation behind the active undo toast immediately.
export const triggerToastSubmit = () => {
  if (!currentSubmitAction) return false;

  const action = currentSubmitAction;
  currentSubmitAction = null;
  currentUndoAction = null;
  action();
  if (currentToastId !== null) sonnerToast.dismiss(currentToastId);
  currentToastId = null;
  return true;
};

// Export function to clear undo action without dismissing toast
export const clearUndoAction = () => {
  currentUndoAction = null;
  currentSubmitAction = null;
  currentToastId = null;
};

// Export function to check if there's an active toast
export const hasActiveToast = () => {
  return currentUndoAction !== null;
};

// Re-export other toast methods
toast.success = sonnerToast.success;
toast.error = sonnerToast.error;
toast.info = sonnerToast.info;
toast.warning = sonnerToast.warning;
toast.loading = sonnerToast.loading;
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;
