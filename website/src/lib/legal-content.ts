import legalEn from "./locales/surfaces/legal-en.json" with { type: "json" };

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
  blocks: LegalBlock[];
};

export type LegalBundle = {
  privacy: LegalPageContent;
  terms: LegalPageContent;
};

/** Policy body is English-only for every locale; UI chrome on other pages uses localized short strings. */
export const legalBundle: LegalBundle = legalEn as LegalBundle;
