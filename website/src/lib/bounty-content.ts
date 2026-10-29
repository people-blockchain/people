import type { Language } from "./preferences";
import bountyAr from "./locales/surfaces/bounty-ar.json" with { type: "json" };
import bountyDe from "./locales/surfaces/bounty-de.json" with { type: "json" };
import bountyEn from "./locales/surfaces/bounty-en.json" with { type: "json" };
import bountyEs from "./locales/surfaces/bounty-es.json" with { type: "json" };
import bountyFr from "./locales/surfaces/bounty-fr.json" with { type: "json" };
import bountyId from "./locales/surfaces/bounty-id.json" with { type: "json" };
import bountyIt from "./locales/surfaces/bounty-it.json" with { type: "json" };
import bountyPt from "./locales/surfaces/bounty-pt.json" with { type: "json" };
import bountyRu from "./locales/surfaces/bounty-ru.json" with { type: "json" };
import bountyTr from "./locales/surfaces/bounty-tr.json" with { type: "json" };
import bountyVi from "./locales/surfaces/bounty-vi.json" with { type: "json" };
import bountyZh from "./locales/surfaces/bounty-zh.json" with { type: "json" };

export type BountyCopy = typeof bountyEn;

const BY_LANG: Record<Language, BountyCopy> = {
  en: bountyEn,
  ru: bountyRu,
  es: bountyEs,
  pt: bountyPt,
  fr: bountyFr,
  de: bountyDe,
  it: bountyIt,
  tr: bountyTr,
  vi: bountyVi,
  id: bountyId,
  zh: bountyZh,
  ar: bountyAr,
};

export function bountyCopy(lang: Language): BountyCopy {
  return BY_LANG[lang] ?? bountyEn;
}
