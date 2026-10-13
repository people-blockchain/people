/**
 * The founder's chosen country must survive a full-page navigation (the mobile Web3Auth
 * redirect leaves the page and comes back), so it is persisted to localStorage rather than
 * only component state. Pure helpers take storage as an argument so they are unit-testable
 * without a browser; the wrappers are the only part that touch `localStorage`.
 */

import { normalizeCountryCode } from "./config.ts";

export const COUNTRY_CHOICE_STORAGE_KEY = "ppl_founders_country_choice";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function readStoredCountryChoice(storage: ReadableStorage): string | null {
  try {
    const raw = storage.getItem(COUNTRY_CHOICE_STORAGE_KEY);
    return raw ? normalizeCountryCode(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredCountryChoice(storage: WritableStorage, code: string): void {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return;
  try {
    storage.setItem(COUNTRY_CHOICE_STORAGE_KEY, normalized);
  } catch {
    /* storage blocked (private mode / quota): the in-memory choice still works for this load */
  }
}

/** The value to preselect: an earlier explicit choice wins over a fresh browser guess. */
export function resolveInitialCountryChoice(
  storage: ReadableStorage | null,
  detectBrowserCountry: () => string,
): string {
  const stored = storage ? readStoredCountryChoice(storage) : null;
  return stored ?? detectBrowserCountry();
}

function browserLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

/** Browser-side wrapper. Safe to call during SSR (no-op). */
export function persistCountryChoice(code: string): void {
  const store = browserLocalStorage();
  if (store) writeStoredCountryChoice(store, code);
}

/** Browser-side wrapper. Safe to call during SSR (returns null). */
export function readPersistedCountryChoice(): string | null {
  const store = browserLocalStorage();
  return store ? readStoredCountryChoice(store) : null;
}
