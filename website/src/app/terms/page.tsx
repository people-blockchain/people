import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service | People's Blockchain",
  description:
    "Terms for using the People's Blockchain website and partner tools on the public test network.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service",
    description: "Terms of service for www.peopleblockchain.network.",
    type: "website",
    siteName: SITE_NAME,
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <LegalDocument kind="terms" />
      </main>
      <Footer />
    </div>
  );
}
