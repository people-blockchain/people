import type { Metadata } from "next";
import { headers } from "next/headers";
import { languageFromAcceptLanguage } from "@/lib/locale-detect";
import { buildPageMetadata } from "@/lib/og-meta";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { TransparencyPage } from "@/components/transparency/TransparencyPage";

/** Title/description follow the visitor's Accept-Language so link previews are localized too. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = languageFromAcceptLanguage((await headers()).get("accept-language"));
  return buildPageMetadata("transparency", lang);
}

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <TransparencyPage />
      </main>
      <Footer />
    </div>
  );
}
