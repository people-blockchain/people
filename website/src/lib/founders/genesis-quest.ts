/**
 * PEOPLE Genesis Quest (2 Nov – 1 Dec 2026): pure rules, no I/O.
 *
 * Owner decisions 2026-11-01. Paid from the 50M Million Founders program pool (season-pool.ts),
 * nothing is minted. "Up to": whatever is not earned goes back to the program pool.
 *
 * Quest rewards are never bought back by the project: the sell-back contract on PEOPLE
 * (contracts/src/sale/PplReturnBurn.sol) accepts only PPL credited as sale purchases
 * (`hubPurchasedPpl`). Unlocked quest PPL can only move between participants once transfers open.
 */

import { FOUNDER_PROGRAM_POOL_PPL, FOUNDER_SEASON_1_POOL_PPL } from "./season-pool.ts";
import { REFERRAL_POOL_PPL } from "./referral.ts";

export const GENESIS_QUEST_START_ISO = "2026-11-02T00:00:00Z";
export const GENESIS_QUEST_END_ISO = "2026-12-01T00:00:00Z";

export const GENESIS_QUEST_POOL_PPL = 25_000_000;
export const GENESIS_QUEST_BUDGET_PPL = {
  base: 13_000_000,
  referral: 6_000_000,
  leaderboard: 6_000_000,
} as const;

/** Base reward: verification + one real on-chain action. Social follows are required but unpaid. */
export const GENESIS_QUEST_BASE_TELEGRAM_PPL = 300;
export const GENESIS_QUEST_BASE_PASSPORT_PPL = 1_500;
/** Cap on task + referral rewards per person (leaderboard prizes are separate). */
export const GENESIS_QUEST_MAX_TASK_PPL_PER_PERSON = 3_000;

/** Referral: invitee has Human Passport, did a real action and is still active after 7 days. */
export const GENESIS_QUEST_REFERRAL_PPL = 500;
export const GENESIS_QUEST_MAX_INVITEES = 20;
/** Referrals and the leaderboard need Human Passport at this score (free stamps are enough). */
export const GENESIS_QUEST_PASSPORT_MIN_SCORE = 10;

/** Leaderboard prizes by rank (1-based). Sum = 6M. */
export const GENESIS_QUEST_LEADERBOARD = [
  { fromRank: 1, toRank: 1, ppl: 500_000 },
  { fromRank: 2, toRank: 10, ppl: 150_000 },
  { fromRank: 11, toRank: 100, ppl: 46_111 },
] as const;

export function leaderboardPrize(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1) return 0;
  const tier = GENESIS_QUEST_LEADERBOARD.find((t) => rank >= t.fromRank && rank <= t.toRank);
  return tier ? tier.ppl : 0;
}

export function leaderboardTotal(): number {
  return GENESIS_QUEST_LEADERBOARD.reduce((sum, t) => sum + (t.toRank - t.fromRank + 1) * t.ppl, 0);
}

/**
 * Unlock: fully locked 1 Dec 2026 – 1 Mar 2027. Then one ninth opens on the 1st of each month,
 * 1 Apr 2027 … 1 Dec 2027 (9 steps). Each monthly ninth opens only if the person made at least
 * one on-chain action in the month before it. Missed ninths stay locked (they do not catch up).
 * This is NOT the Founders season schedule (10% at once + 52 weeks, reward-rules.ts).
 */
export const GENESIS_QUEST_UNLOCK_STEPS = 9;
export const GENESIS_QUEST_FIRST_UNLOCK = { year: 2027, month: 4 } as const; // 1 April 2027 UTC

/** Unlock date of step i (0..8), 1st of the month, UTC. */
export function unlockDate(step: number): Date {
  return new Date(Date.UTC(GENESIS_QUEST_FIRST_UNLOCK.year, GENESIS_QUEST_FIRST_UNLOCK.month - 1 + step, 1));
}

export function computeUnlockedQuestReward(input: {
  totalReward: number;
  now: Date;
  /** True if the person made ≥1 on-chain action in the calendar month before unlock step `step`. */
  wasActiveBefore: (step: number) => boolean;
}): number {
  const { totalReward, now, wasActiveBefore } = input;
  if (!Number.isFinite(totalReward) || totalReward <= 0) return 0;
  const slice = totalReward / GENESIS_QUEST_UNLOCK_STEPS;
  let unlocked = 0;
  for (let step = 0; step < GENESIS_QUEST_UNLOCK_STEPS; step += 1) {
    if (now.getTime() < unlockDate(step).getTime()) break;
    if (wasActiveBefore(step)) unlocked += slice;
  }
  return unlocked;
}

/** Sanity: quest + Season 1 + referral pool fit inside the 50M program pool. */
export function programPoolBalanced(): boolean {
  return GENESIS_QUEST_POOL_PPL + FOUNDER_SEASON_1_POOL_PPL + REFERRAL_POOL_PPL === FOUNDER_PROGRAM_POOL_PPL;
}
