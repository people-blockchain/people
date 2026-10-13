import type { Metadata } from "next";
import { headers } from "next/headers";
import { languageFromAcceptLanguage } from "@/lib/locale-detect";
import { buildPageMetadata } from "@/lib/og-meta";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FoundersApp } from "@/components/founders/FoundersApp";

/** Same tags for /founders and /founders?ref=...; rendered on the server for link-preview crawlers. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = languageFromAcceptLanguage((await headers()).get("accept-language"));
  return buildPageMetadata("founders", lang);
}

export const dynamic = "force-dynamic";

export default function FoundersPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <FoundersApp />
      </main>
      <Footer />
    </div>
  );
}
