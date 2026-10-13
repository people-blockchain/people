import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { HomeWarmHero } from "@/components/home/HomeWarmHero";
import { ExplainerVideoSection } from "@/components/ExplainerVideoSection";
import {
  HomeWarmBuild,
  HomeWarmCommunity,
  HomeWarmFair,
  HomeWarmAgents,
  HomeWarmNetwork,
  HomeWarmFinal,
} from "@/components/home/HomeWarmSections";
import { HomeWarmFoundersTeaser } from "@/components/home/HomeWarmFoundersTeaser";
import { Footer } from "@/components/Footer";
import { HomeJsonLd } from "@/components/home/HomeJsonLd";
import { headers } from "next/headers";
import { languageFromAcceptLanguage } from "@/lib/locale-detect";
import { buildPageMetadata } from "@/lib/og-meta";

/**
 * Server-rendered per request so crawlers (WhatsApp, Telegram, Facebook, Twitter) get complete
 * Open Graph tags in the first HTML. A page that declares `openGraph` replaces the layout's
 * object, so the full set (including image and url) is built here, localized from Accept-Language.
 */
export async function generateMetadata(): Promise<Metadata> {
  const lang = languageFromAcceptLanguage((await headers()).get("accept-language"));
  return buildPageMetadata("home", lang);
}

/**
 * Homepage in the /founders visual language: warm palette, sentence-case section
 * heads and cards. Every live figure comes from a real endpoint or is hidden.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <HomeJsonLd />
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <HomeWarmHero />
        <ExplainerVideoSection />
        {/* The 10% community share leads the page; agents sit after the live
            network strip, near the end. */}
        <HomeWarmCommunity />
        <HomeWarmBuild />
        <HomeWarmFair />
        <HomeWarmFoundersTeaser />
        <HomeWarmNetwork />
        <HomeWarmAgents />
        <HomeWarmFinal />
      </main>
      <Footer showNotInvestmentDisclaimer />
    </div>
  );
}
