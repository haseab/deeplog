"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { TimeTrackerTable } from "@/components/time-tracker-table";
import { WelcomeForm } from "@/components/welcome-form";
import Image from "next/image";
import * as React from "react";

export default function Home() {
  const [hasCredentials, setHasCredentials] = React.useState<boolean | null>(
    null
  );
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  React.useEffect(() => {
    // Check if credentials exist in localStorage
    const apiKey = localStorage.getItem("toggl_api_key");
    setHasCredentials(!!apiKey);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCredentialsSubmit = async (_apiKey: string) => {
    setIsTransitioning(true);

    // Add a smooth transition delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    setHasCredentials(true);
    setIsTransitioning(false);
  };

  const handleCredentialsReset = () => {
    localStorage.removeItem("toggl_api_key");
    setHasCredentials(false);
  };

  // Show loading state while checking credentials
  if (hasCredentials === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">
            Loading DeepLog...
          </p>
        </div>
      </div>
    );
  }

  // Show welcome form if no credentials
  if (!hasCredentials) {
    return <WelcomeForm onCredentialsSubmit={handleCredentialsSubmit} />;
  }

  // Show main app with transition
  return (
    <main
      className={`min-h-screen bg-background transition-all duration-500 ${
        isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
    >
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="flex items-center space-x-2">
              <Image
                src="/deeplog.svg"
                alt="DeepLog Logo"
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
            <ThemeToggle />
            <button
              onClick={handleCredentialsReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 px-2 py-1 rounded hover:bg-accent/50"
            >
              Reset Credentials
            </button>
          </div>
        </div>

        <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
          <TimeTrackerTable />
        </div>
      </div>
    </main>
  );
}
