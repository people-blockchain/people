import type { Language } from "./preferences";
import referralAr from "./locales/surfaces/founders-referral-ar.json" with { type: "json" };
import referralDe from "./locales/surfaces/founders-referral-de.json" with { type: "json" };
import referralEn from "./locales/surfaces/founders-referral-en.json" with { type: "json" };
import referralEs from "./locales/surfaces/founders-referral-es.json" with { type: "json" };
import referralFr from "./locales/surfaces/founders-referral-fr.json" with { type: "json" };
import referralId from "./locales/surfaces/founders-referral-id.json" with { type: "json" };
import referralIt from "./locales/surfaces/founders-referral-it.json" with { type: "json" };
import referralPt from "./locales/surfaces/founders-referral-pt.json" with { type: "json" };
import referralRu from "./locales/surfaces/founders-referral-ru.json" with { type: "json" };
import referralTr from "./locales/surfaces/founders-referral-tr.json" with { type: "json" };
import referralVi from "./locales/surfaces/founders-referral-vi.json" with { type: "json" };
import referralZh from "./locales/surfaces/founders-referral-zh.json" with { type: "json" };

export type FoundersReferralCopy = typeof referralEn;

const foundersReferral: Record<Language, FoundersReferralCopy> = {
  en: referralEn,
  ru: referralRu,
  es: referralEs,
  pt: referralPt,
  fr: referralFr,
  de: referralDe,
  it: referralIt,
  tr: referralTr,
  vi: referralVi,
  id: referralId,
  zh: referralZh,
  ar: referralAr,
};

/** /founders referral copy. */
export function foundersReferralCopy(lang: Language): FoundersReferralCopy {
  return foundersReferral[lang];
}