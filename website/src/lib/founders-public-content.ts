import type { Language } from "./preferences";
import foundersAr from "./locales/surfaces/founders-ar.json" with { type: "json" };
import foundersDe from "./locales/surfaces/founders-de.json" with { type: "json" };
import foundersEn from "./locales/surfaces/founders-en.json" with { type: "json" };
import foundersEs from "./locales/surfaces/founders-es.json" with { type: "json" };
import foundersFr from "./locales/surfaces/founders-fr.json" with { type: "json" };
import foundersId from "./locales/surfaces/founders-id.json" with { type: "json" };
import foundersIt from "./locales/surfaces/founders-it.json" with { type: "json" };
import foundersPt from "./locales/surfaces/founders-pt.json" with { type: "json" };
import foundersRu from "./locales/surfaces/founders-ru.json" with { type: "json" };
import foundersTr from "./locales/surfaces/founders-tr.json" with { type: "json" };
import foundersVi from "./locales/surfaces/founders-vi.json" with { type: "json" };
import foundersZh from "./locales/surfaces/founders-zh.json" with { type: "json" };

export type FoundersPublicCopy = typeof foundersEn;

export const foundersPublic: Record<Language, FoundersPublicCopy> = {
  en: foundersEn,
  ru: foundersRu,
  es: foundersEs,
  pt: foundersPt,
  fr: foundersFr,
  de: foundersDe,
  it: foundersIt,
  tr: foundersTr,
  vi: foundersVi,
  id: foundersId,
  zh: foundersZh,
  ar: foundersAr,
};
