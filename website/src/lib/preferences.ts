/**
 * Client preference store (language + colour theme) built on
 * `useSyncExternalStore`.
 *
 * Why not `useState(() => localStorage.getItem(...))`:
 * that pattern makes the client's first render disagree with the server HTML,
 * which React 19 reports as a hydration failure and then regenerates the whole
 * tree client-side. Using an external store with a server snapshot keeps
 * hydration deterministic — the initial render always matches the server, and
 * the stored preference is applied immediately afterwards.
 */

import { detectLanguage, languageFromCookie } from "./locale-detect";
import { migrateWebsiteStorage } from "./storage-migration";

export type Language =
  | "en"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "tr"
  | "vi"
  | "id"
  | "zh"
  | "ar"
  | "ru";

export type Theme = "dark" | "light";

const LANG_KEY = "people_lang";
const THEME_KEY = "people_theme";

/** Mirrors `LANG_KEY` into a cookie so the server can pick the same locale for SSR markdown. */
export const LANG_COOKIE = "people_lang";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Mirrors `THEME_KEY` into a cookie so the *server* can render the right
 * `class`/`data-theme` on `<html>` before any script runs. Without this the
 * document always shipped as `dark`, so a light-theme visitor saw a dark first
 * paint that flipped once React hydrated — the "theme randomly switches on
 * page load" report.
 */
export const THEME_COOKIE = "people_theme";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Legacy cookie names (server reads fall back; client expires on write). */
const LEGACY_LANG_COOKIE = "ovn_lang";
const LEGACY_THEME_COOKIE = "ovn_theme";

/** Every value the resolver treats as an explicit user choice. */
export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

/**
 * Single source of truth for which theme to apply. Order:
 *   1. the saved choice (localStorage on the client, cookie on the server);
 *   2. the OS `prefers-color-scheme` (only when nothing has ever been saved).
 *
 * `layout.tsx` mirrors this exact order inside its inline boot script — keep the
 * two in sync when changing the fallback behaviour.
 */
export function resolveThemePreference(
  stored: unknown,
  cookieValue: unknown,
  prefersDark: boolean,
): Theme {
  if (isTheme(stored)) return stored;
  if (isTheme(cookieValue)) return cookieValue;
  return prefersDark ? "dark" : "light";
}

/** Server-side read of the theme cookie (the only signal available during SSR). */
export function themeFromCookieValue(cookieValue: string | undefined): Theme {
  return resolveThemePreference(undefined, cookieValue, true);
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function readCookieWithLegacy(primary: string, legacy: string): string | null {
  return readCookie(primary) ?? readCookie(legacy);
}

function expireLegacyCookie(name: string): void {
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* cookies unavailable */
  }
}

function ensureClientStorageMigrated(): void {
  if (typeof localStorage === "undefined") return;
  migrateWebsiteStorage(localStorage);
}

/** SSR: prefer new cookie, fall back to legacy name once. */
export function languageCookieFromStore(
  cookieStore: { get(name: string): { value?: string } | undefined },
): string | undefined {
  return cookieStore.get(LANG_COOKIE)?.value ?? cookieStore.get(LEGACY_LANG_COOKIE)?.value;
}

export function themeCookieFromStore(
  cookieStore: { get(name: string): { value?: string } | undefined },
): string | undefined {
  return cookieStore.get(THEME_COOKIE)?.value ?? cookieStore.get(LEGACY_THEME_COOKIE)?.value;
}

const VALID_LANGS = new Set<Language>([
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "tr",
  "vi",
  "id",
  "zh",
  "ar",
  "ru",
]);

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LANG_KEY || event.key === THEME_KEY) {
      langCache = null;
      themeCache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);

  // When nothing has been saved yet the theme follows the OS, so keep following
  // it while the tab is open (a saved choice always wins — see
  // `resolveThemePreference`).
  const media = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  const onSystemThemeChange = () => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      /* storage unavailable */
    }
    if (isTheme(saved)) return;
    themeCache = null;
    listener();
  };
  media?.addEventListener("change", onSystemThemeChange);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onSystemThemeChange);
  };
}

function browserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  return detectLanguage(list) ?? "en";
}

let langCache: Language | null = null;
let themeCache: Theme | null = null;

export function getLanguageSnapshot(): Language {
  if (langCache === null) {
    let stored: Language | null = null;
    let fromCookie: Language | null = null;
    try {
      ensureClientStorageMigrated();
      const value = localStorage.getItem(LANG_KEY) as Language;
      stored = value && VALID_LANGS.has(value) ? value : null;
    } catch {
      /* storage unavailable — fall through to the cookie */
    }
    try {
      fromCookie = languageFromCookie(readCookieWithLegacy(LANG_COOKIE, LEGACY_LANG_COOKIE));
    } catch {
      /* cookies unavailable — fall through to the browser language */
    }
    // The cookie is what the server rendered with: it is written together with
    // localStorage on every explicit choice and by the `/{locale}/buy` redirect,
    // so it wins. Then the stored choice, then the browser language.
    langCache = fromCookie ?? stored ?? browserLanguage();
  }
  return langCache;
}

export function getThemeSnapshot(): Theme {
  if (themeCache === null) {
    try {
      ensureClientStorageMigrated();
      themeCache = resolveThemePreference(
        localStorage.getItem(THEME_KEY),
        readCookieWithLegacy(THEME_COOKIE, LEGACY_THEME_COOKIE),
        systemPrefersDark(),
      );
    } catch {
      themeCache = systemPrefersDark() ? "dark" : "light";
    }
  }
  return themeCache;
}


export function subscribePreferences(listener: () => void) {
  return subscribe(listener);
}

export function setLanguagePreference(value: Language) {
  langCache = value;
  try {
    localStorage.setItem(LANG_KEY, value);
  } catch {
    /* storage unavailable — preference applies for this session only */
  }
  try {
    document.cookie = `${LANG_COOKIE}=${value}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
    expireLegacyCookie(LEGACY_LANG_COOKIE);
  } catch {
    /* cookies unavailable — server will keep following Accept-Language */
  }
  emit();
}

export function applyThemeToDocument(value: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(value);
  root.setAttribute("data-theme", value);
}

export function setThemePreference(value: Theme) {
  themeCache = value;
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* storage unavailable — preference applies for this session only */
  }
  try {
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
    expireLegacyCookie(LEGACY_THEME_COOKIE);
  } catch {
    /* cookies unavailable — the server keeps rendering its default theme */
  }
  applyThemeToDocument(value);
  emit();
}
