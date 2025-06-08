"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CheckCircle, Eye, EyeOff, Key } from "lucide-react";
import Image from "next/image";
import * as React from "react";

interface WelcomeFormProps {
  onCredentialsSubmit: (apiKey: string) => void;
}

export function WelcomeForm({ onCredentialsSubmit }: WelcomeFormProps) {
  const [apiKey, setApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{ apiKey?: string }>({});
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const validateForm = () => {
    const newErrors: { apiKey?: string } = {};

    if (!apiKey.trim()) {
      newErrors.apiKey = "API key is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateApiKey = async (apiKeyValue: string) => {
    const auth = Buffer.from(`${apiKeyValue}:api_token`).toString("base64");

    const response = await fetch(
      "https://api.track.toggl.com/api/v9/workspaces",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Invalid API key or unable to connect to Toggl");
    }

    const workspaces = await response.json();
    if (!workspaces || workspaces.length === 0) {
      throw new Error("No workspaces found for this account");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate the API key
      await validateApiKey(apiKey.trim());

      // Add a brief delay for smooth animation
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Store credentials in localStorage
      localStorage.setItem("toggl_api_key", apiKey.trim());

      onCredentialsSubmit(apiKey.trim());
    } catch (error) {
      console.error("Error fetching workspace:", error);
      setErrors({
        apiKey:
          error instanceof Error
            ? error.message
            : "Failed to connect to Toggl. Please check your API key.",
      });
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
        {/* Logo and Title Section */}
        <div className="text-center space-y-4">
          <div className="flex justify-center animate-in zoom-in-50 duration-1000 delay-200">
            <div className="relative">
              <Image
                src="/deeplogo.svg"
                alt="DeepLog Logo"
                width={64}
                height={64}
                className="dark:invert transition-all duration-500 hover:scale-110"
              />
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
          </div>

          <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-700 delay-400">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              DeepLog
            </h1>
            <p className="text-lg text-muted-foreground font-medium">
              for hardcore timetrackers
            </p>
            <p className="text-sm text-muted-foreground/80">
              Please enter your Toggl API key
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-border/60 shadow-lg shadow-black/5 animate-in slide-in-from-bottom-4 duration-700 delay-600">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">Welcome!</CardTitle>
            <CardDescription>
              Connect your Toggl account to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* API Key Field */}
              <div className="space-y-2">
                <Label
                  htmlFor="apiKey"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <Key className="w-4 h-4 text-muted-foreground" />
                  Toggl API Key
                </Label>
                <div className="relative group">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      if (errors.apiKey)
                        setErrors((prev) => ({ ...prev, apiKey: undefined }));
                    }}
                    placeholder="Enter your Toggl API key"
                    className={cn(
                      "pr-10 transition-all duration-200 border-border/60 hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/10",
                      "group-hover:shadow-sm",
                      errors.apiKey &&
                        "border-destructive focus:border-destructive focus:ring-destructive/10"
                    )}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent transition-colors duration-200"
                    onClick={() => setShowApiKey(!showApiKey)}
                    disabled={isSubmitting}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    )}
                  </Button>
                </div>
                {errors.apiKey && (
                  <p className="text-sm text-destructive animate-in slide-in-from-left-1 duration-200">
                    {errors.apiKey}
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "w-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                  "hover:shadow-lg disabled:opacity-60 disabled:hover:scale-100",
                  isSubmitting && "bg-green-500 hover:bg-green-500"
                )}
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Connecting to Toggl...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>Connect to Toggl</span>
                  </div>
                )}
              </Button>
            </form>

            {/* Help Text */}
            <div className="mt-6 p-4 bg-accent/30 rounded-lg animate-in fade-in-0 duration-700 delay-1000">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>How to find your API key:</strong>
                <br />
                Visit your{" "}
                <a
                  href="https://track.toggl.com/profile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  Toggl profile page
                </a>{" "}
                and scroll to the bottom.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
