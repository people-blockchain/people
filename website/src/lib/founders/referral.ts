/**
 * Million Founders referral bounty — pure rules (no DB, no I/O).
 *
 * Funding: 15M PPL of the 50M Million Founders program pool (1.5% of 1B supply),
 * Season 1 budget 6M PPL. No new issuance: the program stops when the pool is empty.
 *
 * Every number below is PROVISIONAL (testnet) and configurable here only; values the
 * founders did not specify are marked TBD in docs/FOUNDERS-REFERRAL.md.
 */

import { FOUNDER_DAILY_TOTAL_CAP } from "./config.ts";
import {
  MAINNET_INSTANT_UNLOCK_BPS,
  MAINNET_VEST_WEEKS,
} from "./reward-rules.ts";

/** Referral share of the Million Founders program pool (1.5% of total supply). */
export const REFERRAL_POOL_PPL = 15_000_000;
/** Season 1 referral budget carved out of REFERRAL_POOL_PPL. */
export const REFERRAL_SEASON_1_POOL_PPL = 6_000_000;
export const REFERRAL_CURRENT_SEASON = 1;

/**
 * Conversion of referral points to PPL. TBD — founder decision pending; 1:1 keeps
 * "100 points per active invitee" readable as 100 PPL until a rate is approved.
 */
export const REFERRAL_PPL_PER_POINT = 1;

/** L1: points per own active invitee. */
export const REFERRAL_L1_POINTS = 100;
/** L2: 30% of what the direct invitee earned for THEIR active invitees (basis points). */
export const REFERRAL_L2_BPS = 3_000;

/** Extra L1 points for invitee activity (defaults sized against FOUNDER_ACTION_CONFIG). */
export const REFERRAL_EXTRA_POINTS = {
  stay_7d: 10,
  sale_buy: 20,
  airdrop_join: 10,
} as const;
export type ReferralExtraKind = keyof typeof REFERRAL_EXTRA_POINTS;

export type ReferralCreditKind = "active" | ReferralExtraKind;
export const REFERRAL_EXTRA_KINDS = Object.keys(REFERRAL_EXTRA_POINTS) as ReferralExtraKind[];

/** Days after activation the invitee must still be acting to earn the stay_7d bonus. */
export const REFERRAL_STAY_ACTIVE_DAYS = 7;

/** Max active invitees per person per season (more only with ambassador approval). */
export const REFERRAL_MAX_ACTIVE_INVITEES = 50;

/** Same daily points cap as the main Million Founders program. */
export const REFERRAL_DAILY_POINTS_CAP = FOUNDER_DAILY_TOTAL_CAP;

/** Vesting: reuse the founders mainnet schedule — 10% liquid, 90% weekly over 12 months. */
export const REFERRAL_INSTANT_UNLOCK_BPS = MAINNET_INSTANT_UNLOCK_BPS;
export const REFERRAL_VEST_WEEKS = MAINNET_VEST_WEEKS;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Real testnet actions that prove an invitee is active (registration and likes do not). */
export const REFERRAL_ACTIVE_ACTIONS = [
  "swap",
  "stake",
  "pool_create",
  "nft_mint",
  "token_launch",
  "governance_vote",
] as const;

export function isReferralActiveAction(action: string): boolean {
  return (REFERRAL_ACTIVE_ACTIONS as readonly string[]).includes(action);
}

// ── Issuer option (token launch) ─────────────────────────────────────────────

/** Default extra supply share an issuer may reserve for its own referral program. */
export const ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS = 500;
/** Upper bound on the issuer allocation (provisional). */
export const ISSUER_REFERRAL_MAX_ALLOCATION_BPS = 1_000;
/** Default L1 bounty per invitee purchase, bps of the purchased amount (TBD). */
export const ISSUER_REFERRAL_DEFAULT_L1_BPS = 500;
export const ISSUER_REFERRAL_MAX_L1_BPS = 2_000;

export type IssuerReferralConfig = {
  enabled: boolean;
  allocationBps: number;
  l1Bps: number;
};

/** Issuer option is OFF unless the issuer explicitly opts in. */
export const ISSUER_REFERRAL_DEFAULT: IssuerReferralConfig = {
  enabled: false,
  allocationBps: 0,
  l1Bps: 0,
};

export function normalizeIssuerReferralConfig(input: {
  enabled?: unknown;
  allocationBps?: unknown;
  l1Bps?: unknown;
}): IssuerReferralConfig | null {
  if (input.enabled !== true) return { ...ISSUER_REFERRAL_DEFAULT };
  const allocationBps =
    input.allocationBps === undefined ? ISSUER_REFERRAL_DEFAULT_ALLOCATION_BPS : input.allocationBps;
  const l1Bps = input.l1Bps === undefined ? ISSUER_REFERRAL_DEFAULT_L1_BPS : input.l1Bps;
  if (
    typeof allocationBps !== "number" ||
    !Number.isInteger(allocationBps) ||
    allocationBps < 1 ||
    allocationBps > ISSUER_REFERRAL_MAX_ALLOCATION_BPS
  ) {
    return null;
  }
  if (
    typeof l1Bps !== "number" ||
    !Number.isInteger(l1Bps) ||
    l1Bps < 1 ||
    l1Bps > ISSUER_REFERRAL_MAX_L1_BPS
  ) {
    return null;
  }
  return { enabled: true, allocationBps, l1Bps };
}

/** Reserved referral allocation for a token supply (base units, BigInt). */
export function issuerAllocationAmount(totalSupply: bigint, allocationBps: number): bigint {
  if (totalSupply <= BigInt(0) || allocationBps <= 0) return BigInt(0);
  return (totalSupply * BigInt(allocationBps)) / BigInt(10000);
}

export type IssuerPurchaseCredit = { level: 1 | 2; amount: bigint };

/**
 * Credits for one invitee purchase of an issuer token: L1 = l1Bps of the purchase,
 * L2 = 30% of L1. Clamped to `remaining` allocation (L1 first); never exceeds it.
 */
export function computeIssuerPurchaseCredits(input: {
  purchaseAmount: bigint;
  l1Bps: number;
  remainingAllocation: bigint;
  hasL2Beneficiary: boolean;
}): IssuerPurchaseCredit[] {
  const { purchaseAmount, l1Bps, hasL2Beneficiary } = input;
  let remaining = input.remainingAllocation;
  if (purchaseAmount <= BigInt(0) || l1Bps <= 0 || remaining <= BigInt(0)) return [];
  const credits: IssuerPurchaseCredit[] = [];
  const l1Full = (purchaseAmount * BigInt(l1Bps)) / BigInt(10000);
  const l1 = l1Full < remaining ? l1Full : remaining;
  if (l1 > BigInt(0)) {
    credits.push({ level: 1, amount: l1 });
    remaining -= l1;
  }
  if (hasL2Beneficiary) {
    const l2Full = (l1Full * BigInt(REFERRAL_L2_BPS)) / BigInt(10000);
    const l2 = l2Full < remaining ? l2Full : remaining;
    if (l2 > BigInt(0)) credits.push({ level: 2, amount: l2 });
  }
  return credits;
}

// ── Active invitee ───────────────────────────────────────────────────────────

export type InviteeActivityInput = {
  /**
   * Genuinely verified via the Telegram phone bot or Human Passport (founder.verifiedAt).
   * The registration-time level bump for invitees of strong inviters does NOT count.
   */
  verified: boolean;
  walletCreated: boolean;
  /** Count of real testnet actions (see REFERRAL_ACTIVE_ACTIONS). */
  realActionCount: number;
  isBot: boolean;
};

/** Active = verified AND wallet AND ≥1 real action. Registration alone is not enough. */
export function isActiveInvitee(input: InviteeActivityInput): boolean {
  return (
    !input.isBot &&
    input.verified &&
    input.walletCreated &&
    input.realActionCount >= 1
  );
}

// ── Points ───────────────────────────────────────────────────────────────────

/** L2 credit: 30% of the L1 amount the invitee earned (floored; invitee is not charged). */
export function l2PointsFromL1(l1Points: number): number {
  if (!Number.isFinite(l1Points) || l1Points <= 0) return 0;
  return Math.floor((l1Points * REFERRAL_L2_BPS) / 10_000);
}

export function referralBasePoints(kind: ReferralCreditKind): number {
  return kind === "active" ? REFERRAL_L1_POINTS : REFERRAL_EXTRA_POINTS[kind];
}

export function pointsToPpl(points: number): number {
  return points * REFERRAL_PPL_PER_POINT;
}

export type ReferralCapReason = "invitee_cap" | "daily_cap" | "pool_empty" | "zero";

export type ReferralCreditInput = {
  desiredPoints: number;
  /** Credits of kind `active` this beneficiary already holds this season (own invitees). */
  alreadyActiveInvitees: number;
  /** Only checked for kind=active, level 1. */
  enforceInviteeCap: boolean;
  maxActiveInvitees: number;
  alreadyTodayPoints: number;
  poolRemainingPoints: number;
};

export type ReferralCreditResult =
  | { ok: true; points: number; truncated: boolean }
  | { ok: false; reason: ReferralCapReason };

/**
 * Applies the 50-invitee cap, the daily points cap and the season pool to one credit.
 * Pool and daily room truncate the credit; a fully exhausted limit rejects it.
 */
export function applyReferralLimits(input: ReferralCreditInput): ReferralCreditResult {
  const {
    desiredPoints,
    alreadyActiveInvitees,
    enforceInviteeCap,
    maxActiveInvitees,
    alreadyTodayPoints,
    poolRemainingPoints,
  } = input;
  if (!Number.isFinite(desiredPoints) || desiredPoints <= 0) {
    return { ok: false, reason: "zero" };
  }
  if (enforceInviteeCap && alreadyActiveInvitees >= maxActiveInvitees) {
    return { ok: false, reason: "invitee_cap" };
  }
  if (poolRemainingPoints <= 0) return { ok: false, reason: "pool_empty" };
  const dailyRoom = REFERRAL_DAILY_POINTS_CAP - alreadyTodayPoints;
  if (dailyRoom <= 0) return { ok: false, reason: "daily_cap" };
  const points = Math.min(desiredPoints, dailyRoom, poolRemainingPoints);
  return { ok: true, points, truncated: points < desiredPoints };
}

export function seasonPoolPoints(): number {
  return Math.floor(REFERRAL_SEASON_1_POOL_PPL / REFERRAL_PPL_PER_POINT);
}

// ── Extra-activity triggers ──────────────────────────────────────────────────

/**
 * stay_7d: the invitee must have a real action at least 7 days after activation.
 * `actionTimes` are timestamps (ms) of the invitee's real actions.
 */
export function staysActiveSevenDays(activatedAtMs: number, actionTimes: number[]): boolean {
  const threshold = activatedAtMs + REFERRAL_STAY_ACTIVE_DAYS * DAY_MS;
  return actionTimes.some((t) => t >= threshold);
}

// ── Vesting ──────────────────────────────────────────────────────────────────

/** Whole weeks elapsed since `startMs`, never negative. */
export function weeksSince(startMs: number, nowMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs) || nowMs <= startMs) return 0;
  return Math.floor((nowMs - startMs) / WEEK_MS);
}

/**
 * Vested part of one referral credit (base units, BigInt): 10% immediately, the other
 * 90% in equal weekly slices over 52 weeks; the final week releases the remainder so
 * the total is exact.
 */
export function vestedReferralAmount(total: bigint, weeksElapsed: number): bigint {
  if (total <= BigInt(0)) return BigInt(0);
  const instant = (total * BigInt(REFERRAL_INSTANT_UNLOCK_BPS)) / BigInt(10000);
  const weeks = Math.min(Math.max(0, Math.floor(weeksElapsed)), REFERRAL_VEST_WEEKS);
  if (weeks >= REFERRAL_VEST_WEEKS) return total;
  const vestPool = total - instant;
  return instant + (vestPool * BigInt(weeks)) / BigInt(REFERRAL_VEST_WEEKS);
}

export type VestingCredit = { amount: bigint; startMs: number };

export function totalVested(credits: VestingCredit[], nowMs: number): bigint {
  let sum = BigInt(0);
  for (const c of credits) sum += vestedReferralAmount(c.amount, weeksSince(c.startMs, nowMs));
  return sum;
}

export function claimableAmount(credits: VestingCredit[], alreadyClaimed: bigint, nowMs: number): bigint {
  const vested = totalVested(credits, nowMs);
  return vested > alreadyClaimed ? vested - alreadyClaimed : BigInt(0);
}

/** Unlock timeline for UI: [instant, week1 … week52] cumulative fractions in bps. */
export function vestingScheduleBps(): { week: number; cumulativeBps: number }[] {
  const out: { week: number; cumulativeBps: number }[] = [
    { week: 0, cumulativeBps: REFERRAL_INSTANT_UNLOCK_BPS },
  ];
  for (let w = 1; w <= REFERRAL_VEST_WEEKS; w += 1) {
    const vested = REFERRAL_INSTANT_UNLOCK_BPS + ((10_000 - REFERRAL_INSTANT_UNLOCK_BPS) * w) / REFERRAL_VEST_WEEKS;
    out.push({ week: w, cumulativeBps: Math.round(vested) });
  }
  return out;
}

/** PPL (human units) → micro-PPL integer for storage. */
export const PPL_MICRO = 1_000_000;
export function pplToMicro(ppl: number): bigint {
  return BigInt(Math.round(ppl * PPL_MICRO));
}
export function microToPpl(micro: bigint): number {
  return Number(micro) / PPL_MICRO;
}
