import type { Language } from "./preferences";
import lavkaAr from "./locales/surfaces/lavka-ar.json" with { type: "json" };
import lavkaDe from "./locales/surfaces/lavka-de.json" with { type: "json" };
import lavkaEn from "./locales/surfaces/lavka-en.json" with { type: "json" };
import lavkaEs from "./locales/surfaces/lavka-es.json" with { type: "json" };
import lavkaFr from "./locales/surfaces/lavka-fr.json" with { type: "json" };
import lavkaId from "./locales/surfaces/lavka-id.json" with { type: "json" };
import lavkaIt from "./locales/surfaces/lavka-it.json" with { type: "json" };
import lavkaPt from "./locales/surfaces/lavka-pt.json" with { type: "json" };
import lavkaRu from "./locales/surfaces/lavka-ru.json" with { type: "json" };
import lavkaTr from "./locales/surfaces/lavka-tr.json" with { type: "json" };
import lavkaVi from "./locales/surfaces/lavka-vi.json" with { type: "json" };
import lavkaZh from "./locales/surfaces/lavka-zh.json" with { type: "json" };

export type LavkaPublicCopy = typeof lavkaEn;

export const lavkaPublic: Record<Language, LavkaPublicCopy> = {
  en: lavkaEn,
  ru: lavkaRu,
  es: lavkaEs,
  pt: lavkaPt,
  fr: lavkaFr,
  de: lavkaDe,
  it: lavkaIt,
  tr: lavkaTr,
  vi: lavkaVi,
  id: lavkaId,
  zh: lavkaZh,
  ar: lavkaAr,
};
