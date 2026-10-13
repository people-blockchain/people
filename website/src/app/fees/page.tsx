import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FeesPricing } from "@/components/fees/FeesPricing";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fees & pricing | People's Blockchain",
  description:
    "What actions on People's Blockchain cost: transfers, creating a token, minting an NFT and running a contract. All fees are paid in PPL.",
  alternates: { canonical: "/fees" },
  openGraph: {
    title: "Fees and pricing",
    description: "What actions on People's Blockchain cost. All fees are paid in PPL.",
    type: "website",
    siteName: SITE_NAME,
    url: "/fees",
  },
};

export default function FeesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <FeesPricing />
      </main>
      <Footer />
    </div>
  );
}
