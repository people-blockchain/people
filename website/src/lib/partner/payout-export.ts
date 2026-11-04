/**
 * Admin export of `approved` referral commission rows for manual payout execution.
 * USDC settles on Base (8453) with a $50 minimum batch threshold; PPL credits on PEOPLE mainnet only.
 */
import { and, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { partners, referralCommissionLedgers, users } from "@/db/schema";
import { MIN_PAYOUT_BATCH_USDC_MICRO } from "./commission";

function microFromDb(value: string | null | undefined): bigint {
  if (value == null || value === "") return BigInt(0);
  return BigInt(value);
}

export type ReferralPayoutExportRow = {
  beneficiaryUserId: string;
  beneficiaryEmail: string | null;
  payoutWalletBase: string | null;
  approvedUsdcMicro: string;
  approvedPplMicro: string;
  usdcNetwork: "base";
  pplNetwork: "people_mainnet";
  meetsUsdcMinimum: boolean;
  exportNote: string;
};

export type ReferralPayoutExport = {
  generatedAt: string;
  usdcMinimumMicro: string;
  usdcNetwork: "base";
  pplNetwork: "people_mainnet";
  rows: ReferralPayoutExportRow[];
};

export async function buildReferralPayoutExport(now = new Date()): Promise<ReferralPayoutExport> {
  const db = await getDbReady();
  const approved = await db
    .select()
    .from(referralCommissionLedgers)
    .where(
      and(
        eq(referralCommissionLedgers.status, "approved"),
        eq(referralCommissionLedgers.usdcSettlementNetwork, "base"),
        eq(referralCommissionLedgers.pplSettlementNetwork, "people_mainnet"),
      ),
    );

  const byUser = new Map<
    string,
    { usdc: bigint; ppl: bigint; lockedPplOnly: boolean }
  >();

  for (const row of approved) {
    if (row.isPplLocked) continue;
    const usdc = microFromDb(row.netUsdcMicro);
    const ppl = microFromDb(row.netPplMicro);
    if (usdc <= BigInt(0) && ppl <= BigInt(0)) continue;
    const prev = byUser.get(row.beneficiaryUserId) ?? {
      usdc: BigInt(0),
      ppl: BigInt(0),
      lockedPplOnly: false,
    };
    byUser.set(row.beneficiaryUserId, {
      usdc: prev.usdc + usdc,
      ppl: prev.ppl + ppl,
      lockedPplOnly: false,
    });
  }

  const rows: ReferralPayoutExportRow[] = [];
  for (const [beneficiaryUserId, totals] of byUser) {
    const [partner] = await db
      .select({
        email: users.email,
        walletAddress: partners.walletAddress,
      })
      .from(partners)
      .innerJoin(users, eq(users.id, partners.userId))
      .where(eq(partners.userId, beneficiaryUserId))
      .limit(1);

    const meetsUsdcMinimum = totals.usdc >= MIN_PAYOUT_BATCH_USDC_MICRO;
    const exportNote = meetsUsdcMinimum
      ? "Eligible for USDC batch on Base and PPL credit on PEOPLE mainnet."
      : totals.usdc > BigInt(0)
        ? `USDC below $50.00 minimum (${MIN_PAYOUT_BATCH_USDC_MICRO} micro); PPL on PEOPLE mainnet may still be credited separately.`
        : "PPL-only payout on PEOPLE mainnet (no USDC batch).";

    rows.push({
      beneficiaryUserId,
      beneficiaryEmail: partner?.email ?? null,
      payoutWalletBase: partner?.walletAddress?.trim().toLowerCase() ?? null,
      approvedUsdcMicro: totals.usdc.toString(),
      approvedPplMicro: totals.ppl.toString(),
      usdcNetwork: "base",
      pplNetwork: "people_mainnet",
      meetsUsdcMinimum,
      exportNote,
    });
  }

  rows.sort((a, b) => a.beneficiaryUserId.localeCompare(b.beneficiaryUserId));

  return {
    generatedAt: now.toISOString(),
    usdcMinimumMicro: MIN_PAYOUT_BATCH_USDC_MICRO.toString(),
    usdcNetwork: "base",
    pplNetwork: "people_mainnet",
    rows,
  };
}

export function referralPayoutExportToCsv(exportDoc: ReferralPayoutExport): string {
  const header = [
    "beneficiaryUserId",
    "beneficiaryEmail",
    "payoutWalletBase",
    "approvedUsdcMicro",
    "approvedPplMicro",
    "usdcNetwork",
    "pplNetwork",
    "meetsUsdcMinimum",
    "exportNote",
  ].join(",");
  const lines = exportDoc.rows.map((row) =>
    [
      row.beneficiaryUserId,
      row.beneficiaryEmail ?? "",
      row.payoutWalletBase ?? "",
      row.approvedUsdcMicro,
      row.approvedPplMicro,
      row.usdcNetwork,
      row.pplNetwork,
      row.meetsUsdcMinimum ? "true" : "false",
      `"${row.exportNote.replaceAll('"', '""')}"`,
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
