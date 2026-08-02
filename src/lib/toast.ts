import React from "react";
import { toast as sonnerToast } from "sonner";

// Simple global deduplication for toasts
let lastToast: { message: string; timestamp: number } | null = null;

type ToastId = string | number;

type ActiveToastActions = {
  undo: ((event?: React.MouseEvent<HTMLButtonElement>) => void) | null;
  submit: (() => boolean | void) | null;
};

// Actions are owned by their toast. Keep the most recent actionable toast as
// the keyboard target without allowing unrelated informational toasts to
// erase an operation that is waiting to be submitted or undone.
const activeToastActions = new Map<ToastId, ActiveToastActions>();
let currentToastId: ToastId | null = null;

const findLatestToastId = (
  predicate: (actions: ActiveToastActions) => boolean
): ToastId | null => {
  let latestToastId: ToastId | null = null;
  for (const [toastId, actions] of activeToastActions) {
    if (predicate(actions)) latestToastId = toastId;
  }
  return latestToastId;
};

const refreshCurrentToastId = () => {
  currentToastId = findLatestToastId(
    (actions) => actions.undo !== null || actions.submit !== null
  );
};

type ToastOptions = NonNullable<Parameters<typeof sonnerToast>[1]> & {
  submitAction?: () => boolean | void;
};

export const toast = (
  message: string,
  options?: ToastOptions
) => {
  const now = Date.now();
  const hasUndoAction =
    options?.action &&
    typeof options.action === "object" &&
    "onClick" in options.action &&
    typeof options.action.onClick === "function";
  const isActionableToast = Boolean(options?.submitAction || hasUndoAction);

  // Prevent duplicate informational toasts within 300ms. Every actionable
  // mutation must retain its own toast so repeated Cmd/Ctrl+Z can undo it.
  if (
    !isActionableToast &&
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
    if (!shouldSubmitOnDismiss) return false;
    const result = ownedSubmitAction?.();
    if (result === false) return false;
    shouldSubmitOnDismiss = false;
    return true;
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
      if (currentToastId === toastId) refreshCurrentToastId();
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
      if (currentToastId === toastId) refreshCurrentToastId();
      runSubmitAction();
      originalOnDismiss?.(toast);
    };

    toastOptions.onAutoClose = (toast) => {
      shouldSubmitOnDismiss = false;
      activeToastActions.delete(toastId);
      if (currentToastId === toastId) refreshCurrentToastId();
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
  const toastId = findLatestToastId((actions) => actions.undo !== null);
  if (toastId === null) return false;
  const actions = activeToastActions.get(toastId);
  if (!actions?.undo) return false;

  activeToastActions.delete(toastId);
  refreshCurrentToastId();
  actions.undo();
  sonnerToast.dismiss(toastId);
  return { toastId };
};

export const getLatestUndoToastId = () =>
  findLatestToastId((actions) => actions.undo !== null);

// Submit the operation behind the active undo toast immediately.
export const triggerToastSubmit = () => {
  const toastId = findLatestToastId((actions) => actions.submit !== null);
  if (toastId === null) return false;
  const actions = activeToastActions.get(toastId);
  if (!actions?.submit) return false;

  if (actions.submit() === false) return false;
  activeToastActions.delete(toastId);
  refreshCurrentToastId();
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
  return activeToastActions.size > 0;
};

// Re-export other toast methods
toast.success = sonnerToast.success;
toast.error = sonnerToast.error;
toast.info = sonnerToast.info;
toast.warning = sonnerToast.warning;
toast.loading = sonnerToast.loading;
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;
