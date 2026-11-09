import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_PAYOUT_BATCH_USDC_MICRO, MICRO_PER_UNIT } from "./commission.ts";
import { referralPayoutExportToCsv } from "./payout-export.ts";

test("referralPayoutExportToCsv labels Base USDC and PEOPLE mainnet PPL networks", () => {
  const doc = {
    generatedAt: "2026-11-03T00:00:00.000Z",
    usdcMinimumMicro: MIN_PAYOUT_BATCH_USDC_MICRO.toString(),
    usdcNetwork: "base" as const,
    pplNetwork: "people_mainnet" as const,
    rows: [
      {
        beneficiaryUserId: "user-1",
        beneficiaryEmail: "kol@example.com",
        payoutWalletBase: "0xabc",
        approvedUsdcMicro: (BigInt(60) * MICRO_PER_UNIT).toString(),
        approvedPplMicro: "1000000",
        usdcNetwork: "base" as const,
        pplNetwork: "people_mainnet" as const,
        meetsUsdcMinimum: true,
        exportNote: "Eligible for USDC batch on Base and PPL credit on PEOPLE mainnet.",
      },
    ],
  };
  const csv = referralPayoutExportToCsv(doc);
  assert.match(csv, /usdcNetwork/);
  assert.match(csv, /people_mainnet/);
  assert.match(csv, /base/);
});
