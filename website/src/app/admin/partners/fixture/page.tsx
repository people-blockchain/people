import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnersAdminPanel } from "@/components/admin/PartnersAdminPanel";
import type { PartnersAdminOverview } from "@/lib/partner/admin-overview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partners fixture | Admin",
  robots: { index: false, follow: false },
};

const DEMO: PartnersAdminOverview = {
  summary: {
    totalPartners: 2,
    totalClicks: 5,
    totalSignUps: 2,
    totalVolumeUsdMicro: "2500000000",
    totalApprovedUsdcMicro: "150000000",
    totalApprovedPplMicro: "50000000",
  },
  partners: [
    {
      userId: "demo-partner-1",
      email: "kol1@example.com",
      name: "KOL One",
      referralCode: "abc123",
      kolCode: "kolone",
      createdAt: "2026-01-01T00:00:00.000Z",
      tierUsdcBps: 700,
      tierLabel: "Tier 1 · 7% USDC + 3% PPL",
      clicks: 3,
      l1Count: 1,
      l2Count: 0,
      volumeUsd: "$1,000.00",
      volumeUsdMicro: "1000000000",
      usdcPendingMicro: "0",
      usdcApprovedMicro: "100000000",
      usdcPaidMicro: "0",
      pplPendingMicro: "0",
      pplApprovedMicro: "30000000",
      pplPaidMicro: "0",
    },
    {
      userId: "demo-partner-2",
      email: "kol2@example.com",
      name: "KOL Two",
      referralCode: "def456",
      kolCode: null,
      createdAt: "2026-02-01T00:00:00.000Z",
      tierUsdcBps: 900,
      tierLabel: "Tier 2 · 9% USDC + 3% PPL",
      clicks: 2,
      l1Count: 1,
      l2Count: 0,
      volumeUsd: "$1,500.00",
      volumeUsdMicro: "1500000000",
      usdcPendingMicro: "50000000",
      usdcApprovedMicro: "50000000",
      usdcPaidMicro: "0",
      pplPendingMicro: "20000000",
      pplApprovedMicro: "20000000",
      pplPaidMicro: "0",
    },
  ],
};

/** Evidence-only UI fixture; disabled unless PEOPLE_PARTNER_ADMIN_FIXTURE=1 on the server. */
export default function AdminPartnersFixturePage() {
  if (process.env.PEOPLE_PARTNER_ADMIN_FIXTURE !== "1") {
    notFound();
  }
  return (
    <main className="min-h-screen bg-neutral-950">
      <PartnersAdminPanel demoOverview={DEMO} />
    </main>
  );
}
