/**
 * Preliminary mainnet founder reward mechanics — display + unit tests.
 * See docs/FOUNDERS-AND-LAVKA-PLAN.md (track A) and /founders copy.
 */

/** 10% of personal founder reward unlocks at mainnet day one. */
export const MAINNET_INSTANT_UNLOCK_BPS = 1_000;

/** Remaining 90% vests in equal weekly slices over 12 months. */
export const MAINNET_VEST_WEEKS = 52;

/** Minimum qualifying actions per calendar month to keep vesting unpaused. */
export const MAINNET_MIN_ACTIONS_PER_MONTH = 1;

/** Early mainnet sale fee on unlocked PPL: 10% at launch, linear to 0% by day 30. */
export const EARLY_SALE_FEE_LAUNCH_BPS = 1_000;
export const EARLY_SALE_FEE_DAYS = 30;

/** +25% on the validator reward rate, not +25% of principal, and not a fixed yield promise. Paid from community pool. */
export const FOUNDER_STAKING_APR_BONUS_PERCENT = 25;

/** Matches the chain's staking.params.unbonding_time (21 days, see StakingApp.tsx). */
export const FOUNDER_STAKING_UNSTAKE_WAIT_DAYS = 21;

export function canAccrueFounderRewards(pohVerified: boolean): boolean {
  return pohVerified;
}

export function instantUnlockPortion(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return (totalAmount * MAINNET_INSTANT_UNLOCK_BPS) / 10_000;
}

export function weeklyVestSlice(totalAmount: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  const vestPool = totalAmount * (10_000 - MAINNET_INSTANT_UNLOCK_BPS) / 10_000;
  return vestPool / MAINNET_VEST_WEEKS;
}

export type VestingInput = {
  totalReward: number;
  pohVerified: boolean;
  /** How many full weeks have passed since mainnet (0 = launch week). */
  weeksElapsed: number;
  /** Return true if the user had ≥1 qualifying action in the calendar month of this week. */
  isWeekActive: (weekIndex: number) => boolean;
};

/**
 * Unlocked personal reward: 10% at once (if PoH), plus weekly slices of the 90%
 * only for weeks where the user stayed active (≥1 action that calendar month).
 * Inactive weeks pause vesting for that slice; they do not fast-forward.
 */
export function computeUnlockedPersonalReward(input: VestingInput): number {
  if (!canAccrueFounderRewards(input.pohVerified)) return 0;
  const { totalReward, weeksElapsed, isWeekActive } = input;
  if (!Number.isFinite(totalReward) || totalReward <= 0) return 0;

  let unlocked = instantUnlockPortion(totalReward);
  const slice = weeklyVestSlice(totalReward);
  const cappedWeeks = Math.min(Math.max(0, weeksElapsed), MAINNET_VEST_WEEKS);
  for (let w = 0; w < cappedWeeks; w += 1) {
    if (isWeekActive(w)) unlocked += slice;
  }
  return unlocked;
}

/**
 * Fee in basis points on selling unlocked PPL during the first 30 mainnet days.
 * Day 0 (launch): 10%. Day 30: 0%. Linear between.
 */
export function earlySaleFeeBps(daysSinceMainnetLaunch: number): number {
  if (!Number.isFinite(daysSinceMainnetLaunch) || daysSinceMainnetLaunch < 0) return 0;
  if (daysSinceMainnetLaunch >= EARLY_SALE_FEE_DAYS) return 0;
  const remaining = EARLY_SALE_FEE_DAYS - daysSinceMainnetLaunch;
  return Math.round((EARLY_SALE_FEE_LAUNCH_BPS * remaining) / EARLY_SALE_FEE_DAYS);
}

export function applyEarlySaleFee(
  saleAmount: number,
  daysSinceMainnetLaunch: number,
): { netToSeller: number; feeToCommunityPool: number } {
  if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
    return { netToSeller: 0, feeToCommunityPool: 0 };
  }
  const bps = earlySaleFeeBps(daysSinceMainnetLaunch);
  const feeToCommunityPool = (saleAmount * bps) / 10_000;
  return { netToSeller: saleAmount - feeToCommunityPool, feeToCommunityPool };
}

/** Applies +25% to the APR rate (e.g. 800 bps → 1000 bps). */
export function validatorAprWithFounderStakeBonus(baseAprBps: number): number {
  if (!Number.isFinite(baseAprBps) || baseAprBps < 0) return 0;
  return Math.round(baseAprBps * (1 + FOUNDER_STAKING_APR_BONUS_PERCENT / 100));
}
