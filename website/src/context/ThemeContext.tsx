"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  applyThemeToDocument,
  getThemeSnapshot,
  setThemePreference,
  subscribePreferences,
  type Theme,
} from "@/lib/preferences";

export type { Theme };

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({
  children,
  initialTheme = "dark",
}: {
  children: React.ReactNode;
  /**
   * Theme the root layout actually rendered into `<html class>`, resolved from
   * the theme cookie during SSR. Hydration's first render must produce the same
   * markup as the server, so this is what the store reports until it is live.
   */
  initialTheme?: Theme;
}) {
  const serverSnapshot = useCallback(() => initialTheme, [initialTheme]);
  const theme = useSyncExternalStore(subscribePreferences, getThemeSnapshot, serverSnapshot);

  const applied = useRef<Theme | null>(null);

  // The boot script in the document head already applied the stored theme
  // before first paint, so the first effect run must not re-apply anything.
  useEffect(() => {
    if (applied.current === theme) return;
    const isFirstRun = applied.current === null;
    applied.current = theme;
    if (isFirstRun) return;
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemePreference(next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = getThemeSnapshot() === "dark" ? "light" : "dark";
    setThemePreference(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
