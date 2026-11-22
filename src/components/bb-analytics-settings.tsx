"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function BbAnalyticsSettings() {
  const [origin, setOrigin] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    try {
      setOrigin(localStorage.getItem("deeplog_bb_origin") || "");
    } catch {}
  }, []);
  return (
    <div className="space-y-3 p-4 rounded-lg border bg-card">
      <label htmlFor="bb-analytics-origin" className="text-base font-medium">
        BB analytics
      </label>
      <p className="text-sm text-muted-foreground">
        Your BB web address. Ctrl + Shift + Option + P opens messages and thread activity for the
        selected time entry. Saved only in this browser.
      </p>
      <div className="flex gap-2">
        <Input
          id="bb-analytics-origin"
          type="url"
          placeholder="https://bb.example.com"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        />
        <Button
          variant="outline"
          onClick={() => {
            try {
              if (origin.trim()) {
                const url = new URL(origin.trim());
                if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
                  throw new Error();
                localStorage.setItem("deeplog_bb_origin", url.origin);
                setOrigin(url.origin);
              } else localStorage.removeItem("deeplog_bb_origin");
              setMessage("Saved.");
            } catch {
              setMessage("Enter a valid HTTP or HTTPS BB web address.");
            }
          }}
        >
          Save
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
