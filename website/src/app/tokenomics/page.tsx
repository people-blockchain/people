import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { TokenomicsPage } from "@/components/tokenomics/TokenomicsPage";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tokenomics | PEOPLE Blockchain",
  description:
    "Fixed 1B PPL supply, genesis allocation, community sale bonding curve, vesting schedules and network fee split.",
  alternates: { canonical: "/tokenomics" },
  openGraph: {
    title: "PPL tokenomics",
    description: "Genesis allocation, sale curve and circulating supply plan for PEOPLE Blockchain.",
    type: "website",
    siteName: SITE_NAME,
    url: "/tokenomics",
  },
};

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <TokenomicsPage />
      </main>
      <Footer />
    </div>
  );
}
