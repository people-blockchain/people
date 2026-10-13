import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy | People's Blockchain",
  description:
    "How the People's Blockchain website collects and uses information for partner sign-in, referrals, and non-custodial wallets.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy",
    description: "Privacy practices for www.peopleblockchain.network.",
    type: "website",
    siteName: SITE_NAME,
    url: "/privacy",
  },
};

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
