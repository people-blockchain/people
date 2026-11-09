import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnersAdminPanel } from "@/components/admin/PartnersAdminPanel";
import type { PartnersAdminOverview } from "@/lib/partner/admin-overview";
import type { loadCabinet } from "@/lib/partner/service";

type DemoCabinet = Awaited<ReturnType<typeof loadCabinet>>;

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
      tierUsdcBps: 900,
      tierLabel: "Tier 2 · 9% USDC + 3% PPL (override)",
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

const DEMO_CABINETS: Record<string, DemoCabinet> = {
  "demo-partner-1": {
    email: "kol1@example.com",
    referralCode: "abc123",
    kolCode: "kolone",
    kolTierOverrideBps: 900,
    volumeTierUsdcBps: 700,
    referredBy: null,
    walletAddress: null,
    walletBoundAt: null,
    l1: [{ userId: "l1-user", referralCode: "l1code", email: "l1@example.com", walletAddress: null }],
    l2: [],
    metrics: {
      clicks: 3,
      signUps: 1,
      buyers: 2,
      volumeUsd: "$1,000.00",
      volumeUsdMicro: "1000000000",
      earnedUsdc: {
        pendingMicro: "0",
        approvedMicro: "100000000",
        paidMicro: "0",
        voidMicro: "0",
        totalEarnedMicro: "100000000",
      },
      earnedPpl: {
        pendingMicro: "0",
        approvedMicro: "30000000",
        paidMicro: "0",
        voidMicro: "0",
        totalEarnedMicro: "30000000",
      },
    },
    tier: {
      currentTier: 2,
      currentTierLabel: "Tier 2 · 9% USDC + 3% PPL (override)",
      usdcRateBps: 900,
      pplRateBps: 300,
      currentVolumeUsdMicro: "1000000000",
      nextTier: 3,
      nextTierLabel: "Tier 3 · 12% USDC + 3% PPL",
      nextTierMinUsdMicro: "100000000000",
      remainingToNextTierUsdMicro: "99000000000",
      progressPct: 1,
    },
    commissions: [],
    payouts: [],
  },
  "demo-partner-2": {
    email: "kol2@example.com",
    referralCode: "def456",
    kolCode: null,
    kolTierOverrideBps: null,
    volumeTierUsdcBps: 700,
    referredBy: null,
    walletAddress: null,
    walletBoundAt: null,
    l1: [],
    l2: [],
    metrics: {
      clicks: 2,
      signUps: 1,
      buyers: 1,
      volumeUsd: "$1,500.00",
      volumeUsdMicro: "1500000000",
      earnedUsdc: {
        pendingMicro: "50000000",
        approvedMicro: "50000000",
        paidMicro: "0",
        voidMicro: "0",
        totalEarnedMicro: "100000000",
      },
      earnedPpl: {
        pendingMicro: "20000000",
        approvedMicro: "20000000",
        paidMicro: "0",
        voidMicro: "0",
        totalEarnedMicro: "40000000",
      },
    },
    tier: {
      currentTier: 1,
      currentTierLabel: "Tier 1 · 7% USDC + 3% PPL",
      usdcRateBps: 700,
      pplRateBps: 300,
      currentVolumeUsdMicro: "1500000000",
      nextTier: 2,
      nextTierLabel: "Tier 2 · 9% USDC + 3% PPL",
      nextTierMinUsdMicro: "25000000000",
      remainingToNextTierUsdMicro: "23500000000",
      progressPct: 6,
    },
    commissions: [],
    payouts: [],
  },
};

/** Evidence-only UI fixture; disabled unless PEOPLE_PARTNER_ADMIN_FIXTURE=1 on the server. */
export default function AdminPartnersFixturePage() {
  if (process.env.PEOPLE_PARTNER_ADMIN_FIXTURE !== "1") {
    notFound();
  }
  return (
    <main className="min-h-screen bg-neutral-950">
      <PartnersAdminPanel demoOverview={DEMO} demoCabinetsByUserId={DEMO_CABINETS} />
    </main>
  );
}
