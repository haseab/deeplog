"use client";

import { useEffect } from "react";

export default function ReactScan() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("react-scan").then((ReactScan) => {
        ReactScan.scan({
          enabled: true,
          log: false,
          showToolbar: true,
          animationSpeed: "fast",
          trackUnnecessaryRenders: true,
        });
      });
    }
  }, []);

  return null;
}
