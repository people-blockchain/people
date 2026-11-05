import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { partners, users } from "@/db/schema";
import { formatMicroUsd } from "@/lib/partner/commission";
import { loadCabinet } from "@/lib/partner/service";

export type PartnersAdminSummary = {
  totalPartners: number;
  totalClicks: number;
  totalSignUps: number;
  totalVolumeUsdMicro: string;
  totalApprovedUsdcMicro: string;
  totalApprovedPplMicro: string;
};

export type PartnersAdminRow = {
  userId: string;
  email: string | null;
  name: string | null;
  referralCode: string;
  kolCode: string | null;
  createdAt: string;
  tierUsdcBps: number;
  tierLabel: string;
  clicks: number;
  l1Count: number;
  l2Count: number;
  volumeUsd: string;
  volumeUsdMicro: string;
  usdcPendingMicro: string;
  usdcApprovedMicro: string;
  usdcPaidMicro: string;
  pplPendingMicro: string;
  pplApprovedMicro: string;
  pplPaidMicro: string;
};

export type PartnersAdminOverview = {
  summary: PartnersAdminSummary;
  partners: PartnersAdminRow[];
};

function addMicro(a: string, b: string): string {
  return (BigInt(a || "0") + BigInt(b || "0")).toString();
}

export async function loadPartnersAdminOverview(): Promise<PartnersAdminOverview> {
  const db = await getDbReady();
  const partnerIds = await db
    .select({ userId: partners.userId, createdAt: partners.createdAt })
    .from(partners);

  const rows: PartnersAdminRow[] = [];
  let totalClicks = 0;
  let totalSignUps = 0;
  let totalVolumeUsdMicro = BigInt(0);
  let totalApprovedUsdcMicro = BigInt(0);
  let totalApprovedPplMicro = BigInt(0);

  for (const { userId, createdAt } of partnerIds) {
    const cabinet = await loadCabinet(userId);
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const l1Count = cabinet.l1.length;
    const l2Count = cabinet.l2.length;
    totalClicks += cabinet.metrics.clicks;
    totalSignUps += cabinet.metrics.signUps;
    totalVolumeUsdMicro += BigInt(cabinet.metrics.volumeUsdMicro || "0");
    totalApprovedUsdcMicro += BigInt(cabinet.metrics.earnedUsdc.approvedMicro || "0");
    totalApprovedPplMicro += BigInt(cabinet.metrics.earnedPpl.approvedMicro || "0");

    rows.push({
      userId,
      email: user?.email ?? cabinet.email,
      name: user?.name ?? null,
      referralCode: cabinet.referralCode,
      kolCode: cabinet.kolCode,
      createdAt: createdAt.toISOString(),
      tierUsdcBps: cabinet.tier.usdcRateBps,
      tierLabel: cabinet.tier.currentTierLabel,
      clicks: cabinet.metrics.clicks,
      l1Count,
      l2Count,
      volumeUsd: cabinet.metrics.volumeUsd,
      volumeUsdMicro: cabinet.metrics.volumeUsdMicro,
      usdcPendingMicro: cabinet.metrics.earnedUsdc.pendingMicro,
      usdcApprovedMicro: cabinet.metrics.earnedUsdc.approvedMicro,
      usdcPaidMicro: cabinet.metrics.earnedUsdc.paidMicro,
      pplPendingMicro: cabinet.metrics.earnedPpl.pendingMicro,
      pplApprovedMicro: cabinet.metrics.earnedPpl.approvedMicro,
      pplPaidMicro: cabinet.metrics.earnedPpl.paidMicro,
    });
  }

  rows.sort((a, b) => b.clicks - a.clicks || a.referralCode.localeCompare(b.referralCode));

  return {
    summary: {
      totalPartners: rows.length,
      totalClicks,
      totalSignUps,
      totalVolumeUsdMicro: totalVolumeUsdMicro.toString(),
      totalApprovedUsdcMicro: totalApprovedUsdcMicro.toString(),
      totalApprovedPplMicro: totalApprovedPplMicro.toString(),
    },
    partners: rows,
  };
}

export function formatSummaryVolume(summary: PartnersAdminSummary): string {
  return formatMicroUsd(summary.totalVolumeUsdMicro);
}

export function formatSummaryUsdcDue(summary: PartnersAdminSummary): string {
  return formatMicroUsd(summary.totalApprovedUsdcMicro);
}

export { addMicro };
