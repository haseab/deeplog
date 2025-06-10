import { toast as sonnerToast } from "sonner";

// Simple global deduplication for toasts
let lastToast: { message: string; timestamp: number } | null = null;

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
  return sonnerToast(message, options);
};

// Re-export other toast methods
toast.success = sonnerToast.success;
toast.error = sonnerToast.error;
toast.info = sonnerToast.info;
toast.warning = sonnerToast.warning;
toast.loading = sonnerToast.loading;
toast.dismiss = sonnerToast.dismiss;
toast.promise = sonnerToast.promise;
