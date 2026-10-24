"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getLanguageSnapshot,
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

export function LanguageProvider({
  children,
  initialLang = "en",
}: {
  children: React.ReactNode;
  /** Language resolved from the request (cookie, then Accept-Language) by the root layout. */
  initialLang?: Language;
}) {
  // The server snapshot also drives the hydration render, so SSR markup and the
  // first client render agree; the stored preference is applied right after.
  const serverSnapshot = useCallback(() => initialLang, [initialLang]);
  const lang = useSyncExternalStore(subscribePreferences, getLanguageSnapshot, serverSnapshot);
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
