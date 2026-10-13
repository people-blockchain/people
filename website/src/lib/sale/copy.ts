import type { Language } from "@/lib/preferences";
import saleAr from "@/lib/locales/surfaces/sale-ar.json" with { type: "json" };
import saleDe from "@/lib/locales/surfaces/sale-de.json" with { type: "json" };
import saleEn from "@/lib/locales/surfaces/sale-en.json" with { type: "json" };
import saleEs from "@/lib/locales/surfaces/sale-es.json" with { type: "json" };
import saleFr from "@/lib/locales/surfaces/sale-fr.json" with { type: "json" };
import saleId from "@/lib/locales/surfaces/sale-id.json" with { type: "json" };
import saleIt from "@/lib/locales/surfaces/sale-it.json" with { type: "json" };
import salePt from "@/lib/locales/surfaces/sale-pt.json" with { type: "json" };
import saleRu from "@/lib/locales/surfaces/sale-ru.json" with { type: "json" };
import saleTr from "@/lib/locales/surfaces/sale-tr.json" with { type: "json" };
import saleVi from "@/lib/locales/surfaces/sale-vi.json" with { type: "json" };
import saleZh from "@/lib/locales/surfaces/sale-zh.json" with { type: "json" };

export type SaleCopy = typeof saleEn;

export const saleCopy: Record<Language, SaleCopy> = {
  en: saleEn,
  ru: saleRu,
  es: saleEs as SaleCopy,
  pt: salePt as SaleCopy,
  fr: saleFr as SaleCopy,
  de: saleDe as SaleCopy,
  it: saleIt as SaleCopy,
  tr: saleTr as SaleCopy,
  vi: saleVi as SaleCopy,
  id: saleId as SaleCopy,
  zh: saleZh as SaleCopy,
  ar: saleAr as SaleCopy,
};
