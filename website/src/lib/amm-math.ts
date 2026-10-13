/** Integer AMM quote helper mirroring protocol `calculateAmmSwapExactIn`. */

export const AMM_FEE_BPS = 30;
export const AMM_MINIMUM_LIQUIDITY = 1000;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const BPS = BigInt(10_000);

function atomicUnits(value: number, scale: number): number {
  if (scale !== 1 && scale !== 1_000_000) throw new Error("scale");
  const scaled = value * scale;
  const units = Math.round(scaled);
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(units) || Math.abs(scaled - units) > Math.max(1e-7, Math.abs(scaled) * Number.EPSILON * 2)) throw new Error("amount precision");
  return units;
}

export function integerSqrt(n: bigint): bigint {
  if (n < ZERO) throw new Error("Square root of negative");
  if (n < TWO) return n;
  let x0 = n;
  let x1 = (n >> ONE) + ONE;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x1 + n / x1) >> ONE;
  }
  return x0;
}

export function quoteExactIn(
  reserveIn: number,
  reserveOut: number,
  amountIn: number,
  feeBps = AMM_FEE_BPS,
  inScale = 1,
  outScale = 1
): { amountOut: number; lpFee: number } {
  reserveIn = atomicUnits(reserveIn, inScale);
  reserveOut = atomicUnits(reserveOut, outScale);
  amountIn = atomicUnits(amountIn, inScale);
  if (!Number.isSafeInteger(reserveIn) || reserveIn <= 0) throw new Error("reserveIn");
  if (!Number.isSafeInteger(reserveOut) || reserveOut <= 0) throw new Error("reserveOut");
  if (!Number.isSafeInteger(amountIn) || amountIn <= 0) throw new Error("amountIn");
  const rIn = BigInt(reserveIn);
  const rOut = BigInt(reserveOut);
  const dx = BigInt(amountIn);
  const feeMul = BPS - BigInt(feeBps);
  const dxWithFee = dx * feeMul;
  const amountOut = Number((dxWithFee * rOut) / (rIn * BPS + dxWithFee));
  const lpFee = Number(dx - (dx * feeMul) / BPS);
  return { amountOut: amountOut / outScale, lpFee: lpFee / inScale };
}

export function minAmountOutWithSlippage(quotedOut: number, slippageBps: number, scale = 1): number {
  quotedOut = atomicUnits(quotedOut, scale);
  if (!Number.isSafeInteger(quotedOut) || quotedOut < 0) throw new Error("quotedOut");
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("slippageBps");
  }
  return Number((BigInt(quotedOut) * (BPS - BigInt(slippageBps))) / BPS) / scale;
}

/**
 * Same constant-product quote as `quoteExactIn`, but entirely in bigint base units (wei for
 * PPL/WPPL, raw token units for any decimals) so it works for tokens with decimals other than
 * 6 and never needs an intermediate float. Mirrors `AmmMath.swapExactIn` in the pair contract.
 */
export function quoteExactInBaseUnits(
  reserveIn: bigint,
  reserveOut: bigint,
  amountIn: bigint,
  feeBps = AMM_FEE_BPS
): bigint {
  if (reserveIn <= ZERO || reserveOut <= ZERO) throw new Error("reserve");
  if (amountIn <= ZERO) throw new Error("amountIn");
  const feeMul = BPS - BigInt(feeBps);
  const amountInWithFee = amountIn * feeMul;
  const denominator = reserveIn * BPS + amountInWithFee;
  return (amountInWithFee * reserveOut) / denominator;
}

/** Bigint-base-units counterpart of `minAmountOutWithSlippage`: no float, no scale argument. */
export function minAmountOutWithSlippageBaseUnits(amountOut: bigint, slippageBps: number): bigint {
  if (amountOut < ZERO) throw new Error("amountOut");
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("slippageBps");
  }
  return (amountOut * (BPS - BigInt(slippageBps))) / BPS;
}
