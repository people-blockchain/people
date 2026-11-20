import type { Language } from "./preferences";
import referralEn from "./locales/surfaces/founders-referral-en.json" with { type: "json" };

export type FoundersReferralCopy = typeof referralEn;

/**
 * /founders referral copy. Every locale, including `ru`, is served in English
 * so public PEOPLE pages never render Russian. `founders-referral-ru.json`
 * stays on disk for locale surface fixtures.
 */
export function foundersReferralCopy(lang: Language): FoundersReferralCopy {
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
      return referralEn;
  }
}
