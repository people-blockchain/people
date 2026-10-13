"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getLanguageSnapshot,
  getServerLanguageSnapshot,
  setLanguagePreference,
  subscribePreferences,
  type Language,
} from "@/lib/preferences";

export type { Language };

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(
    subscribePreferences,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  );
  const router = useRouter();

  const setLang = useCallback(
    (next: Language) => {
      setLanguagePreference(next);
      // Pages that SSR locale-specific content (e.g. /litepaper) read the
      // cookie set above; re-request the current route so they pick it up.
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
