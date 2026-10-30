/** Preliminary — see docs/founder-nft.md */

export const FOUNDER_GOAL = 1_000_000;

export const EARLY_TIER_1_MAX = 10_000;
export const EARLY_TIER_2_MAX = 100_000;
export const EARLY_TIER_3_MAX = 1_000_000;

export const EARLY_MULTIPLIER_TIER_1 = 5;
export const EARLY_MULTIPLIER_TIER_2 = 3;
export const EARLY_MULTIPLIER_TIER_3 = 1.5;
export const EARLY_MULTIPLIER_DEFAULT = 1;

export type FounderActionType =
  | "swap"
  | "stake"
  | "discover_reaction"
  | "discover_follow"
  | "token_launch"
  | "nft_mint"
  | "pool_create"
  | "governance_vote"
  | "invite";

export const FOUNDER_ACTION_TYPES: readonly FounderActionType[] = [
  "swap",
  "stake",
  "discover_reaction",
  "discover_follow",
  "token_launch",
  "nft_mint",
  "pool_create",
  "governance_vote",
  "invite",
];

export type FounderActionConfig = {
  basePoints: number;
  dailyCap: number;
};

/** Base points and per-action daily caps (preliminary). */
export const FOUNDER_ACTION_CONFIG: Record<FounderActionType, FounderActionConfig> = {
  swap: { basePoints: 50, dailyCap: 3 },
  stake: { basePoints: 50, dailyCap: 3 },
  discover_reaction: { basePoints: 2, dailyCap: 30 },
  discover_follow: { basePoints: 5, dailyCap: 20 },
  token_launch: { basePoints: 200, dailyCap: 2 },
  nft_mint: { basePoints: 100, dailyCap: 5 },
  pool_create: { basePoints: 150, dailyCap: 3 },
  governance_vote: { basePoints: 25, dailyCap: 10 },
  invite: { basePoints: 300, dailyCap: 50 },
};

/** Minimum swap notional in PPL (human units) to qualify for swap points. */
export const FOUNDER_SWAP_MIN_PPL = 10;

/** Minimum new-delegation notional in PPL to qualify for stake points (same anti-farming bar as swap). */
export const FOUNDER_STAKE_MIN_PPL = 10;

/** Token launch points only after at least this many verified holders. */
export const TOKEN_LAUNCH_MIN_VERIFIED_HOLDERS = 10;

/** Daily cap on pre-entry-multiplier base points (verification factor applied first). */
export const FOUNDER_DAILY_TOTAL_CAP = 1_000;

export const FOUNDERS_MAX_PER_DEVICE = 3;
export const FOUNDERS_MAX_PER_IP = 10;

export function earlyEntryMultiplier(founderNumber: number): number {
  if (!Number.isFinite(founderNumber) || founderNumber < 1) {
    return EARLY_MULTIPLIER_DEFAULT;
  }
  if (founderNumber <= EARLY_TIER_1_MAX) return EARLY_MULTIPLIER_TIER_1;
  if (founderNumber <= EARLY_TIER_2_MAX) return EARLY_MULTIPLIER_TIER_2;
  if (founderNumber <= EARLY_TIER_3_MAX) return EARLY_MULTIPLIER_TIER_3;
  return EARLY_MULTIPLIER_DEFAULT;
}

const ISO_COUNTRY = /^[A-Z]{2}$/;

export function normalizeCountryCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  if (!ISO_COUNTRY.test(code)) return null;
  if (code === "XX" || code === "ZZ") return null;
  return code;
}

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function isFounderActionType(value: string): value is FounderActionType {
  return (FOUNDER_ACTION_TYPES as readonly string[]).includes(value);
}

export function meetsTokenLaunchHolderGate(verifiedHolderCount: number): boolean {
  return (
    Number.isFinite(verifiedHolderCount) &&
    verifiedHolderCount >= TOKEN_LAUNCH_MIN_VERIFIED_HOLDERS
  );
}
