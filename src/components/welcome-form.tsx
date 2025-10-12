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
  onCredentialsSubmit: (credential: string) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  sessionTokenLabel?: string;
  connectButtonText?: string;
  helpText?: React.ReactNode;
  skipValidation?: boolean;
  credentialType?: "session" | "api_key"; // Add this to support both modes
}

export function WelcomeForm({
  onCredentialsSubmit,
  title = "DeepLog",
  description = "for hardcore timetrackers",
  placeholder = "Enter your Toggl session token",
  sessionTokenLabel = "Toggl Session Token",
  connectButtonText = "Connect to Toggl",
  helpText,
  skipValidation = false,
  credentialType = "session",
}: WelcomeFormProps) {
  const [sessionToken, setSessionToken] = React.useState("");
  const [showSessionToken, setShowSessionToken] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{ sessionToken?: string }>({});
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const validateForm = () => {
    const newErrors: { sessionToken?: string } = {};

    if (!sessionToken.trim()) {
      newErrors.sessionToken = "Session token is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateSessionToken = async (sessionTokenValue: string) => {
    const endpoint =
      credentialType === "api_key"
        ? "/api/validate-api-key"
        : "/api/validate-session-token";

    const bodyKey = credentialType === "api_key" ? "apiKey" : "sessionToken";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ [bodyKey]: sessionTokenValue }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Failed to validate ${
            credentialType === "api_key" ? "API key" : "session token"
          }`
      );
    }

    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitForm();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      // Cmd+Enter or Ctrl+Enter
      e.preventDefault();
      submitForm();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Regular Enter (not Shift+Enter)
      e.preventDefault();
      submitForm();
    }
  };

  const submitForm = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!skipValidation) {
        // Validate the session token
        await validateSessionToken(sessionToken.trim());
      }

      // Add a brief delay for smooth animation
      await new Promise((resolve) => setTimeout(resolve, 500));

      onCredentialsSubmit(sessionToken.trim());
    } catch (error) {
      console.error("Error validating session token:", error);
      setErrors({
        sessionToken:
          error instanceof Error
            ? error.message
            : "Failed to connect. Please check your session token.",
      });
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/5 flex items-start justify-center p-4 pt-[10vh] md:pt-[20vh]">
      <div className="w-full max-w-md space-y-8 animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
        {/* Logo and Title Section */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <Image
                src="/deeplog.svg"
                alt="deeplog Logo"
                width={64}
                height={64}
                className="dark:invert transition-all duration-500 hover:scale-110"
              />
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-lg text-muted-foreground font-medium">
              {description}
            </p>
            <p className="text-sm text-muted-foreground/80">
              Please enter your session token to authenticate
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card className="border-border/60 shadow-lg shadow-black/5">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold">Welcome!</CardTitle>
            <CardDescription>
              Connect your account to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
              className="space-y-6"
            >
              {/* Session Token Field */}
              <div className="space-y-2">
                <Label
                  htmlFor="sessionToken"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <Key className="w-4 h-4 text-muted-foreground" />
                  {sessionTokenLabel}
                </Label>
                <div className="relative group">
                  <Input
                    id="sessionToken"
                    type={showSessionToken ? "text" : "password"}
                    value={sessionToken}
                    onChange={(e) => {
                      setSessionToken(e.target.value);
                      if (errors.sessionToken)
                        setErrors((prev) => ({
                          ...prev,
                          sessionToken: undefined,
                        }));
                    }}
                    placeholder={placeholder}
                    className={cn(
                      "pr-10 transition-all duration-200 border-border/60 hover:border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/10",
                      "group-hover:shadow-sm",
                      errors.sessionToken &&
                        "border-destructive focus:border-destructive focus:ring-destructive/10"
                    )}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent transition-colors duration-200"
                    onClick={() => setShowSessionToken(!showSessionToken)}
                    disabled={isSubmitting}
                  >
                    {showSessionToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    )}
                  </Button>
                </div>
                {errors.sessionToken && (
                  <p className="text-sm text-destructive animate-in slide-in-from-left-1 duration-200">
                    {errors.sessionToken}
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
                    <span>Connecting...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    <span>{connectButtonText}</span>
                  </div>
                )}
              </Button>
            </form>

            {/* Help Text */}
            {helpText && (
              <div className="mt-6 p-4 bg-accent/30 rounded-lg animate-in fade-in-0 duration-700 delay-1000">
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {helpText}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Privacy Notice */}
        <Card className="border-border/60 shadow-lg shadow-black/5 animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-200">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-foreground">🔒 Privacy</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We do not collect any data. All your information is stored
                locally on your device and never stored on our servers.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
