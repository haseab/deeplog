"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Settings, Eye, EyeOff, Key, AlertTriangle, LayoutGrid, Shield } from "lucide-react";
import { toast } from "@/lib/toast";
import { useTheme } from "next-themes";
import { useEncryptionContext } from "@/contexts/encryption-context";
import { PinDialog } from "@/components/pin-dialog";

interface AppSettingsProps {
  showLimitlessKey?: boolean;
  showTogglKey?: boolean;
  onResetCredentials?: () => void;
}

type SettingsSection = "general" | "api-keys" | "danger-zone";

export function AppSettings({
  showLimitlessKey = false,
  showTogglKey = false,
  onResetCredentials
}: AppSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // API Keys
  const [limitlessApiKey, setLimitlessApiKey] = useState("");
  const [togglSessionToken, setTogglSessionToken] = useState("");
  const [todoistApiKey, setTodoistApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [showLimitlessApiKey, setShowLimitlessApiKey] = useState(false);
  const [showTogglToken, setShowTogglToken] = useState(false);
  const [showTodoistKey, setShowTodoistKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Toast duration setting
  const [toastDuration, setToastDuration] = useState(4000);

  // E2EE state
  const encryption = useEncryptionContext();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<"setup" | "verify" | "change">("setup");
  const [pinError, setPinError] = useState<string>("");

  useEffect(() => {
    setMounted(true);

    // Load settings from localStorage after mount
    if (typeof window !== "undefined") {
      if (showLimitlessKey) {
        setLimitlessApiKey(localStorage.getItem("limitless_api_key") || "");
      }
      if (showTogglKey) {
        setTogglSessionToken(localStorage.getItem("toggl_session_token") || "");
      }
      setTodoistApiKey(localStorage.getItem("todoist_api_key") || "");
      setOpenaiApiKey(localStorage.getItem("openai_api_key") || "");

      // Load and verify admin password
      const savedPassword = localStorage.getItem("admin_password");
      if (savedPassword) {
        setAdminPassword(savedPassword);
        // Verify the password hash
        (async () => {
          const encoder = new TextEncoder();
          const data = encoder.encode(savedPassword);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          const expectedHash = "a2ca63c171e9ef37a617b746e1fab6c1e90ba0089b92bccd7b7884a2e57fc68c";
          setIsAdminAuthenticated(hashHex === expectedHash);
        })();
      }

      // Load toast duration setting (default 4000ms)
      const savedDuration = localStorage.getItem("toast_duration");
      if (savedDuration) {
        setToastDuration(parseInt(savedDuration, 10));
      }
    }

    // Add keyboard shortcut for Cmd+Shift+, to open settings
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ",") {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showLimitlessKey, showTogglKey]);

  const handleThemeChange = (checked: boolean) => {
    const newTheme = checked ? "dark" : "light";
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme} mode`);
  };

  const handleToastDurationChange = (value: string) => {
    const duration = parseInt(value, 10);
    if (!isNaN(duration) && duration >= 0 && duration <= 10000) {
      setToastDuration(duration);
      localStorage.setItem("toast_duration", duration.toString());
      toast.success(`Toast duration set to ${duration / 1000}s`);
    }
  };

  const handleApiKeyChange = (key: string, value: string) => {
    localStorage.setItem(key, value);
    toast.success("API key saved");
  };

  const handleResetCredentials = () => {
    if (showLimitlessKey) {
      localStorage.removeItem("limitless_api_key");
    }
    if (showTogglKey) {
      localStorage.removeItem("toggl_session_token");
      localStorage.removeItem("toggl_api_key");
    }
    localStorage.removeItem("todoist_api_key");
    localStorage.removeItem("openai_api_key");
    toast.success("All credentials cleared");
    setIsOpen(false);
    if (onResetCredentials) {
      onResetCredentials();
    } else {
      window.location.reload();
    }
  };

  const handleE2EEToggle = (checked: boolean) => {
    if (checked) {
      // Enable E2EE - show PIN setup dialog
      setPinDialogMode("setup");
      setPinError("");
      setPinDialogOpen(true);
    } else {
      // Disable E2EE - require PIN verification
      setPinDialogMode("verify");
      setPinError("");
      setPinDialogOpen(true);
    }
  };

  const handlePinSuccess = (pin: string, newPin?: string) => {
    setPinError("");

    if (pinDialogMode === "setup") {
      const result = encryption.enableE2EE(pin);
      if (result.success) {
        toast.success("End-to-end encryption enabled");
        setPinDialogOpen(false);
      } else {
        setPinError(result.error || "Failed to enable encryption");
      }
    } else if (pinDialogMode === "verify") {
      // Verify PIN before disabling
      const result = encryption.disableE2EE(pin);
      if (result.success) {
        toast.success("End-to-end encryption disabled");
        setPinDialogOpen(false);
      } else {
        setPinError(result.error || "Failed to disable encryption");
      }
    } else if (pinDialogMode === "change" && newPin) {
      const result = encryption.changePin(pin, newPin);
      if (result.success) {
        toast.success("PIN changed successfully");
        setPinDialogOpen(false);
      } else {
        setPinError(result.error || "Failed to change PIN");
      }
    }
  };

  const handleChangePin = () => {
    setPinDialogMode("change");
    setPinError("");
    setPinDialogOpen(true);
  };

  const menuItems = [
    { id: "general" as const, label: "General", icon: LayoutGrid },
    { id: "api-keys" as const, label: "API Keys", icon: Key },
    { id: "danger-zone" as const, label: "Danger Zone", icon: AlertTriangle },
  ];

  return (
    <TooltipProvider delayDuration={0}>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">
          Settings (⌘⇧,)
        </TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden h-[90vh] md:h-auto max-[768px]:w-[calc(100%-2rem)] rounded-xl">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex flex-col md:flex-row h-full md:h-[600px]">
          {/* Sidebar */}
          <div className="md:w-56 border-b md:border-b-0 md:border-r bg-muted/30 p-4 md:p-6">
            <div className="mb-4 md:mb-6 hidden md:block">
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Manage your preferences
              </p>
            </div>
            <nav className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-x-visible">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`flex items-center gap-2 md:gap-3 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap md:w-full ${
                      activeSection === item.id
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden md:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-8">
              {activeSection === "general" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">General</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your general application preferences
                    </p>
                  </div>

                  <div className="space-y-6 pt-4">
                    {/* Theme Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                      <div className="space-y-0.5">
                        <Label htmlFor="dark-mode" className="text-base font-medium">
                          Dark Mode
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Use dark theme across the application
                        </p>
                      </div>
                      {mounted && (
                        <Switch
                          id="dark-mode"
                          checked={theme === "dark"}
                          onCheckedChange={handleThemeChange}
                        />
                      )}
                    </div>

                    {/* Toast Duration Setting */}
                    <div className="space-y-3 p-4 rounded-lg border bg-card">
                      <div>
                        <Label htmlFor="toast-duration" className="text-base font-medium">
                          Undo Toast Duration
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          How long undo toasts stay visible (0-10 seconds)
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Input
                          id="toast-duration"
                          type="number"
                          min="0"
                          max="10000"
                          step="500"
                          value={toastDuration}
                          onChange={(e) => setToastDuration(parseInt(e.target.value, 10) || 4000)}
                          onBlur={(e) => handleToastDurationChange(e.target.value)}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">
                          {(toastDuration / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>

                    {/* E2EE Settings */}
                    <div className="space-y-4 p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-base font-semibold mb-1">End-to-End Encryption</h4>
                          <p className="text-sm text-muted-foreground mb-3">
                            Encrypt time entry descriptions locally with a 6-digit PIN. Your data stays private even on Toggl servers.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div className="space-y-0.5">
                          <Label htmlFor="e2ee-enabled" className="text-base font-medium">
                            Enable Encryption
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            {encryption.isE2EEEnabled ?
                              (encryption.isUnlocked ? "Unlocked and active" : "Locked - unlock to view entries") :
                              "Protect your descriptions with encryption"}
                          </p>
                        </div>
                        <Switch
                          id="e2ee-enabled"
                          checked={encryption.isE2EEEnabled}
                          onCheckedChange={handleE2EEToggle}
                        />
                      </div>

                      {encryption.isE2EEEnabled && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleChangePin}
                            className="flex-1"
                          >
                            Change PIN
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "api-keys" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">API Keys</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your API credentials and integrations
                    </p>
                  </div>

                  <div className="space-y-4 pt-4">
                    {/* Toggl Session Token */}
                    {showTogglKey && (
                      <div className="space-y-3 p-4 rounded-lg border bg-card">
                        <div>
                          <Label htmlFor="toggl-token" className="text-base font-medium">
                            Toggl Session Token
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Required for accessing Toggl Track data
                          </p>
                        </div>
                        <div className="relative">
                          <Input
                            id="toggl-token"
                            type={showTogglToken ? "text" : "password"}
                            value={togglSessionToken}
                            onChange={(e) => setTogglSessionToken(e.target.value)}
                            onBlur={(e) => handleApiKeyChange("toggl_session_token", e.target.value)}
                            placeholder="Enter your Toggl session token"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTogglToken(!showTogglToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showTogglToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Task Automation Keys - Grouped */}
                    <div className="space-y-4 p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                      <div>
                        <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Task Automation (Admin Only)
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Enter admin password to access API keys for task extraction and transcriptions
                        </p>
                      </div>

                      {/* Admin Password */}
                      <div className="space-y-3 p-3 rounded-lg border bg-card">
                        <div>
                          <Label htmlFor="admin-password" className="text-base font-medium">
                            Admin Password
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Required to view and edit automation API keys
                          </p>
                        </div>
                        <div className="relative">
                          <Input
                            id="admin-password"
                            type={showAdminPassword ? "text" : "password"}
                            value={adminPassword}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAdminPassword(value);

                              // Hash the password and compare
                              if (value) {
                                (async () => {
                                  const encoder = new TextEncoder();
                                  const data = encoder.encode(value);
                                  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                                  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                                  console.log('Password hash:', hashHex);
                                  const expectedHash = "a2ca63c171e9ef37a617b746e1fab6c1e90ba0089b92bccd7b7884a2e57fc68c";
                                  const isValid = hashHex === expectedHash;
                                  console.log('Is valid:', isValid);
                                  setIsAdminAuthenticated(isValid);

                                  if (isValid) {
                                    localStorage.setItem("admin_password", value);
                                  } else {
                                    localStorage.removeItem("admin_password");
                                  }
                                })();
                              } else {
                                setIsAdminAuthenticated(false);
                                localStorage.removeItem("admin_password");
                              }
                            }}
                            placeholder="Enter admin password"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminPassword(!showAdminPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {isAdminAuthenticated && (
                        <div className="space-y-4">
                          <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            Admin authenticated - API keys visible
                          </div>

                      {/* Todoist API Key */}
                      <div className="space-y-3 p-3 rounded-lg border bg-card">
                        <div>
                          <Label htmlFor="todoist-key" className="text-base font-medium">
                            Todoist API Key
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Where extracted tasks will be created
                          </p>
                        </div>
                        <div className="relative">
                          <Input
                            id="todoist-key"
                            type={showTodoistKey ? "text" : "password"}
                            value={todoistApiKey}
                            onChange={(e) => setTodoistApiKey(e.target.value)}
                            onBlur={(e) => handleApiKeyChange("todoist_api_key", e.target.value)}
                            placeholder="Enter your Todoist API key"
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowTodoistKey(!showTodoistKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showTodoistKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Limitless API Key */}
                      {showLimitlessKey && (
                        <div className="space-y-3 p-3 rounded-lg border bg-card">
                          <div>
                            <Label htmlFor="limitless-key" className="text-base font-medium">
                              Limitless API Key
                            </Label>
                            <p className="text-xs text-muted-foreground mt-1">
                              Required for accessing Limitless transcriptions
                            </p>
                          </div>
                          <div className="relative">
                            <Input
                              id="limitless-key"
                              type={showLimitlessApiKey ? "text" : "password"}
                              value={limitlessApiKey}
                              onChange={(e) => setLimitlessApiKey(e.target.value)}
                              onBlur={(e) => handleApiKeyChange("limitless_api_key", e.target.value)}
                              placeholder="Enter your Limitless API key"
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowLimitlessApiKey(!showLimitlessApiKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showLimitlessApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* OpenAI API Key */}
                      <div className="space-y-3 p-3 rounded-lg border bg-card">
                        <div>
                          <Label htmlFor="openai-key" className="text-base font-medium">
                            OpenAI API Key
                          </Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Used to generate tasks from transcript context
                          </p>
                        </div>
                        <div className="relative">
                          <Input
                            id="openai-key"
                            type={showOpenaiKey ? "text" : "password"}
                            value={openaiApiKey}
                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                            onBlur={(e) => handleApiKeyChange("openai_api_key", e.target.value)}
                            placeholder="sk-..."
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "danger-zone" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold mb-1 text-destructive">Danger Zone</h3>
                    <p className="text-sm text-muted-foreground">
                      Irreversible actions that affect your account
                    </p>
                  </div>

                  <div className="space-y-4 pt-4">
                    <div className="p-6 rounded-lg border-2 border-destructive/50 bg-destructive/5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="font-semibold text-base">Reset All Credentials</h4>
                          <p className="text-sm text-muted-foreground">
                            Clear all stored API keys and session tokens. You will need to re-authenticate.
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          onClick={handleResetCredentials}
                          className="shrink-0"
                        >
                          Reset Credentials
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* PIN Dialog */}
    <PinDialog
      open={pinDialogOpen}
      onOpenChange={setPinDialogOpen}
      mode={pinDialogMode}
      onSuccess={handlePinSuccess}
      error={pinError}
      lockoutTimeRemaining={encryption.isLockedOut() ? encryption.getLockoutTimeRemaining() : undefined}
    />
    </TooltipProvider>
  );
}
