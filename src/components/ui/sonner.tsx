"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

const ThemedToaster = () => {
  const { theme = "system" } = useTheme();

  return (
    <Toaster
      theme={theme as "light" | "dark" | "system"}
      className="toaster group"
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--error-bg": "var(--destructive)",
          "--error-text": "var(--destructive-foreground)",
          "--error-border": "var(--destructive)",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          border: "1px solid var(--normal-border)",
        },
        classNames: {
          error: "error-toast",
          success: "success-toast",
          warning: "warning-toast",
          info: "info-toast",
        },
      }}
    />
  );
};

export { ThemedToaster as Toaster };
