import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { languageFromRequest } from "./locale-detect";
import { languageCookieFromStore } from "./preferences";
import { legalMetadataFields } from "./legal-metadata-fields";
import { SITE_NAME } from "./site";

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
  const fields = legalMetadataFields(lang, kind);
  const path = `/${kind}`;
  return {
    title: fields.title,
    description: fields.description,
    alternates: { canonical: path },
    openGraph: {
      title: fields.ogTitle,
      description: fields.ogDescription,
      type: "website",
      siteName: SITE_NAME,
      url: path,
    },
  };
}
