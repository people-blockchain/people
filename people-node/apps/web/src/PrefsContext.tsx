import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LANGUAGE_KEY,
  THEME_KEY,
  detectInitialLanguage,
  detectInitialTheme,
  i18n,
  type Language,
  type Theme,
  type Translation
} from "./i18n.js";

interface PrefsContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: Translation;
}

const PrefsContext = createContext<PrefsContextValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(detectInitialLanguage);
  const [theme, setTheme] = useState<Theme>(detectInitialTheme);
  const t = i18n[language];

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, theme, setTheme, t }),
    [language, theme, t]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) {
    throw new Error("usePrefs must be used within PrefsProvider");
  }
  return ctx;
}
