"use client";

import { TimeTrackerTable } from "@/components/time-tracker-table";
import { AppSettings } from "@/components/app-settings";
import { WelcomeForm } from "@/components/welcome-form";
import { EncryptionProvider } from "@/contexts/encryption-context";
import Image from "next/image";
import * as React from "react";

export default function Home() {
  const [mounted, setMounted] = React.useState(false);
  const [hasCredentials, setHasCredentials] = React.useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Check credentials after mount to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
    const sessionToken = localStorage.getItem("toggl_session_token");
    setHasCredentials(!!sessionToken);
  }, []);

  const handleFullscreenChange = React.useCallback((fullscreen: boolean) => {
    setIsFullscreen(fullscreen);
  }, []);

  const handleCredentialsSubmit = async (sessionToken: string) => {
    setIsTransitioning(true);

    // Store the session token in localStorage
    localStorage.setItem("toggl_session_token", sessionToken);

    // Add a smooth transition delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    setHasCredentials(true);
    setIsTransitioning(false);
  };

  const handleCredentialsReset = () => {
    localStorage.removeItem("toggl_session_token");
    localStorage.removeItem("toggl_api_key"); // Also remove old API key if it exists
    setHasCredentials(false);
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  // Show welcome form if no credentials
  if (!hasCredentials) {
    return (
      <WelcomeForm
        onCredentialsSubmit={handleCredentialsSubmit}
        helpText={
          <div className="space-y-3">
            <div>
              <strong>How to get your session token:</strong>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>
                Log into{" "}
                <a
                  href="https://track.toggl.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  Toggl Track
                </a>{" "}
                in your browser
              </li>
              <li>Open Developer Tools (F12 or right-click → Inspect)</li>
              <li>Go to Application/Storage → Cookies</li>
              <li>
                Find the cookie named{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  __Secure-accounts-session
                </code>
              </li>
              <li>Copy the value - this is your session token</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Note: Session tokens expire every month and need to be refreshed
            </p>
          </div>
        }
      />
    );
  }

  // Show main app with transition
  return (
    <EncryptionProvider>
      <main
        className={`min-h-screen bg-background transition-all duration-500 ${
          isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        <div className="container mx-auto py-8 px-4 max-w-7xl">
        {!isFullscreen && (
          <div className="flex justify-between items-center mb-8">
            <div>
              <div className="flex items-center space-x-2">
                <Image
                  src="/deeplog.svg"
                  alt="deeplog Logo"
                  width={28}
                  height={28}
                  className="dark:invert transition-transform duration-200 hover:scale-110"
                />
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  DeepLog
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <AppSettings showTogglKey={true} showLimitlessKey={true} onResetCredentials={handleCredentialsReset} />
            </div>
          </div>
        )}

        <TimeTrackerTable onFullscreenChange={handleFullscreenChange} />
      </div>
    </main>
    </EncryptionProvider>
  );
}
