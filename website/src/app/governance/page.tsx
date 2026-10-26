import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GovernanceApp } from "@/components/governance/GovernanceApp";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Governance | PEOPLE Blockchain",
  description:
    "Browse on-chain governance proposals on PEOPLE Blockchain testnet and vote with your PEOPLE Wallet.",
  alternates: { canonical: "/governance" },
  openGraph: {
    title: "Governance",
    description: "See live proposals, tallies and cast your vote on PEOPLE Blockchain testnet.",
    type: "website",
    siteName: SITE_NAME,
    url: "/governance",
  },
};

export default function GovernancePage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <GovernanceApp />
      </main>
      <Footer />
    </div>
  );
}
