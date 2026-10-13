/** Pure helpers for the swap page (kept separate so they can be unit tested). */
import { formatEther, formatUnits as formatUnitsViem, parseUnits as parseUnitsViem } from "viem";
import {
  AMM_FEE_BPS,
  minAmountOutWithSlippageBaseUnits,
  quoteExactInBaseUnits,
} from "./amm-math";

export type SwapPool = {
  nativeScale?: number;
  poolId: string;
  tokenAssetId: string;
  nativeAssetId: string;
  tokenReserve: number;
  nativeReserve: number;
  feeBps: number;
  status?: string;
  locked?: boolean;
  lpBalances?: Record<string, number>;
  lockedLpSupply?: number;
  totalLpSupply?: number;
};

/** Share of the pool's input reserve the trade takes, in percent (fee excluded). */
export function priceImpactPercent(reserveIn: number, amountIn: number): number {
  if (!(reserveIn > 0) || !(amountIn > 0)) return 0;
  return (amountIn / (reserveIn + amountIn)) * 100;
}

/** Token base units needed next to `ppl` PPL at the current pool ratio (rounded up). */
export function liquidityTokenForPpl(pool: Pick<SwapPool, "tokenReserve" | "nativeReserve">, ppl: number): number {
  if (!(pool.nativeReserve > 0) || !(pool.tokenReserve > 0) || !(ppl > 0)) return 0;
  return Math.ceil((ppl * pool.tokenReserve) / pool.nativeReserve);
}

/** Text for the amount field after a 25/50/75/MAX click. MAX keeps the PPL network fee. */
export function fractionOfBalance(input: {
  fraction: number;
  pplIn: boolean;
  pplBalance: number;
  tokenBalance: number;
  decimals: number;
  fee: number;
  pplWholeOnly: boolean;
}): string {
  const { fraction, pplIn, pplBalance, tokenBalance, decimals, fee, pplWholeOnly } = input;
  if (pplIn) {
    const spendable = Math.max(0, pplBalance - fee);
    const raw = spendable * fraction;
    if (pplWholeOnly) return String(Math.floor(raw));
    const micro = Math.floor(raw * 1_000_000);
    return trimZeros((micro / 1_000_000).toFixed(6));
  }
  const units = Math.floor(Math.max(0, tokenBalance) * fraction);
  if (decimals === 0) return String(units);
  const digits = String(units).padStart(decimals + 1, "0");
  return trimZeros(`${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`);
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * "1 PPL buys" spot rate: token units per 1 PPL.
 *
 * Both reserves must be human amounts. The EVM compat API
 * (`/api/evm/compat/liquidity-pools`) reports `nativeReserve` as PPL and
 * `tokenReserve` already divided by the token's decimals, so the ratio is the
 * rate directly — it must NOT be run through `formatUnits(rate, decimals)`,
 * which divides by 10^decimals a second time (the live TROSC/PPL pool showed
 * `0.108957` instead of `108,957`).
 */
export function spotTokenPerPpl(pool: { nativeReserve: number; tokenReserve: number }): number {
  if (!(pool.nativeReserve > 0) || !(pool.tokenReserve > 0)) return 0;
  return pool.tokenReserve / pool.nativeReserve;
}

export type PoolSwapQuote = {
  amountOutBaseUnits: bigint;
  minOutBaseUnits: bigint;
  /** Human token units (PPL→token) or human PPL (token→PPL). */
  amountOut: number;
  minOut: number;
};

function humanToBaseUnits(amount: number, decimals: number): bigint | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  try {
    return parseUnitsViem(String(amount), decimals);
  } catch {
    return null;
  }
}

/**
 * Preview quote for a pool whose reserves the API reports as human amounts.
 *
 * Reserves and the amount in are converted to on-chain base units (wei for PPL,
 * 10^decimals for the token) and quoted with the exact integer constant-product
 * (`quoteExactInBaseUnits`), then minOut is floored in base units. This is the
 * same arithmetic the pair contract uses, so the preview cannot drift by
 * 10^decimals and the "You receive"/"Minimum received" rows match what the
 * swap actually returns; the transaction still uses reserves read fresh from
 * the pair (see `EvmSwapApp`), not this snapshot.
 */
export function quotePoolSwap(input: {
  nativeReserve: number;
  tokenReserve: number;
  decimals: number;
  pplIn: boolean;
  amountInBaseUnits: bigint;
  slippageBps: number;
  feeBps?: number;
}): PoolSwapQuote | null {
  const { nativeReserve, tokenReserve, decimals, pplIn, amountInBaseUnits, slippageBps } = input;
  const ZERO = BigInt(0);
  if (!(nativeReserve > 0) || !(tokenReserve > 0) || amountInBaseUnits <= ZERO) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  const nativeWei = humanToBaseUnits(nativeReserve, 18);
  const tokenUnits = humanToBaseUnits(tokenReserve, decimals);
  if (nativeWei === null || tokenUnits === null) return null;
  const reserveIn = pplIn ? nativeWei : tokenUnits;
  const reserveOut = pplIn ? tokenUnits : nativeWei;
  if (reserveIn <= ZERO || reserveOut <= ZERO) return null;
  const feeBps = input.feeBps ?? AMM_FEE_BPS;
  try {
    const amountOutBaseUnits = quoteExactInBaseUnits(reserveIn, reserveOut, amountInBaseUnits, feeBps);
    const minOutBaseUnits = minAmountOutWithSlippageBaseUnits(amountOutBaseUnits, slippageBps);
    const human = (units: bigint) =>
      Number(pplIn ? formatUnitsViem(units, decimals) : formatEther(units));
    return {
      amountOutBaseUnits,
      minOutBaseUnits,
      amountOut: human(amountOutBaseUnits),
      minOut: human(minOutBaseUnits),
    };
  } catch {
    return null;
  }
}
