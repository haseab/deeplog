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
import { Settings, Eye, EyeOff, Key, AlertTriangle, LayoutGrid } from "lucide-react";
import { toast } from "@/lib/toast";
import { useTheme } from "next-themes";

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

  const [showLimitlessApiKey, setShowLimitlessApiKey] = useState(false);
  const [showTogglToken, setShowTogglToken] = useState(false);
  const [showTodoistKey, setShowTodoistKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Load settings from localStorage after mount
    if (typeof window !== "undefined") {
      if (showLimitlessKey) {
        setLimitlessApiKey(localStorage.getItem("limitless_api_key") || "");
      }
      if (showTogglKey) {
        setTogglSessionToken(localStorage.getItem("toggl_session_token") || "");
        setTogglApiKey(localStorage.getItem("toggl_api_key") || "");
      }
      setTodoistApiKey(localStorage.getItem("todoist_api_key") || "");
      setOpenaiApiKey(localStorage.getItem("openai_api_key") || "");
    }
  }, [showLimitlessKey, showTogglKey]);

  const handleThemeChange = (checked: boolean) => {
    const newTheme = checked ? "dark" : "light";
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme} mode`);
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

  const menuItems = [
    { id: "general" as const, label: "General", icon: LayoutGrid },
    { id: "api-keys" as const, label: "API Keys", icon: Key },
    { id: "danger-zone" as const, label: "Danger Zone", icon: AlertTriangle },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-[600px]">
          {/* Sidebar */}
          <div className="w-56 border-r bg-muted/30 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">Settings</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Manage your preferences
              </p>
            </div>
            <nav className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === item.id
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-8">
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

                    {/* Limitless API Key */}
                    {showLimitlessKey && (
                      <div className="space-y-3 p-4 rounded-lg border bg-card">
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

                    {/* Task Automation Keys - Grouped */}
                    <div className="space-y-4 p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Task Automation</h4>
                        <p className="text-xs text-muted-foreground">
                          Both keys required for automatic task extraction from transcripts
                        </p>
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
  );
}
