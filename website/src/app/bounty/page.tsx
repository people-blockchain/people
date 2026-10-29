import type { Metadata } from "next";
import { headers } from "next/headers";
import { languageFromAcceptLanguage } from "@/lib/locale-detect";
import { buildPageMetadata } from "@/lib/og-meta";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  BountyBounties,
  BountyCommunity,
  BountyCountdown,
  BountyEarn,
  BountyFinal,
  BountyHero,
  BountyReferral,
  BountyTasks,
  BountyTokenomics,
} from "@/components/bounty/BountyHub";

export async function generateMetadata(): Promise<Metadata> {
  const lang = languageFromAcceptLanguage((await headers()).get("accept-language"));
  return buildPageMetadata("bounty", lang);
}

export const dynamic = "force-dynamic";

export default function BountyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <BountyHero />
        <BountyCountdown />
        <BountyEarn />
        <BountyTasks />
        <BountyCommunity />
        <BountyReferral />
        <BountyBounties />
        <BountyTokenomics />
        <BountyFinal />
      </main>
      <Footer />
    </div>
  );
}
