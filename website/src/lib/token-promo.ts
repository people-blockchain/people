/**
 * Optional creator promo share for a token launch (owner decision 2026-10-13).
 *
 * Mirrors `contracts/src/libs/CurveMath.sol` (`calculateAllocationWithPromo`) and
 * `contracts/src/PeopleConstants.sol`. Only 0, 500 and 1000 bps exist on chain — the contract
 * reverts with `InvalidPromoBps` on anything else — so this is a fixed three-way choice, not a
 * free-form basis-point input.
 */

export const PROMO_BPS_OPTIONS = [0, 500, 1000] as const;

export type PromoBps = (typeof PROMO_BPS_OPTIONS)[number];

/** `PeopleConstants.PROMO_RECIPIENT_CAP_BPS` — per-recipient cap, in bps of the promo pool. */
export const PROMO_RECIPIENT_CAP_BPS = 1000;
/** `PeopleConstants.PROMO_WINDOW` / `VESTING_DURATION`, in days. */
export const PROMO_WINDOW_DAYS = 180;
/** `PeopleConstants.PROMO_UPFRONT_PERCENT` — unlocked at award time, the rest vests linearly. */
export const PROMO_UPFRONT_PERCENT = 10;

export function isPromoBps(value: number): value is PromoBps {
  return (PROMO_BPS_OPTIONS as readonly number[]).includes(value);
}

export type LaunchAllocation = {
  bondingCurve: bigint;
  communityPool: bigint;
  creator: bigint;
  liquidityReserve: bigint;
  ecosystemReserve: bigint;
  promo: bigint;
};

/**
 * The launch split, with an optional promo share taken **out of the bonding-curve portion**.
 *
 * The community pool, creator allocation, liquidity reserve and ecosystem reserve are identical
 * at every promo share; only the curve shrinks (60% -> 55% -> 50%). Floor division everywhere,
 * exactly as the contract does it, so `sum(allocation) === totalSupply` always holds.
 */
export function launchAllocation(totalSupply: bigint, promoBps: PromoBps): LaunchAllocation {
  // `BigInt(n)` rather than `n` literals: the project targets ES2017 (see `tsconfig.json`).
  const hundred = BigInt(100);
  const communityPool = (totalSupply * BigInt(10)) / hundred;
  const creator = (totalSupply * BigInt(15)) / hundred;
  const liquidityReserve = (totalSupply * BigInt(10)) / hundred;
  const ecosystemReserve = (totalSupply * BigInt(5)) / hundred;
  // `promoBps` is 0, 500 or 1000, i.e. nothing, a twentieth or a tenth — same plain division the
  // contract uses.
  const promo =
    promoBps === 500
      ? totalSupply / BigInt(20)
      : promoBps === 1000
        ? totalSupply / BigInt(10)
        : BigInt(0);
  const bondingCurve =
    totalSupply - (communityPool + creator + liquidityReserve + ecosystemReserve) - promo;
  return { bondingCurve, communityPool, creator, liquidityReserve, ecosystemReserve, promo };
}

/** Percentage of total supply a bucket represents, for display only. */
export function allocationPercent(amount: bigint, totalSupply: bigint): number {
  if (totalSupply === BigInt(0)) return 0;
  return Number((amount * BigInt(10_000)) / totalSupply) / 100;
}
