import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { buildLegalMetadata } from "@/lib/legal-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildLegalMetadata("privacy");
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <LegalDocument kind="privacy" />
      </main>
      <Footer />
    </div>
  );
}
