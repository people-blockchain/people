import type { Language } from "./preferences";
import homeAr from "./locales/surfaces/home-ar.json" with { type: "json" };
import homeDe from "./locales/surfaces/home-de.json" with { type: "json" };
import homeEn from "./locales/surfaces/home-en.json" with { type: "json" };
import homeEs from "./locales/surfaces/home-es.json" with { type: "json" };
import homeFr from "./locales/surfaces/home-fr.json" with { type: "json" };
import homeId from "./locales/surfaces/home-id.json" with { type: "json" };
import homeIt from "./locales/surfaces/home-it.json" with { type: "json" };
import homePt from "./locales/surfaces/home-pt.json" with { type: "json" };
import homeRu from "./locales/surfaces/home-ru.json" with { type: "json" };
import homeTr from "./locales/surfaces/home-tr.json" with { type: "json" };
import homeVi from "./locales/surfaces/home-vi.json" with { type: "json" };
import homeZh from "./locales/surfaces/home-zh.json" with { type: "json" };

export type HomePublicCopy = typeof homeEn;

export const homePublic: Record<Language, HomePublicCopy> = {
  en: homeEn,
  ru: homeRu,
  es: homeEs,
  pt: homePt,
  fr: homeFr,
  de: homeDe,
  it: homeIt,
  tr: homeTr,
  vi: homeVi,
  id: homeId,
  zh: homeZh,
  ar: homeAr,
};
