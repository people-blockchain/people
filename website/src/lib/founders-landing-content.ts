import type { Language } from "./preferences";
import landingAr from "./locales/surfaces/founders-landing-ar.json" with { type: "json" };
import landingDe from "./locales/surfaces/founders-landing-de.json" with { type: "json" };
import landingEn from "./locales/surfaces/founders-landing-en.json" with { type: "json" };
import landingEs from "./locales/surfaces/founders-landing-es.json" with { type: "json" };
import landingFr from "./locales/surfaces/founders-landing-fr.json" with { type: "json" };
import landingId from "./locales/surfaces/founders-landing-id.json" with { type: "json" };
import landingIt from "./locales/surfaces/founders-landing-it.json" with { type: "json" };
import landingPt from "./locales/surfaces/founders-landing-pt.json" with { type: "json" };
import landingRu from "./locales/surfaces/founders-landing-ru.json" with { type: "json" };
import landingTr from "./locales/surfaces/founders-landing-tr.json" with { type: "json" };
import landingVi from "./locales/surfaces/founders-landing-vi.json" with { type: "json" };
import landingZh from "./locales/surfaces/founders-landing-zh.json" with { type: "json" };

export type FoundersLandingCopy = typeof landingEn;

const foundersLanding: Record<Language, FoundersLandingCopy> = {
  en: landingEn,
  ru: landingRu,
  es: landingEs,
  pt: landingPt,
  fr: landingFr,
  de: landingDe,
  it: landingIt,
  tr: landingTr,
  vi: landingVi,
  id: landingId,
  zh: landingZh,
  ar: landingAr,
};

/** /founders public landing sections. */
export function foundersLandingCopy(lang: Language): FoundersLandingCopy {
  return foundersLanding[lang];
}