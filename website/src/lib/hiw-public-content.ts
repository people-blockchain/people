import type { Language } from "./preferences";
import hiwAr from "./locales/surfaces/hiw-ar.json" with { type: "json" };
import hiwDe from "./locales/surfaces/hiw-de.json" with { type: "json" };
import hiwEn from "./locales/surfaces/hiw-en.json" with { type: "json" };
import hiwEs from "./locales/surfaces/hiw-es.json" with { type: "json" };
import hiwFr from "./locales/surfaces/hiw-fr.json" with { type: "json" };
import hiwId from "./locales/surfaces/hiw-id.json" with { type: "json" };
import hiwIt from "./locales/surfaces/hiw-it.json" with { type: "json" };
import hiwPt from "./locales/surfaces/hiw-pt.json" with { type: "json" };
import hiwRu from "./locales/surfaces/hiw-ru.json" with { type: "json" };
import hiwTr from "./locales/surfaces/hiw-tr.json" with { type: "json" };
import hiwVi from "./locales/surfaces/hiw-vi.json" with { type: "json" };
import hiwZh from "./locales/surfaces/hiw-zh.json" with { type: "json" };

export type HiwPublicCopy = typeof hiwEn;

export const hiwPublic: Record<Language, HiwPublicCopy> = {
  en: hiwEn,
  ru: hiwRu,
  es: hiwEs,
  pt: hiwPt,
  fr: hiwFr,
  de: hiwDe,
  it: hiwIt,
  tr: hiwTr,
  vi: hiwVi,
  id: hiwId,
  zh: hiwZh,
  ar: hiwAr,
};
