"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/app-store";

const STORAGE_KEY = "nebula-mail-theme";

/** Applies the store's darkMode flag to <html data-theme> and persists the user's choice. */
export function ThemeSync() {
  const darkMode = useAppStore((s) => s.darkMode);
  const toggleDarkMode = useAppStore((s) => s.toggleDarkMode);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" && !useAppStore.getState().darkMode) toggleDarkMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  return null;
}
