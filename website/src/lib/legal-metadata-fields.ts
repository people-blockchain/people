import type { Language } from "./preferences";
import { legalCopy } from "./legal-content";

/** Original English metadata, kept verbatim for the `en` locale. */
const EN_METADATA = {
  terms: {
    title: "Terms of Service | PEOPLE Blockchain",
    description:
      "Terms for using the PEOPLE Blockchain website and partner tools on the public test network.",
    ogTitle: "Terms of Service",
    ogDescription: "Terms of service for www.peopleblockchain.network.",
  },
  privacy: {
    title: "Privacy Policy | PEOPLE Blockchain",
    description:
      "How the PEOPLE Blockchain website collects and uses information for partner sign-in, referrals, and non-custodial wallets.",
    ogTitle: "Privacy Policy",
    ogDescription: "Privacy practices for www.peopleblockchain.network.",
  },
} as const;

/** Plain-string metadata for one legal page in one language (English stays verbatim). */
export function legalMetadataFields(lang: Language, kind: "privacy" | "terms") {
  const doc = legalCopy[lang][kind];
  const en = EN_METADATA[kind];
  if (lang === "en") return { ...en };
  return {
    title: `${doc.title} | PEOPLE Blockchain`,
    description: doc.subtitle ?? "",
    ogTitle: doc.title,
    ogDescription: doc.subtitle ?? "",
  };
}
