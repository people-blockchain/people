/**
 * Pure KOL & Partner commission calculation, volume tier progression, 30-day hold
 * lifecycle (`pending / approved / paid / void`), LIFO curve sell-back clawback,
 * and settlement network invariants:
 * - Blogger/KOL USDC commission: 7% / 9% / 12% by cumulative net volume, settled in USDC on Base.
 * - Blogger/KOL PPL bonus: 3% in PPL, credited on PEOPLE mainnet (never on Base).
 * - Genesis Quest reward PPL is locked on PEOPLE mainnet and cannot be sold back to PplCurveHub.
 */

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

export const MICRO_PER_UNIT = BigInt(1_000_000);
export const BPS_DENOMINATOR = BigInt(10_000);

export const DEFAULT_KOL_TIER1_USDC_BPS = 700; // 7%
export const DEFAULT_KOL_TIER2_USDC_BPS = 900; // 9%
export const DEFAULT_KOL_TIER3_USDC_BPS = 1200; // 12%
export const DEFAULT_KOL_PPL_BPS = 300; // 3%

export const DEFAULT_KOL_TIER2_MIN_USD_MICRO = BigInt(25_000) * MICRO_PER_UNIT; // $25,000
export const DEFAULT_KOL_TIER3_MIN_USD_MICRO = BigInt(100_000) * MICRO_PER_UNIT; // $100,000

/** 30-day hold period before `pending` commissions mature to `approved`. */
export const COMMISSION_HOLD_PERIOD_DAYS = 30;
export const COMMISSION_HOLD_PERIOD_MS = COMMISSION_HOLD_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/** Minimum approved USDC balance ($50.00) for weekly payout batching. */
export const MIN_PAYOUT_BATCH_USDC_MICRO = BigInt(50) * MICRO_PER_UNIT;

export type CommissionStatus = "pending" | "approved" | "paid" | "void";

export type CommissionVoidReason =
  | "self_referral"
  | "wallet_cluster_abuse"
  | "sell_back_clawback"
  | "chain_reorg"
  | "bot_disqualified";

export type SettlementNetworkUsdc = "base";
export type SettlementNetworkPpl = "people_mainnet";

export type KolTierNumber = 1 | 2 | 3;

export type KolTierConfig = {
  tier1UsdcBps: number;
  tier2MinUsdMicro: bigint;
  tier2UsdcBps: number;
  tier3MinUsdMicro: bigint;
  tier3UsdcBps: number;
  pplBps: number;
};

function parsePositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 && n <= 5000 ? n : fallback;
}

function parsePositiveUsdEnvMicro(raw: string | undefined, fallbackMicro: bigint): bigint {
  if (!raw) return fallbackMicro;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return fallbackMicro;
  return BigInt(Math.round(n)) * MICRO_PER_UNIT;
}

export function loadKolTierConfig(env: Record<string, string | undefined> = process.env): KolTierConfig {
  const tier2Min = parsePositiveUsdEnvMicro(env.KOL_TIER2_MIN_USD, DEFAULT_KOL_TIER2_MIN_USD_MICRO);
  const tier3MinRaw = parsePositiveUsdEnvMicro(env.KOL_TIER3_MIN_USD, DEFAULT_KOL_TIER3_MIN_USD_MICRO);
  const tier3Min = tier3MinRaw > tier2Min ? tier3MinRaw : DEFAULT_KOL_TIER3_MIN_USD_MICRO;
  return {
    tier1UsdcBps: parsePositiveIntEnv(env.KOL_TIER1_USDC_BPS, DEFAULT_KOL_TIER1_USDC_BPS),
    tier2MinUsdMicro: tier2Min,
    tier2UsdcBps: parsePositiveIntEnv(env.KOL_TIER2_USDC_BPS, DEFAULT_KOL_TIER2_USDC_BPS),
    tier3MinUsdMicro: tier3Min,
    tier3UsdcBps: parsePositiveIntEnv(env.KOL_TIER3_USDC_BPS, DEFAULT_KOL_TIER3_USDC_BPS),
    pplBps: parsePositiveIntEnv(env.KOL_PPL_BPS, DEFAULT_KOL_PPL_BPS),
  };
}

export type KolTierProgress = {
  currentTier: KolTierNumber;
  currentTierLabel: string;
  usdcRateBps: number;
  pplRateBps: number;
  currentVolumeUsdMicro: string;
  nextTier: KolTierNumber | null;
  nextTierLabel: string | null;
  nextTierMinUsdMicro: string | null;
  remainingToNextTierUsdMicro: string;
  progressPct: number;
};

export function resolveKolTier(
  cumulativeVolumeUsdMicro: bigint,
  overrideBps?: number | null,
  config: KolTierConfig = loadKolTierConfig(),
): { tier: KolTierNumber; usdcRateBps: number; pplRateBps: number } {
  const vol = cumulativeVolumeUsdMicro < ZERO ? ZERO : cumulativeVolumeUsdMicro;
  let naturalTier: KolTierNumber = 1;
  let naturalBps = config.tier1UsdcBps;

  if (vol >= config.tier3MinUsdMicro) {
    naturalTier = 3;
    naturalBps = config.tier3UsdcBps;
  } else if (vol >= config.tier2MinUsdMicro) {
    naturalTier = 2;
    naturalBps = config.tier2UsdcBps;
  }

  if (overrideBps && overrideBps > naturalBps) {
    const overrideTier: KolTierNumber =
      overrideBps >= config.tier3UsdcBps ? 3 : overrideBps >= config.tier2UsdcBps ? 2 : 1;
    return { tier: overrideTier, usdcRateBps: overrideBps, pplRateBps: config.pplBps };
  }

  return { tier: naturalTier, usdcRateBps: naturalBps, pplRateBps: config.pplBps };
}

function tierLabel(tier: KolTierNumber, usdcBps: number, pplBps: number): string {
  const usdcPct = (usdcBps / 100).toFixed(usdcBps % 100 === 0 ? 0 : 2);
  const pplPct = (pplBps / 100).toFixed(pplBps % 100 === 0 ? 0 : 2);
  const name = tier === 3 ? "Elite" : tier === 2 ? "Growth" : "Starter";
  return `Tier ${tier} — ${name} (${usdcPct}% USDC + ${pplPct}% PPL)`;
}

export function computeKolTierProgress(
  cumulativeVolumeUsdMicro: bigint,
  overrideBps?: number | null,
  config: KolTierConfig = loadKolTierConfig(),
): KolTierProgress {
  const vol = cumulativeVolumeUsdMicro < ZERO ? ZERO : cumulativeVolumeUsdMicro;
  const resolved = resolveKolTier(vol, overrideBps, config);

  if (resolved.tier === 3) {
    return {
      currentTier: 3,
      currentTierLabel: tierLabel(3, resolved.usdcRateBps, resolved.pplRateBps),
      usdcRateBps: resolved.usdcRateBps,
      pplRateBps: resolved.pplRateBps,
      currentVolumeUsdMicro: vol.toString(),
      nextTier: null,
      nextTierLabel: null,
      nextTierMinUsdMicro: null,
      remainingToNextTierUsdMicro: "0",
      progressPct: 100,
    };
  }

  if (resolved.tier === 2) {
    const target = config.tier3MinUsdMicro;
    const rem = target > vol ? target - vol : ZERO;
    const span = target - config.tier2MinUsdMicro;
    const gained = vol > config.tier2MinUsdMicro ? vol - config.tier2MinUsdMicro : ZERO;
    const pct = span > ZERO ? Number((gained * HUNDRED) / span) : 100;
    return {
      currentTier: 2,
      currentTierLabel: tierLabel(2, resolved.usdcRateBps, resolved.pplRateBps),
      usdcRateBps: resolved.usdcRateBps,
      pplRateBps: resolved.pplRateBps,
      currentVolumeUsdMicro: vol.toString(),
      nextTier: 3,
      nextTierLabel: tierLabel(3, config.tier3UsdcBps, config.pplBps),
      nextTierMinUsdMicro: target.toString(),
      remainingToNextTierUsdMicro: rem.toString(),
      progressPct: Math.max(0, Math.min(100, pct)),
    };
  }

  const target = config.tier2MinUsdMicro;
  const rem = target > vol ? target - vol : ZERO;
  const pct = target > ZERO ? Number((vol * HUNDRED) / target) : 100;
  return {
    currentTier: 1,
    currentTierLabel: tierLabel(1, resolved.usdcRateBps, resolved.pplRateBps),
    usdcRateBps: resolved.usdcRateBps,
    pplRateBps: resolved.pplRateBps,
    currentVolumeUsdMicro: vol.toString(),
    nextTier: 2,
    nextTierLabel: tierLabel(2, config.tier2UsdcBps, config.pplBps),
    nextTierMinUsdMicro: target.toString(),
    remainingToNextTierUsdMicro: rem.toString(),
    progressPct: Math.max(0, Math.min(100, pct)),
  };
}

export type CalculateCommissionInput = {
  purchaseId: string;
  chainId?: number;
  txHash: string;
  logIndex?: number;
  beneficiaryUserId: string;
  buyerUserId: string | null;
  buyerAddress: string;
  usdPurchaseMicro: bigint;
  pplPurchaseMicro: bigint;
  priorNetVolumeUsdMicro: bigint;
  kolTierOverrideBps?: number | null;
  program?: "kol" | "partner";
  level?: 1 | 2;
  blockTimestamp: Date;
  voidReason?: CommissionVoidReason | null;
  tierConfig?: KolTierConfig;
};

export type CalculatedCommissionEntry = {
  purchaseId: string;
  beneficiaryUserId: string;
  buyerUserId: string | null;
  buyerAddress: string;
  program: "kol" | "partner";
  level: 1 | 2;
  tier: KolTierNumber;
  usdcRateBps: number;
  pplRateBps: number;
  usdPurchaseMicro: bigint;
  pplPurchaseMicro: bigint;
  grossUsdcMicro: bigint;
  grossPplMicro: bigint;
  clawedBackUsdcMicro: bigint;
  clawedBackPplMicro: bigint;
  netUsdcMicro: bigint;
  netPplMicro: bigint;
  usdcSettlementNetwork: SettlementNetworkUsdc;
  pplSettlementNetwork: SettlementNetworkPpl;
  isPplLocked: boolean;
  status: CommissionStatus;
  voidReason: CommissionVoidReason | null;
  holdUntil: Date;
  idempotencyKey: string;
};

/**
 * Computes exact micro-USDC (Base) and micro-PPL (PEOPLE mainnet) commissions for a confirmed
 * PplCurveHub `Bought` event.
 */
export function calculatePurchaseCommission(
  input: CalculateCommissionInput,
): CalculatedCommissionEntry {
  const usdMicro = input.usdPurchaseMicro < ZERO ? ZERO : input.usdPurchaseMicro;
  const pplMicro = input.pplPurchaseMicro < ZERO ? ZERO : input.pplPurchaseMicro;
  const chainId = input.chainId ?? 8453;
  const logIndex = input.logIndex ?? 0;
  const txHashLower = input.txHash.trim().toLowerCase();
  const buyerAddrLower = input.buyerAddress.trim().toLowerCase();
  const program = input.program ?? "kol";
  const level = input.level ?? 1;

  // Volume tier includes prior confirmed volume; if a single purchase crosses a tier threshold,
  // resolve tier at (priorNetVolumeUsdMicro + usdMicro) so bloggers immediately unlock the tier
  // on the threshold-crossing sale.
  const effectiveVolume = input.priorNetVolumeUsdMicro + usdMicro;
  const resolved = resolveKolTier(effectiveVolume, input.kolTierOverrideBps, input.tierConfig);

  // L2 partner line (when applicable) scales by 30% of L1; L1 / KOL uses full tier rate.
  const usdcRateBps = level === 2 ? Math.floor((resolved.usdcRateBps * 3000) / 10_000) : resolved.usdcRateBps;
  const pplRateBps = level === 2 ? Math.floor((resolved.pplRateBps * 3000) / 10_000) : resolved.pplRateBps;

  const grossUsdcMicro = (usdMicro * BigInt(usdcRateBps)) / BPS_DENOMINATOR;
  const grossPplMicro = (pplMicro * BigInt(pplRateBps)) / BPS_DENOMINATOR;

  const isVoided = Boolean(input.voidReason);
  const holdUntil = new Date(input.blockTimestamp.getTime() + COMMISSION_HOLD_PERIOD_MS);
  const idempotencyKey = `${program}_L${level}:${chainId}:${txHashLower}:${logIndex}`;

  return {
    purchaseId: input.purchaseId,
    beneficiaryUserId: input.beneficiaryUserId,
    buyerUserId: input.buyerUserId,
    buyerAddress: buyerAddrLower,
    program,
    level,
    tier: resolved.tier,
    usdcRateBps,
    pplRateBps,
    usdPurchaseMicro: usdMicro,
    pplPurchaseMicro: pplMicro,
    grossUsdcMicro,
    grossPplMicro,
    clawedBackUsdcMicro: ZERO,
    clawedBackPplMicro: ZERO,
    netUsdcMicro: isVoided ? ZERO : grossUsdcMicro,
    netPplMicro: isVoided ? ZERO : grossPplMicro,
    usdcSettlementNetwork: "base",
    pplSettlementNetwork: "people_mainnet",
    isPplLocked: false,
    status: isVoided ? "void" : "pending",
    voidReason: input.voidReason ?? null,
    holdUntil,
    idempotencyKey,
  };
}

/**
 * Genesis Quest reward PPL is locked on PEOPLE mainnet and is never sellable back
 * to the Base `PplCurveHub` bonding curve. Only curve-purchased PPL held by an
 * eligible buyer can be sold back to the hub.
 */
export function isPplSellableToCurveHub(input: {
  source: "curve_purchase" | "genesis_quest" | "kol_bonus" | "growth_reward";
  isLocked?: boolean;
}): boolean {
  if (input.isLocked) return false;
  if (input.source === "genesis_quest") return false;
  return input.source === "curve_purchase";
}

export type MutableCommissionRow = {
  id: string;
  purchaseId: string;
  buyerAddress: string;
  pplPurchaseMicro: bigint;
  grossUsdcMicro: bigint;
  grossPplMicro: bigint;
  clawedBackUsdcMicro: bigint;
  clawedBackPplMicro: bigint;
  netUsdcMicro: bigint;
  netPplMicro: bigint;
  status: CommissionStatus;
  voidReason: CommissionVoidReason | null;
  holdUntil: Date;
  createdAt: Date;
};

/**
 * Evaluates whether a `pending` commission row has matured past its 30-day hold period
 * and can transition to `approved`.
 */
export function evaluateHoldMaturity(
  row: Pick<MutableCommissionRow, "status" | "holdUntil" | "netUsdcMicro" | "netPplMicro">,
  now: Date = new Date(),
): CommissionStatus {
  if (row.status !== "pending") return row.status;
  if (row.netUsdcMicro <= ZERO && row.netPplMicro <= ZERO) return "void";
  if (now.getTime() >= row.holdUntil.getTime()) {
    return "approved";
  }
  return "pending";
}

/**
 * Applies LIFO sell-back clawback when a buyer sells `pplSoldBackMicro` PPL back to
 * `PplCurveHub` during the hold window (before payout).
 * Returns updated copies of the commission rows and remaining unmatched `pplSoldBackMicro`.
 */
export function applySellBackClawback(
  rows: MutableCommissionRow[],
  pplSoldBackMicro: bigint,
): { updated: MutableCommissionRow[]; remainingPplToClawBackMicro: bigint } {
  if (pplSoldBackMicro <= ZERO || rows.length === 0) {
    return { updated: rows.map((r) => ({ ...r })), remainingPplToClawBackMicro: ZERO };
  }

  // Sort LIFO (newest purchase first) for active (`pending` or unpaid `approved`) rows
  const indexed = rows.map((r, idx) => ({ row: { ...r }, idx }));
  indexed.sort((a, b) => b.row.createdAt.getTime() - a.row.createdAt.getTime());

  let remaining = pplSoldBackMicro;

  for (const item of indexed) {
    const r = item.row;
    if (remaining <= ZERO) break;
    if (r.status !== "pending" && r.status !== "approved") continue;
    if (r.pplPurchaseMicro <= ZERO || (r.netUsdcMicro <= ZERO && r.netPplMicro <= ZERO)) continue;

    // Determine how much of the original purchase PPL is still un-clawed-back
    const alreadyClawedRatioPpl =
      r.grossPplMicro > ZERO
        ? (r.clawedBackPplMicro * r.pplPurchaseMicro) / r.grossPplMicro
        : ZERO;
    const activePurchasePpl =
      r.pplPurchaseMicro > alreadyClawedRatioPpl ? r.pplPurchaseMicro - alreadyClawedRatioPpl : ZERO;
    if (activePurchasePpl <= ZERO) continue;

    if (remaining >= activePurchasePpl) {
      // 100% of remaining purchase PPL sold back -> full clawback & void
      remaining -= activePurchasePpl;
      r.clawedBackUsdcMicro = r.grossUsdcMicro;
      r.clawedBackPplMicro = r.grossPplMicro;
      r.netUsdcMicro = ZERO;
      r.netPplMicro = ZERO;
      r.status = "void";
      r.voidReason = "sell_back_clawback";
    } else {
      // Partial sell-back -> proportional reduction
      const addClawUsdc = (r.grossUsdcMicro * remaining) / r.pplPurchaseMicro;
      const addClawPpl = (r.grossPplMicro * remaining) / r.pplPurchaseMicro;
      r.clawedBackUsdcMicro =
        r.clawedBackUsdcMicro + addClawUsdc > r.grossUsdcMicro
          ? r.grossUsdcMicro
          : r.clawedBackUsdcMicro + addClawUsdc;
      r.clawedBackPplMicro =
        r.clawedBackPplMicro + addClawPpl > r.grossPplMicro
          ? r.grossPplMicro
          : r.clawedBackPplMicro + addClawPpl;
      r.netUsdcMicro = r.grossUsdcMicro - r.clawedBackUsdcMicro;
      r.netPplMicro = r.grossPplMicro - r.clawedBackPplMicro;
      remaining = ZERO;
      if (r.netUsdcMicro <= ZERO && r.netPplMicro <= ZERO) {
        r.status = "void";
        r.voidReason = "sell_back_clawback";
      }
    }
  }

  // Restore original order
  indexed.sort((a, b) => a.idx - b.idx);
  return {
    updated: indexed.map((i) => i.row),
    remainingPplToClawBackMicro: remaining,
  };
}

export type EarningsBreakdown = {
  pendingMicro: string;
  approvedMicro: string;
  paidMicro: string;
  voidMicro: string;
  totalEarnedMicro: string;
};

export function summarizeCommissionLedger(
  rows: Array<{
    status: string;
    netUsdcMicro: bigint | string;
    netPplMicro: bigint | string;
    grossUsdcMicro?: bigint | string;
    grossPplMicro?: bigint | string;
  }>,
): { earnedUsdc: EarningsBreakdown; earnedPpl: EarningsBreakdown } {
  let usdcPending = ZERO;
  let usdcApproved = ZERO;
  let usdcPaid = ZERO;
  let usdcVoid = ZERO;

  let pplPending = ZERO;
  let pplApproved = ZERO;
  let pplPaid = ZERO;
  let pplVoid = ZERO;

  for (const row of rows) {
    const netUsdc = BigInt(row.netUsdcMicro);
    const netPpl = BigInt(row.netPplMicro);
    const grossUsdc = row.grossUsdcMicro !== undefined ? BigInt(row.grossUsdcMicro) : netUsdc;
    const grossPpl = row.grossPplMicro !== undefined ? BigInt(row.grossPplMicro) : netPpl;

    if (row.status === "pending") {
      usdcPending += netUsdc;
      pplPending += netPpl;
    } else if (row.status === "approved") {
      usdcApproved += netUsdc;
      pplApproved += netPpl;
    } else if (row.status === "paid") {
      usdcPaid += netUsdc;
      pplPaid += netPpl;
    } else if (row.status === "void") {
      usdcVoid += grossUsdc;
      pplVoid += grossPpl;
    }
  }

  return {
    earnedUsdc: {
      pendingMicro: usdcPending.toString(),
      approvedMicro: usdcApproved.toString(),
      paidMicro: usdcPaid.toString(),
      voidMicro: usdcVoid.toString(),
      totalEarnedMicro: (usdcPending + usdcApproved + usdcPaid).toString(),
    },
    earnedPpl: {
      pendingMicro: pplPending.toString(),
      approvedMicro: pplApproved.toString(),
      paidMicro: pplPaid.toString(),
      voidMicro: pplVoid.toString(),
      totalEarnedMicro: (pplPending + pplApproved + pplPaid).toString(),
    },
  };
}

export function formatMicroUsd(micro: bigint | string): string {
  const val = typeof micro === "bigint" ? micro : BigInt(micro || "0");
  const negative = val < ZERO;
  const abs = negative ? -val : val;
  const whole = abs / MICRO_PER_UNIT;
  const cents = ((abs % MICRO_PER_UNIT) * HUNDRED) / MICRO_PER_UNIT;
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsFormatted = cents.toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${wholeFormatted}.${centsFormatted}`;
}

export function formatMicroPpl(micro: bigint | string): string {
  const val = typeof micro === "bigint" ? micro : BigInt(micro || "0");
  const negative = val < ZERO;
  const abs = negative ? -val : val;
  const whole = abs / MICRO_PER_UNIT;
  const frac = ((abs % MICRO_PER_UNIT) * HUNDRED) / MICRO_PER_UNIT;
  const wholeFormatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (frac === ZERO) {
    return `${negative ? "-" : ""}${wholeFormatted} PPL`;
  }
  return `${negative ? "-" : ""}${wholeFormatted}.${frac.toString().padStart(2, "0")} PPL`;
}
