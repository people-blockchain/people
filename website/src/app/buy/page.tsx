import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { SiteChrome } from "@/components/SiteChrome";
import { BuyPage } from "@/components/buy/BuyPage";
import { buyCopy } from "@/lib/buy-content";
import { languageFromRequest } from "@/lib/locale-detect";
import { languageCookieFromStore } from "@/lib/preferences";
import { SITE_NAME } from "@/lib/site";

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

export default function Page() {
  return (
    <SiteChrome>
      <BuyPage />
    </SiteChrome>
  );
}
