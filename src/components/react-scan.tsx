"use client";

import { useEffect } from "react";

export default function ReactScan() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (async () => {
        try {
          const ReactScan = await import("react-scan");
          ReactScan.scan({
            enabled: true,
            log: false,
            showToolbar: true,
            animationSpeed: "fast",
            trackUnnecessaryRenders: true,
          });
        } catch (error) {
          console.error("Failed to load react-scan:", error);
        }
      })();
    }
  }, []);

  return null;
}
