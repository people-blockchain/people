import type { Language } from "./preferences";
import referralEn from "./locales/surfaces/founders-referral-en.json" with { type: "json" };
import referralRu from "./locales/surfaces/founders-referral-ru.json" with { type: "json" };

export type FoundersReferralCopy = typeof referralEn;

/** RU and EN are maintained; other languages fall back to English until translated. */
export function foundersReferralCopy(lang: Language): FoundersReferralCopy {
  return lang === "ru" ? referralRu : referralEn;
}
