import { formatUnits } from "viem";

/** PPL's base EVM denom ("appl") already uses 18 decimals, same as wei. */
const PPL_DECIMALS = 18;
/** The SDK `Dec` type backing `commission` and `DecCoin.amount` always has 18-digit precision. */
const DEC_PRECISION = 18;

/** `Validator.commission` is an SDK `Dec` fraction of 1 (e.g. 10% -> 1e17). Returns a 0-100 percent. */
export function commissionPercent(commission: bigint): number {
  return Number(formatUnits(commission, DEC_PRECISION)) * 100;
}

/**
 * `DecCoin.amount` holds a `Dec`-scaled quantity of the "appl" denom (itself 18 decimals),
 * so converting to whole PPL divides out both the Dec precision and the denom's own decimals.
 */
export function decCoinToPpl(amount: bigint, precision: number): number {
  return Number(formatUnits(amount, precision + PPL_DECIMALS));
}

/** Plain `Coin.amount` (delegation balances, undelegate amounts) is already in "appl" = wei-style units. */
export function coinToPpl(amount: bigint): number {
  return Number(formatUnits(amount, PPL_DECIMALS));
}

export function sumDecCoinsPpl(coins: ReadonlyArray<{ amount: bigint; precision: number }>): number {
  return coins.reduce((sum, coin) => sum + decCoinToPpl(coin.amount, coin.precision), 0);
}

/** Network-wide share of one validator's stake, as a 0-100 percent. */
export function networkSharePercent(validatorTokens: bigint, totalBondedTokens: bigint): number {
  if (totalBondedTokens <= BigInt(0)) return 0;
  return (Number(validatorTokens) / Number(totalBondedTokens)) * 100;
}

/**
 * Rough, non-guaranteed APR estimate from a validator's own commission and current reward
 * pressure: callers must label this clearly as an estimate, never a promise.
 */
export function estimateAprPercent(validatorRewardsPpl: number, validatorStakePpl: number, commissionPct: number, epochsPerYear: number): number {
  if (validatorStakePpl <= 0 || epochsPerYear <= 0) return 0;
  const perEpochRate = validatorRewardsPpl / validatorStakePpl;
  const grossAnnual = perEpochRate * epochsPerYear * 100;
  return grossAnnual * (1 - commissionPct / 100);
}

export function secondsToDaysLabel(seconds: number): number {
  return Math.round((seconds / 86_400) * 10) / 10;
}
