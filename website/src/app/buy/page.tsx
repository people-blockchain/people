import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { SiteChrome } from "@/components/SiteChrome";
import { BuyPage } from "@/components/buy/BuyPage";
import { buyCopy } from "@/lib/buy-content";
import { languageFromRequest } from "@/lib/locale-detect";
import { languageCookieFromStore } from "@/lib/preferences";
import { demoTrades, tradeDemoAllowed } from "@/lib/sale/buy-page";
import { resolveHubOpen } from "@/lib/sale/hub-open";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const lang = languageFromRequest(
    languageCookieFromStore(cookieStore),
    headerStore.get("accept-language"),
  );
  const { meta } = buyCopy[lang];
  return {
    title: `${meta.title} | PEOPLE Blockchain`,
    description: meta.description,
    alternates: { canonical: "/buy" },
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
      siteName: SITE_NAME,
      url: "/buy",
    },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [initialOpen, params] = await Promise.all([resolveHubOpen(), searchParams]);
  // Example trades exist only in this server response, and only on a
  // non-production deployment opened with `?demo=1`. Production never builds them.
  const exampleTrades = tradeDemoAllowed(process.env, params.demo) ? demoTrades() : null;
  return (
    <SiteChrome>
      <BuyPage initialSaleOpen={initialOpen} exampleTrades={exampleTrades} />
    </SiteChrome>
  );
}
