import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMISSION_HOLD_PERIOD_MS,
  MICRO_PER_UNIT,
  applySellBackClawback,
  calculatePurchaseCommission,
  computeKolTierProgress,
  evaluateHoldMaturity,
  formatMicroPpl,
  formatMicroUsd,
  isPplSellableToCurveHub,
  loadKolTierConfig,
  resolveKolTier,
  summarizeCommissionLedger,
  type MutableCommissionRow,
} from "./commission.ts";

const ZERO = BigInt(0);

test("KOL volume tiers resolve 7% / 9% / 12% USDC + 3% PPL and respect configurable thresholds", () => {
  const t1 = resolveKolTier(ZERO);
  assert.deepEqual(t1, { tier: 1, usdcRateBps: 700, pplRateBps: 300 });

  const t1Edge = resolveKolTier(BigInt(24_999) * MICRO_PER_UNIT);
  assert.deepEqual(t1Edge, { tier: 1, usdcRateBps: 700, pplRateBps: 300 });

  const t2 = resolveKolTier(BigInt(25_000) * MICRO_PER_UNIT);
  assert.deepEqual(t2, { tier: 2, usdcRateBps: 900, pplRateBps: 300 });

  const t3 = resolveKolTier(BigInt(100_000) * MICRO_PER_UNIT);
  assert.deepEqual(t3, { tier: 3, usdcRateBps: 1200, pplRateBps: 300 });

  // Override bps elevates a negotiated KOL deal
  const overridden = resolveKolTier(BigInt(1_000) * MICRO_PER_UNIT, 1200);
  assert.deepEqual(overridden, { tier: 3, usdcRateBps: 1200, pplRateBps: 300 });

  // Custom env config overrides thresholds
  const customCfg = loadKolTierConfig({
    KOL_TIER2_MIN_USD: "10000",
    KOL_TIER3_MIN_USD: "50000",
  });
  assert.equal(resolveKolTier(BigInt(12_000) * MICRO_PER_UNIT, null, customCfg).usdcRateBps, 900);
  assert.equal(resolveKolTier(BigInt(50_000) * MICRO_PER_UNIT, null, customCfg).usdcRateBps, 1200);
});

test("computeKolTierProgress calculates remaining volume and percentage accurately", () => {
  const p1 = computeKolTierProgress(BigInt(12_500) * MICRO_PER_UNIT);
  assert.equal(p1.currentTier, 1);
  assert.equal(p1.usdcRateBps, 700);
  assert.equal(p1.pplRateBps, 300);
  assert.equal(p1.nextTier, 2);
  assert.equal(p1.remainingToNextTierUsdMicro, (BigInt(12_500) * MICRO_PER_UNIT).toString());
  assert.equal(p1.progressPct, 50);

  const p3 = computeKolTierProgress(BigInt(120_000) * MICRO_PER_UNIT);
  assert.equal(p3.currentTier, 3);
  assert.equal(p3.usdcRateBps, 1200);
  assert.equal(p3.nextTier, null);
  assert.equal(p3.progressPct, 100);
});

test("calculatePurchaseCommission books USDC on Base and PPL on PEOPLE mainnet with 30d hold", () => {
  const blockTime = new Date("2026-12-02T10:00:00.000Z");
  // $500 purchase -> 100,000 PPL at $0.005
  const entry = calculatePurchaseCommission({
    purchaseId: "pur_1",
    chainId: 8453,
    txHash: "0xABCDEF1234",
    logIndex: 2,
    beneficiaryUserId: "kol_user_1",
    buyerUserId: "buyer_user_1",
    buyerAddress: "0x1111111111111111111111111111111111111111",
    usdPurchaseMicro: BigInt(500) * MICRO_PER_UNIT,
    pplPurchaseMicro: BigInt(100_000) * MICRO_PER_UNIT,
    priorNetVolumeUsdMicro: ZERO,
    blockTimestamp: blockTime,
  });

  // 7% of $500 = $35.00 USDC; 3% of 100,000 PPL = 3,000 PPL
  assert.equal(entry.tier, 1);
  assert.equal(entry.usdcRateBps, 700);
  assert.equal(entry.pplRateBps, 300);
  assert.equal(entry.grossUsdcMicro, BigInt(35) * MICRO_PER_UNIT);
  assert.equal(entry.netUsdcMicro, BigInt(35) * MICRO_PER_UNIT);
  assert.equal(entry.grossPplMicro, BigInt(3_000) * MICRO_PER_UNIT);
  assert.equal(entry.netPplMicro, BigInt(3_000) * MICRO_PER_UNIT);
  assert.equal(entry.usdcSettlementNetwork, "base");
  assert.equal(entry.pplSettlementNetwork, "people_mainnet");
  assert.equal(entry.status, "pending");
  assert.equal(entry.holdUntil.getTime(), blockTime.getTime() + COMMISSION_HOLD_PERIOD_MS);
  assert.equal(entry.idempotencyKey, "kol_L1:8453:0xabcdef1234:2");

  // Hold maturity check before and after 30 days
  const day29 = new Date(blockTime.getTime() + COMMISSION_HOLD_PERIOD_MS - 1_000);
  const day30 = new Date(blockTime.getTime() + COMMISSION_HOLD_PERIOD_MS);
  assert.equal(evaluateHoldMaturity(entry, day29), "pending");
  assert.equal(evaluateHoldMaturity(entry, day30), "approved");
});

test("Genesis Quest reward PPL is locked and cannot be sold back to PplCurveHub", () => {
  assert.equal(isPplSellableToCurveHub({ source: "genesis_quest" }), false);
  assert.equal(isPplSellableToCurveHub({ source: "curve_purchase", isLocked: true }), false);
  assert.equal(isPplSellableToCurveHub({ source: "curve_purchase", isLocked: false }), true);
});

test("applySellBackClawback reduces pending commissions in LIFO order on Sold events", () => {
  const t1 = new Date("2026-12-01T00:00:00.000Z");
  const t2 = new Date("2026-12-02T00:00:00.000Z");

  const row1: MutableCommissionRow = {
    id: "c1",
    purchaseId: "p1",
    buyerAddress: "0xbuyer",
    pplPurchaseMicro: BigInt(10_000) * MICRO_PER_UNIT,
    grossUsdcMicro: BigInt(7) * MICRO_PER_UNIT,
    grossPplMicro: BigInt(300) * MICRO_PER_UNIT,
    clawedBackUsdcMicro: ZERO,
    clawedBackPplMicro: ZERO,
    netUsdcMicro: BigInt(7) * MICRO_PER_UNIT,
    netPplMicro: BigInt(300) * MICRO_PER_UNIT,
    status: "pending",
    voidReason: null,
    holdUntil: new Date(t1.getTime() + COMMISSION_HOLD_PERIOD_MS),
    createdAt: t1,
  };

  const row2: MutableCommissionRow = {
    id: "c2",
    purchaseId: "p2",
    buyerAddress: "0xbuyer",
    pplPurchaseMicro: BigInt(10_000) * MICRO_PER_UNIT,
    grossUsdcMicro: BigInt(7) * MICRO_PER_UNIT,
    grossPplMicro: BigInt(300) * MICRO_PER_UNIT,
    clawedBackUsdcMicro: ZERO,
    clawedBackPplMicro: ZERO,
    netUsdcMicro: BigInt(7) * MICRO_PER_UNIT,
    netPplMicro: BigInt(300) * MICRO_PER_UNIT,
    status: "pending",
    voidReason: null,
    holdUntil: new Date(t2.getTime() + COMMISSION_HOLD_PERIOD_MS),
    createdAt: t2,
  };

  // Sell back 15,000 PPL: should completely void row2 (LIFO, 10,000 PPL) and claw back 50% of row1 (5,000 PPL)
  const { updated, remainingPplToClawBackMicro } = applySellBackClawback(
    [row1, row2],
    BigInt(15_000) * MICRO_PER_UNIT,
  );
  assert.equal(remainingPplToClawBackMicro, ZERO);

  const [u1, u2] = updated;
  assert.equal(u2.status, "void");
  assert.equal(u2.voidReason, "sell_back_clawback");
  assert.equal(u2.netUsdcMicro, ZERO);
  assert.equal(u2.netPplMicro, ZERO);

  assert.equal(u1.status, "pending");
  assert.equal(u1.netUsdcMicro, BigInt(3_500_000)); // $3.50 USDC remaining
  assert.equal(u1.netPplMicro, BigInt(150) * MICRO_PER_UNIT); // 150 PPL remaining

  const summary = summarizeCommissionLedger(updated);
  assert.equal(summary.earnedUsdc.pendingMicro, "3500000");
  assert.equal(summary.earnedUsdc.voidMicro, "7000000");
  assert.equal(summary.earnedPpl.pendingMicro, (BigInt(150) * MICRO_PER_UNIT).toString());
  assert.equal(formatMicroUsd(summary.earnedUsdc.pendingMicro), "$3.50");
  assert.equal(formatMicroPpl(summary.earnedPpl.pendingMicro), "150 PPL");
});
