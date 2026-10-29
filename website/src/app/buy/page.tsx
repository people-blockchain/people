import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";
import { BuyPage } from "@/components/buy/BuyPage";
import { demoTrades, tradeDemoAllowed } from "@/lib/sale/buy-page";
import { resolveHubOpen } from "@/lib/sale/hub-open";
import buyEn from "@/lib/locales/surfaces/buy-en.json" with { type: "json" };
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${buyEn.meta.title} | PEOPLE Blockchain`,
  description: buyEn.meta.description,
  alternates: { canonical: "/buy" },
  openGraph: {
    title: buyEn.meta.title,
    description: buyEn.meta.description,
    type: "website",
    siteName: SITE_NAME,
    url: "/buy",
  },
};

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
