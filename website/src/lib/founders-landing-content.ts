import type { Language } from "./preferences";
import landingEn from "./locales/surfaces/founders-landing-en.json" with { type: "json" };
import landingRu from "./locales/surfaces/founders-landing-ru.json" with { type: "json" };

export type FoundersLandingCopy = typeof landingEn;

/** /founders public landing sections. RU and EN are maintained; other languages fall back to English. */
export function foundersLandingCopy(lang: Language): FoundersLandingCopy {
  return lang === "ru" ? landingRu : landingEn;
}
