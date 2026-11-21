import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { HelpCenter } from "@/components/help/HelpCenter";
import { JsonLd } from "@/components/seo/JsonLd";
import { languageFromRequest } from "@/lib/locale-detect";
import { languageCookieFromStore } from "@/lib/preferences";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  helpFaqPairs,
  jsonLdGraph,
} from "@/lib/seo/json-ld";

export const metadata: Metadata = {
  title: "Help | PEOPLE Blockchain",
  description:
    "Short answers to common questions about PPL, the wallet, staking, taking part and staying safe on PEOPLE Blockchain.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const lang = languageFromRequest(
    languageCookieFromStore(cookieStore),
    headerStore.get("accept-language"),
  );
  const faq = faqPageJsonLd(helpFaqPairs(lang));

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <JsonLd
        data={jsonLdGraph(
          faq,
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Help", path: "/help" },
          ]),
        )}
      />
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <HelpCenter />
      </main>
      <Footer />
    </div>
  );
}