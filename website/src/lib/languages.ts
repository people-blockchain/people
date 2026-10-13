/**
 * Language catalogue for the public site.
 *
 * `Language` (defined in `lib/preferences`) is the set of locales that have a
 * complete translation in `lib/content`. Every entry here must therefore have a
 * matching `content[code]` block before it can be offered to visitors —
 * `AVAILABLE_LANGUAGE_CODES` is the single place to change when a new
 * translation lands.
 *
 * `CATALOGUE` intentionally contains only shipped locales. Adding a locale is a
 * three-step change:
 *   1. add the id to `Language` in `lib/preferences.ts`;
 *   2. add the `content[code]` translation block in `lib/content.ts`;
 *   3. append the entry below (and to `AVAILABLE_LANGUAGE_CODES`).
 *
 * The UI scales to dozens of locales without layout changes: the desktop
 * switcher is a dropdown, the mobile sheet renders a scrollable list.
 */

export interface LanguageOption {
  /** BCP-47-ish short code used in storage and `document.documentElement.lang`. */
  code: string;
  /** Short form shown in the trigger, e.g. "EN". */
  short: string;
  /** The language's own name, shown in lists (endonym, never translated). */
  endonym: string;
  /** English name, used as a secondary/accessible hint. */
  english: string;
}

export const CATALOGUE: readonly LanguageOption[] = [
  { code: "en", short: "EN", endonym: "English", english: "English" },
  { code: "es", short: "ES", endonym: "Español", english: "Spanish" },
  { code: "pt", short: "PT", endonym: "Português (Brasil)", english: "Portuguese (BR)" },
  { code: "fr", short: "FR", endonym: "Français", english: "French" },
  { code: "de", short: "DE", endonym: "Deutsch", english: "German" },
  { code: "it", short: "IT", endonym: "Italiano", english: "Italian" },
  { code: "tr", short: "TR", endonym: "Türkçe", english: "Turkish" },
  { code: "vi", short: "VI", endonym: "Tiếng Việt", english: "Vietnamese" },
  { code: "id", short: "ID", endonym: "Bahasa Indonesia", english: "Indonesian" },
  { code: "zh", short: "ZH", endonym: "简体中文", english: "Chinese" },
  { code: "ar", short: "AR", endonym: "العربية", english: "Arabic" },
  { code: "ru", short: "RU", endonym: "Русский", english: "Russian" },
] as const;

/** Locales that currently have a full translation in `lib/content`. */
export const AVAILABLE_LANGUAGE_CODES = CATALOGUE.map((option) => option.code);

export function getLanguageOption(code: string): LanguageOption | undefined {
  return CATALOGUE.find((option) => option.code === code);
}
