"use client";

import * as React from "react";
import {
  getDeviceTimeZone,
  isValidTimeZone,
  type TimeZoneMode,
} from "@/lib/timezone";

export const TIMEZONE_MODE_KEY = "deeplog_timezone_mode";
export const PROFILE_TIMEZONE_KEY = "toggl_profile_timezone";
export const CUSTOM_TIMEZONE_KEY = "deeplog_custom_timezone";
export const TIMEZONE_CHANGE_EVENT = "deeplog-timezone-change";

function readMode(): TimeZoneMode {
  if (typeof window === "undefined") return "device";
  const mode = localStorage.getItem(TIMEZONE_MODE_KEY);
  if (mode === "profile") return "profile";
  if (mode === "custom" && readCustomTimeZone()) return "custom";
  return "device";
}

function readProfileTimeZone(): string | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(PROFILE_TIMEZONE_KEY);
  return isValidTimeZone(value) ? value : null;
}

function readCustomTimeZone(): string | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(CUSTOM_TIMEZONE_KEY);
  return isValidTimeZone(value) ? value : null;
}

export function useTimezonePreference() {
  const [mode, setModeState] = React.useState<TimeZoneMode>(() => readMode());
  const [profileTimeZone, setProfileTimeZoneState] = React.useState<string | null>(() => readProfileTimeZone());
  const [customTimeZone, setCustomTimeZoneState] = React.useState<string | null>(() => readCustomTimeZone());
  const [deviceTimeZone, setDeviceTimeZone] = React.useState(() => getDeviceTimeZone());

  const refresh = React.useCallback(() => {
    setModeState(readMode());
    setProfileTimeZoneState(readProfileTimeZone());
    setCustomTimeZoneState(readCustomTimeZone());
    setDeviceTimeZone(getDeviceTimeZone());
  }, []);

  React.useEffect(() => {
    refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(TIMEZONE_CHANGE_EVENT, refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(TIMEZONE_CHANGE_EVENT, refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const setMode = React.useCallback((nextMode: TimeZoneMode) => {
    localStorage.setItem(TIMEZONE_MODE_KEY, nextMode);
    window.dispatchEvent(new Event(TIMEZONE_CHANGE_EVENT));
  }, []);

  const setProfileTimeZone = React.useCallback((nextTimeZone: string | null) => {
    const current = localStorage.getItem(PROFILE_TIMEZONE_KEY);
    if (nextTimeZone && isValidTimeZone(nextTimeZone)) {
      if (current === nextTimeZone) return;
      localStorage.setItem(PROFILE_TIMEZONE_KEY, nextTimeZone);
    } else {
      if (current === null) return;
      localStorage.removeItem(PROFILE_TIMEZONE_KEY);
    }
    window.dispatchEvent(new Event(TIMEZONE_CHANGE_EVENT));
  }, []);

  const setTimeZone = React.useCallback((nextTimeZone: string) => {
    if (!isValidTimeZone(nextTimeZone)) return;

    const currentDeviceTimeZone = getDeviceTimeZone();
    if (nextTimeZone === currentDeviceTimeZone) {
      localStorage.setItem(TIMEZONE_MODE_KEY, "device");
    } else {
      localStorage.setItem(CUSTOM_TIMEZONE_KEY, nextTimeZone);
      localStorage.setItem(TIMEZONE_MODE_KEY, "custom");
    }
    window.dispatchEvent(new Event(TIMEZONE_CHANGE_EVENT));
  }, []);

  const timeZone = mode === "profile" && profileTimeZone
    ? profileTimeZone
    : mode === "custom" && customTimeZone
      ? customTimeZone
      : deviceTimeZone;

  return {
    mode,
    timeZone,
    deviceTimeZone,
    profileTimeZone,
    customTimeZone,
    setMode,
    setTimeZone,
    setProfileTimeZone,
  };
}
