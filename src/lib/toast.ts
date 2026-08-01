import React from "react";
import { toast as sonnerToast } from "sonner";

// Simple global deduplication for toasts
let lastToast: { message: string; timestamp: number } | null = null;

type ToastId = string | number;

type ActiveToastActions = {
  undo: ((event?: React.MouseEvent<HTMLButtonElement>) => void) | null;
  submit: (() => void) | null;
};

// Actions are owned by their toast. Keep the most recent actionable toast as
// the keyboard target without allowing unrelated informational toasts to
// erase an operation that is waiting to be submitted or undone.
const activeToastActions = new Map<ToastId, ActiveToastActions>();
let currentToastId: ToastId | null = null;

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

  let wrappedUndoAction:
    | ((event?: React.MouseEvent<HTMLButtonElement>) => void)
    | null = null;

  // Store undo action if present
  if (toastOptions.action && typeof toastOptions.action === 'object' && 'onClick' in toastOptions.action && typeof toastOptions.action.onClick === 'function') {
    const originalOnClick = toastOptions.action.onClick;
    wrappedUndoAction = (event?: React.MouseEvent<HTMLButtonElement>) => {
      // Undo and submit are mutually exclusive.
      shouldSubmitOnDismiss = false;
      activeToastActions.delete(toastId);
      if (currentToastId === toastId) currentToastId = null;
      originalOnClick(event as React.MouseEvent<HTMLButtonElement>);
    };

    toastOptions.action = {
      ...toastOptions.action,
      onClick: wrappedUndoAction,
    };

    // Clear undo action when toast is dismissed
    const originalOnDismiss = toastOptions.onDismiss;
    const originalOnAutoClose = toastOptions.onAutoClose;

    toastOptions.onDismiss = (toast) => {
      activeToastActions.delete(toastId);
      if (currentToastId === toastId) currentToastId = null;
      runSubmitAction();
      originalOnDismiss?.(toast);
    };

    toastOptions.onAutoClose = (toast) => {
      shouldSubmitOnDismiss = false;
      activeToastActions.delete(toastId);
      if (currentToastId === toastId) currentToastId = null;
      originalOnAutoClose?.(toast);
    };
  }

  const toastId: ToastId = sonnerToast(message, toastOptions);
  if (wrappedUndoAction || ownedSubmitAction) {
    activeToastActions.set(toastId, {
      undo: wrappedUndoAction,
      submit: ownedSubmitAction ? runSubmitAction : null,
    });
    currentToastId = toastId;
  }
  return toastId;
};

// Export function to trigger undo via keyboard
export const triggerUndo = () => {
  if (currentToastId === null) return false;

  const toastId = currentToastId;
  const actions = activeToastActions.get(toastId);
  if (!actions?.undo) return false;

  activeToastActions.delete(toastId);
  currentToastId = null;
  actions.undo();
  sonnerToast.dismiss(toastId);
  return true;
};

// Submit the operation behind the active undo toast immediately.
export const triggerToastSubmit = () => {
  if (currentToastId === null) return false;

  const toastId = currentToastId;
  const actions = activeToastActions.get(toastId);
  if (!actions?.submit) return false;

  activeToastActions.delete(toastId);
  currentToastId = null;
  actions.submit();
  sonnerToast.dismiss(toastId);
  return true;
};

// Export function to clear undo action without dismissing toast
export const clearUndoAction = () => {
  activeToastActions.clear();
  currentToastId = null;
};

// Export function to check if there's an active toast
export const hasActiveToast = () => {
  return currentToastId !== null && activeToastActions.has(currentToastId);
};

// Re-export other toast methods
toast.success = sonnerToast.success;
toast.error = sonnerToast.error;
toast.info = sonnerToast.info;
toast.warning = sonnerToast.warning;
toast.loading = sonnerToast.loading;
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;
