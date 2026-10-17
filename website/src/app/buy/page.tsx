import type { Metadata } from "next";

import { SiteChrome } from "@/components/SiteChrome";
import { BuyPage } from "@/components/buy/BuyPage";
import buyEn from "@/lib/locales/surfaces/buy-en.json" with { type: "json" };
import { SITE_NAME } from "@/lib/site";

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

export default function Page() {
  return (
    <SiteChrome>
      <BuyPage />
    </SiteChrome>
  );
}
