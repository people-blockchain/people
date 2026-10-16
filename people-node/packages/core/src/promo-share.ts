/**
 * Optional creator promo share — node-side implementation of the owner decision of 2026-10-13
 * (per-recipient cap, award bound and vesting shape approved 2026-10-16, PR #298).
 *
 * This is the `people-node` consensus counterpart of the already-merged Solidity logic:
 *   - `contracts/src/libs/CurveMath.sol` → `calculateAllocationWithPromo` / `requireValidPromoBps`
 *   - `contracts/src/promo/PromoRewardsVault.sol` → the pool rules enforced below
 *   - `docs/TOKEN-ECONOMY.md` §4a, `docs/PROTOCOL-DECISIONS.md`
 *
 * At launch a creator may set aside `promoBps` of total supply — exactly 0, 500 or 1000 and
 * nothing in between — to reward referrers and partners. The share is carved **entirely out of
 * the bonding-curve portion** (60% → 55% → 50%); the mandatory 10% Community Pool, the 15%
 * creator allocation, the 10% liquidity reserve and the 5% ecosystem reserve are untouched at
 * every promo share.
 *
 * Promo tokens are never credited to the creator's account. They sit in a `PromoPoolState`
 * record — the node-side equivalent of the ownerless `PromoRewardsVault` — and may only leave it
 * towards an awarded recipient or, after the window, towards the token's Community Pool.
 *
 * **Clock.** The Solidity vault runs on `block.timestamp` and `180 days`. The node has no
 * trusted wall clock in state transitions, so the pool runs on block heights and reuses the
 * creator-vesting horizon `PROMO_VESTING_BLOCKS` (5,184,000 blocks ≈ 180 days at 3 s/block),
 * exactly as `CreatorVestingState.durationBlocks` already does. The promo window is the same
 * horizon, mirroring `PROMO_WINDOW = VESTING_DURATION`.
 *
 * **Activation.** Everything here is gated on `promoShareActive` — a coordinated activation
 * height configured via `PROMO_SHARE_UPGRADE_HEIGHT`, the same pattern as `securityUpgrade` and
 * `consensusUpgrade1`. Below the height (or with the env unset) a `tokenCreate` ignores
 * `promoBps` entirely and produces byte-identical state to the pre-upgrade binary, so historical
 * blocks replay unchanged.
 */

import type { NetworkConfig, TokenAllocation } from "@ovn/protocol";

/** No promo share. The default, and the only value accepted before activation. */
export const PROMO_BPS_NONE = 0;
/** 5% of total supply. Bonding curve becomes 55%. */
export const PROMO_BPS_LOW = 500;
/** 10% of total supply. Bonding curve becomes 50%. */
export const PROMO_BPS_HIGH = 1000;

/** The complete set of accepted promo shares. Anything else is rejected. */
export const PROMO_ACCEPTED_BPS: readonly number[] = [PROMO_BPS_NONE, PROMO_BPS_LOW, PROMO_BPS_HIGH];

/** A single recipient may be awarded at most 1000 bps (10%) of the pool, in total. */
export const PROMO_RECIPIENT_CAP_BPS = 1000;
/** ...across at most this many separate awards. */
export const PROMO_MAX_AWARDS_PER_RECIPIENT = 16;
/** Share of each award unlocked at award time; the rest vests linearly. */
export const PROMO_UPFRONT_PERCENT = 10;
/** 180 days at 3 s/block — the same horizon as `CreatorVestingState.durationBlocks`. */
export const PROMO_VESTING_BLOCKS = 5_184_000;
/** Awards are only possible in `[startBlock, startBlock + PROMO_WINDOW_BLOCKS)`. */
export const PROMO_WINDOW_BLOCKS = PROMO_VESTING_BLOCKS;

/** One award tranche, vesting on its own clock. Mirrors `PromoRewardsVault.Award`. */
export interface PromoAward {
  total: number;
  claimed: number;
  startBlock: number;
}

/** Node-side promo pool. Mirrors `PromoRewardsVault.Pool` plus the per-recipient award list. */
export interface PromoPoolState {
  assetId: string;
  /** The launching creator — the only address allowed to award from this pool. */
  creator: string;
  /** 500 or 1000. A pool is never created for 0. */
  promoBps: number;
  /** Promo tokens carved out of the curve portion at launch. */
  total: number;
  /** Cumulative amount committed to recipients. Never decreases. */
  awarded: number;
  /** Cumulative amount actually paid out to recipients. */
  claimed: number;
  /** Launch height. */
  startBlock: number;
  /** Per-award vesting duration, stored so a later constant change cannot rewrite history. */
  durationBlocks: number;
  /** Award window length, stored for the same reason. */
  windowBlocks: number;
  /** True once the undistributed remainder went to the Community Pool. */
  closed: boolean;
  /** recipient → award tranches. Insertion order is transaction order, so it is deterministic. */
  awards: Record<string, PromoAward[]>;
}

/* -------------------------------------------------------------------------- */
/* Coordinated activation height                                              */
/* -------------------------------------------------------------------------- */

/**
 * Coordinated activation height for the optional creator promo share.
 * Same shape and rails as `readSecurityUpgrade` / `readConsensusUpgrade1`: an unset or empty
 * value means the feature never activates and the node keeps pre-upgrade behaviour exactly.
 */
export function readPromoShareUpgrade(env: NodeJS.ProcessEnv): NetworkConfig["promoShareUpgrade"] {
  const heightRaw = env.PROMO_SHARE_UPGRADE_HEIGHT?.trim();
  if (!heightRaw) {
    return undefined;
  }
  if (!/^\d+$/.test(heightRaw)) throw new Error("Invalid PROMO_SHARE_UPGRADE_HEIGHT");
  const height = Number(heightRaw);
  if (!Number.isSafeInteger(height)) throw new Error("Invalid PROMO_SHARE_UPGRADE_HEIGHT");
  return { height };
}

export function promoShareActive(config: NetworkConfig, height: number): boolean {
  return !!config.promoShareUpgrade && height > 0 && height >= config.promoShareUpgrade.height;
}

export function withoutPromoShareUpgrade(config: NetworkConfig): NetworkConfig {
  const { promoShareUpgrade: _upgrade, ...legacy } = config;
  return legacy;
}

/* -------------------------------------------------------------------------- */
/* Validation and allocation                                                  */
/* -------------------------------------------------------------------------- */

/** Mirrors `CurveMath.requireValidPromoBps`: only 0 / 500 / 1000, nothing in between. */
export function requireValidPromoBps(promoBps: number): void {
  if (!PROMO_ACCEPTED_BPS.includes(promoBps)) {
    throw new Error(`Invalid promo share: ${promoBps} bps (only 0, 500 or 1000 are accepted)`);
  }
}

/**
 * Read `promoBps` off a `tokenCreate` payload.
 *
 * `active === false` is the pre-activation path: the field is ignored exactly as a pre-upgrade
 * binary ignores an unknown payload key, so a block that happens to carry it still produces
 * byte-identical state on both binaries. Node-local mempool admission refuses such a transaction
 * separately, so a creator gets a clear error instead of a silent 0.
 *
 * When active, an absent, `null` or `undefined` field is the default 0; anything else must parse
 * to exactly one of the three accepted shares.
 */
export function parsePromoBps(payload: Record<string, unknown> | undefined, active: boolean): number {
  if (!active) {
    return PROMO_BPS_NONE;
  }
  const raw = payload?.promoBps;
  if (raw === undefined || raw === null) {
    return PROMO_BPS_NONE;
  }
  if (typeof raw !== "number") {
    throw new Error("promoBps must be a number");
  }
  requireValidPromoBps(raw);
  return raw;
}

/**
 * Promo amount for a supply and share. Mirrors `CurveMath.calculateAllocationWithPromo`'s plain
 * division: `floor(s * 500 / 10_000) === floor(s / 20)` and `floor(s * 1000 / 10_000) ===
 * floor(s / 10)`, so no intermediate can overflow at any supply the fixed split itself survives.
 */
export function promoAmount(totalSupply: number, promoBps: number): number {
  requireValidPromoBps(promoBps);
  if (promoBps === PROMO_BPS_LOW) return Number(BigInt(totalSupply) / 20n);
  if (promoBps === PROMO_BPS_HIGH) return Number(BigInt(totalSupply) / 10n);
  return 0;
}

/**
 * The standard launch split with the promo share carved out of the curve portion.
 * `promoBps === 0` returns the base allocation object unchanged — same five keys, same values,
 * same key order — and `promo === 0`.
 */
export function applyPromoToAllocation(
  allocation: TokenAllocation,
  totalSupply: number,
  promoBps: number
): { allocation: TokenAllocation; promo: number } {
  const promo = promoAmount(totalSupply, promoBps);
  if (promo === 0) {
    return { allocation, promo: 0 };
  }
  // Cannot underflow: `promo` is at most 10% of supply while `bondingCurve` is ~60% of it.
  return {
    allocation: { ...allocation, bondingCurve: allocation.bondingCurve - promo, promo },
    promo
  };
}

/* -------------------------------------------------------------------------- */
/* Pool rules                                                                 */
/* -------------------------------------------------------------------------- */

export function createPromoPool(
  assetId: string,
  creator: string,
  promoBps: number,
  total: number,
  startBlock: number
): PromoPoolState {
  requireValidPromoBps(promoBps);
  if (promoBps === PROMO_BPS_NONE) {
    throw new Error("A promo pool is never created for a zero promo share");
  }
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error("Promo pool total must be a positive safe integer");
  }
  return {
    assetId,
    creator,
    promoBps,
    total,
    awarded: 0,
    claimed: 0,
    startBlock,
    durationBlocks: PROMO_VESTING_BLOCKS,
    windowBlocks: PROMO_WINDOW_BLOCKS,
    closed: false,
    awards: {}
  };
}

/** First height at which no further award is possible and `promoReturn` opens. */
export function promoDeadline(pool: PromoPoolState): number {
  return pool.startBlock + pool.windowBlocks;
}

/** The per-recipient anti-abuse cap for this pool, in token base units. */
export function promoRecipientCap(pool: PromoPoolState): number {
  return Number((BigInt(pool.total) * BigInt(PROMO_RECIPIENT_CAP_BPS)) / 10_000n);
}

/** Promo tokens the creator may still hand out. */
export function promoUndistributed(pool: PromoPoolState): number {
  return pool.closed ? 0 : pool.total - pool.awarded;
}

/** Cumulative amount awarded to `recipient`, vested or not. */
export function promoAwardedTo(pool: PromoPoolState, recipient: string): number {
  return (pool.awards[recipient] ?? []).reduce((sum, award) => sum + award.total, 0);
}

/**
 * Vested portion of one award: `PROMO_UPFRONT_PERCENT` unlocked at award height, the remainder
 * linear over `durationBlocks`. Same shape as `calculateVestedAmount` for creator vesting.
 */
export function promoVestedOfAward(award: PromoAward, durationBlocks: number, height: number): number {
  const upfront = Number((BigInt(award.total) * BigInt(PROMO_UPFRONT_PERCENT)) / 100n);
  if (height <= award.startBlock) {
    return upfront;
  }
  const elapsed = height - award.startBlock;
  if (elapsed >= durationBlocks) {
    return award.total;
  }
  const linear = (BigInt(award.total - upfront) * BigInt(elapsed)) / BigInt(durationBlocks);
  return Number(BigInt(upfront) + linear);
}

export function promoVestedOf(pool: PromoPoolState, recipient: string, height: number): number {
  return (pool.awards[recipient] ?? []).reduce(
    (sum, award) => sum + promoVestedOfAward(award, pool.durationBlocks, height),
    0
  );
}

export function promoClaimableOf(pool: PromoPoolState, recipient: string, height: number): number {
  const claimed = (pool.awards[recipient] ?? []).reduce((sum, award) => sum + award.claimed, 0);
  return Math.max(0, promoVestedOf(pool, recipient, height) - claimed);
}

/**
 * Creator commits `amount` promo tokens to `recipient`. Mirrors `PromoRewardsVault.award`:
 * creator-only, third parties only, inside the window, within the per-recipient cap and the
 * 16-award bound. The tokens stay in the pool; the recipient claims them as they vest.
 *
 * `forbiddenRecipients` carries the protocol-side destinations the caller knows about (the
 * genesis faucet, the pinned bootstrap authority) — the node has no token or vault *address* to
 * exclude, since the pool is a state record rather than a contract account.
 */
export function awardPromo(
  pool: PromoPoolState,
  sender: string,
  recipient: string,
  amount: number,
  height: number,
  forbiddenRecipients: readonly string[] = []
): PromoAward {
  if (sender !== pool.creator) {
    throw new Error("Only the token creator can award promo tokens");
  }
  if (pool.closed) {
    throw new Error("Promo pool has already returned its remainder");
  }
  if (height >= promoDeadline(pool)) {
    throw new Error(`Promo window closed at height ${promoDeadline(pool)}`);
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Promo award amount must be a positive safe integer");
  }
  // Anti-abuse: the creator must not be able to route promo tokens back to themselves, and a
  // protocol-controlled address is not a payable destination.
  if (recipient === pool.creator || forbiddenRecipients.includes(recipient)) {
    throw new Error("Invalid promo recipient");
  }
  if (amount > pool.total - pool.awarded) {
    throw new Error("Promo award exceeds the undistributed pool");
  }
  const list = pool.awards[recipient] ?? [];
  if (list.length >= PROMO_MAX_AWARDS_PER_RECIPIENT) {
    throw new Error(`A recipient may receive at most ${PROMO_MAX_AWARDS_PER_RECIPIENT} promo awards`);
  }
  if (promoAwardedTo(pool, recipient) + amount > promoRecipientCap(pool)) {
    throw new Error("Promo award exceeds the per-recipient cap");
  }

  const award: PromoAward = { total: amount, claimed: 0, startBlock: height };
  pool.awarded += amount;
  pool.awards[recipient] = [...list, award];
  return award;
}

/**
 * Recipient withdraws everything vested so far. Mirrors `PromoRewardsVault.claim`; returns the
 * amount to credit to the recipient's token balance.
 */
export function claimPromo(pool: PromoPoolState, recipient: string, height: number): number {
  const list = pool.awards[recipient];
  if (!list || list.length === 0) {
    throw new Error("No promo awards for this address");
  }
  let amount = 0;
  for (const award of list) {
    const vested = promoVestedOfAward(award, pool.durationBlocks, height);
    if (vested > award.claimed) {
      amount += vested - award.claimed;
      award.claimed = vested;
    }
  }
  if (amount <= 0) {
    throw new Error("No claimable promo tokens at this block height");
  }
  pool.claimed += amount;
  return amount;
}

/**
 * After the window, every promo token the creator never awarded leaves the pool. Mirrors
 * `PromoRewardsVault.returnUnused`: permissionless, nothing returns to the creator, and
 * already-awarded tokens stay claimable by their recipients. Returns the amount the caller must
 * credit to this token's Community Pool allocation.
 */
export function returnUnusedPromo(pool: PromoPoolState, height: number): number {
  if (height < promoDeadline(pool)) {
    throw new Error(`Promo window is open until height ${promoDeadline(pool)}`);
  }
  if (pool.closed) {
    throw new Error("Promo pool has already returned its remainder");
  }
  const amount = pool.total - pool.awarded;
  pool.closed = true;
  return amount;
}
