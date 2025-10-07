"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      pauseWhenPageIsHidden={false} // Don't pause timers when tab is hidden
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
      {...props}
    />
  );
};

export { Toaster };
