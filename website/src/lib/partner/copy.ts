import type { Language } from "@/lib/preferences";
import partnerAr from "@/lib/locales/surfaces/partner-ar.json" with { type: "json" };
import partnerDe from "@/lib/locales/surfaces/partner-de.json" with { type: "json" };
import partnerEn from "@/lib/locales/surfaces/partner-en.json" with { type: "json" };
import partnerEs from "@/lib/locales/surfaces/partner-es.json" with { type: "json" };
import partnerFr from "@/lib/locales/surfaces/partner-fr.json" with { type: "json" };
import partnerId from "@/lib/locales/surfaces/partner-id.json" with { type: "json" };
import partnerIt from "@/lib/locales/surfaces/partner-it.json" with { type: "json" };
import partnerPt from "@/lib/locales/surfaces/partner-pt.json" with { type: "json" };
import partnerRu from "@/lib/locales/surfaces/partner-ru.json" with { type: "json" };
import partnerTr from "@/lib/locales/surfaces/partner-tr.json" with { type: "json" };
import partnerVi from "@/lib/locales/surfaces/partner-vi.json" with { type: "json" };
import partnerZh from "@/lib/locales/surfaces/partner-zh.json" with { type: "json" };

export type PartnerStrings = typeof partnerEn;

export const partnerCopy: Record<Language, PartnerStrings> = {
  en: partnerEn,
  es: partnerEs,
  pt: partnerPt,
  fr: partnerFr,
  de: partnerDe,
  it: partnerIt,
  tr: partnerTr,
  vi: partnerVi,
  id: partnerId,
  zh: partnerZh,
  ar: partnerAr,
  ru: partnerRu,
};

export function partnerText(lang: Language): PartnerStrings {
  return partnerCopy[lang];
}
