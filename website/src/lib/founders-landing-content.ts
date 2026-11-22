import type { Language } from "./preferences";
import landingEn from "./locales/surfaces/founders-landing-en.json" with { type: "json" };

export type FoundersLandingCopy = typeof landingEn;

/**
 * /founders public landing sections.
 * Every locale, including `ru`, is served in English so public PEOPLE pages
 * never render Russian (same rule as FOUNDING_COPY).
 */
export function foundersLandingCopy(lang: Language): FoundersLandingCopy {
  switch (lang) {
    case "en":
    case "es":
    case "pt":
    case "fr":
    case "de":
    case "it":
    case "tr":
    case "vi":
    case "id":
    case "zh":
    case "ar":
    case "ru":
      return landingEn;
  }
}
