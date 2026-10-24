import type { Language } from "./preferences";
import legalEn from "./locales/surfaces/legal-en.json" with { type: "json" };
import legalRu from "./locales/surfaces/legal-ru.json" with { type: "json" };
import legalEs from "./locales/surfaces/legal-es.json" with { type: "json" };
import legalPt from "./locales/surfaces/legal-pt.json" with { type: "json" };
import legalFr from "./locales/surfaces/legal-fr.json" with { type: "json" };
import legalDe from "./locales/surfaces/legal-de.json" with { type: "json" };
import legalIt from "./locales/surfaces/legal-it.json" with { type: "json" };
import legalTr from "./locales/surfaces/legal-tr.json" with { type: "json" };
import legalVi from "./locales/surfaces/legal-vi.json" with { type: "json" };
import legalId from "./locales/surfaces/legal-id.json" with { type: "json" };
import legalZh from "./locales/surfaces/legal-zh.json" with { type: "json" };
import legalAr from "./locales/surfaces/legal-ar.json" with { type: "json" };

export type LegalBlock = { title: string; body: string[] };

export type LegalPageContent = {
  title: string;
  subtitle?: string;
  effectiveLabel: string;
  effectiveDate: string;
  backHome: string;
  relatedTerms: string;
  relatedPrivacy: string;
  contactTitle: string;
  contactBody: string;
  /** Shown on non-English pages: the English text is the binding one. */
  englishPrevails?: string;
  blocks: LegalBlock[];
};

export type LegalBundle = {
  privacy: LegalPageContent;
  terms: LegalPageContent;
};

const byLanguage: Record<Language, LegalBundle> = {
  en: legalEn as LegalBundle,
  ru: legalRu as LegalBundle,
  es: legalEs as LegalBundle,
  pt: legalPt as LegalBundle,
  fr: legalFr as LegalBundle,
  de: legalDe as LegalBundle,
  it: legalIt as LegalBundle,
  tr: legalTr as LegalBundle,
  vi: legalVi as LegalBundle,
  id: legalId as LegalBundle,
  zh: legalZh as LegalBundle,
  ar: legalAr as LegalBundle,
};

export const legalBundle: LegalBundle = byLanguage.en;

export const legalCopy: Record<Language, LegalBundle> = byLanguage;
