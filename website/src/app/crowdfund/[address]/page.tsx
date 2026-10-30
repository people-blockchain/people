import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAddress } from "viem";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { CrowdfundCampaign } from "@/components/crowdfund/CrowdfundCampaign";
import { SITE_NAME } from "@/lib/site";

type Params = Promise<{ address: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: "Crowdfund campaign | PEOPLE Blockchain",
    description: "Contribute to a crowdfund campaign, claim the funds when the goal is reached, or take a refund when it is not.",
    alternates: { canonical: `/crowdfund/${address}` },
    openGraph: { title: "Crowdfund campaign", type: "website", siteName: SITE_NAME, url: `/crowdfund/${address}` },
  };
}

export default async function CrowdfundCampaignPage({ params }: { params: Params }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <CrowdfundCampaign address={address} />
      </main>
      <Footer />
    </div>
  );
}
