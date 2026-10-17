"use client";
import { useEffect } from "react";
import { installShortcutBindings } from "@/lib/keyboard-shortcuts";
export function KeyboardShortcutProvider() {
  useEffect(installShortcutBindings, []);
  return null;
}
