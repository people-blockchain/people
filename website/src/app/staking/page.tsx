import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { StakingApp } from "@/components/staking/StakingApp";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Staking | People's Blockchain",
  description:
    "Delegate test PPL to a validator on People's Blockchain testnet, earn a share of rewards, and help secure the network.",
  alternates: { canonical: "/staking" },
  openGraph: {
    title: "Stake PPL",
    description: "Delegate, undelegate, redelegate and claim staking rewards on the testnet.",
    type: "website",
    siteName: SITE_NAME,
    url: "/staking",
  },
};

export default function StakingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <StakingApp />
      </main>
      <Footer />
    </div>
  );
}
