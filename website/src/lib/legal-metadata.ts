import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { languageFromRequest } from "./locale-detect";
import { languageCookieFromStore } from "./preferences";
import { legalCopy } from "./legal-content";
import { SITE_NAME } from "./site";

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

/**
 * Localized metadata for /terms and /privacy. The site has no locale-prefixed routes, so the
 * language comes from the stored preference cookie (then Accept-Language), like /litepaper.
 */
export async function buildLegalMetadata(kind: "privacy" | "terms"): Promise<Metadata> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const lang = languageFromRequest(
    languageCookieFromStore(cookieStore),
    headerStore.get("accept-language"),
  );
  const doc = legalCopy[lang][kind];
  const path = `/${kind}`;
  const en = EN_METADATA[kind];
  const localized = lang !== "en";
  return {
    title: localized ? `${doc.title} | PEOPLE Blockchain` : en.title,
    description: localized ? doc.subtitle : en.description,
    alternates: { canonical: path },
    openGraph: {
      title: localized ? doc.title : en.ogTitle,
      description: localized ? doc.subtitle : en.ogDescription,
      type: "website",
      siteName: SITE_NAME,
      url: path,
    },
  };
}
