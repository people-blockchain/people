import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { quotePoolSwap, spotTokenPerPpl, priceImpactPercent } from "../src/lib/swap-math.ts";
import { minAmountOutWithSlippageBaseUnits, quoteExactInBaseUnits } from "../src/lib/amm-math.ts";

// Live TROSC/PPL pool (chain 97401): 13,267,783.99 TROSC (6 decimals) against 121.77 PPL.
const TROSC = { nativeReserve: 121.77, tokenReserve: 13267783.993786, decimals: 6 };

test("spot rate is token units per PPL, not divided by 10^decimals again", () => {
  const rate = spotTokenPerPpl(TROSC);
  assert.ok(Math.abs(rate - 108_957.4) < 0.5, `rate=${rate}`);
  // The bug was rendering formatUnits(rate, 6) = 0.108957 (off by 1e6).
  assert.ok(rate > 1000, "rate must be human units, not base units");
});

test("6-decimal quote: You receive / minOut match the integer contract math", () => {
  const amountInBaseUnits = parseEther("1"); // 1 PPL in
  const q = quotePoolSwap({ ...TROSC, pplIn: true, amountInBaseUnits, slippageBps: 100 });
  assert.ok(q, "quote");
  const expected = quoteExactInBaseUnits(parseEther("121.77"), 13267783993786n, amountInBaseUnits);
  assert.equal(q.amountOutBaseUnits, expected);
  assert.equal(q.minOutBaseUnits, minAmountOutWithSlippageBaseUnits(expected, 100));
  // Constant product with ~0.82% impact on a 121.77 PPL pool: just under 108,957.4 * 0.997.
  assert.equal(q.amountOut, Number(expected) / 1e6);
  assert.ok(q.amountOut > 107_000 && q.amountOut < 108_600, `amountOut=${q.amountOut}`);
  assert.ok(Math.abs(q.minOut - q.amountOut * 0.99) < 0.01, `minOut=${q.minOut}`);
});

test("6-decimal quote: token in, PPL out", () => {
  const q = quotePoolSwap({ ...TROSC, pplIn: false, amountInBaseUnits: 1_000_000n, slippageBps: 100 });
  assert.ok(q, "quote");
  // 1 TROSC in → roughly 1 / 108,957 PPL, i.e. ~9.18e-6 PPL (fee brings it just under).
  assert.ok(q.amountOut > 0 && q.amountOut < 1e-4, `amountOut=${q.amountOut}`);
});

test("18-decimal token quotes in the right unit", () => {
  const pool = { nativeReserve: 1000, tokenReserve: 2000, decimals: 18 };
  assert.equal(spotTokenPerPpl(pool), 2);
  const q = quotePoolSwap({ ...pool, pplIn: true, amountInBaseUnits: parseEther("1"), slippageBps: 50 });
  assert.ok(q, "quote");
  assert.equal(q.amountOutBaseUnits, quoteExactInBaseUnits(parseEther("1000"), 2000n * 10n ** 18n, parseEther("1")));
  // 2 tokens/PPL with ~0.1% impact, minus the 0.30% fee.
  assert.ok(Math.abs(q.amountOut - 1.992) < 0.005, `amountOut=${q.amountOut}`);
  assert.equal(q.minOutBaseUnits, minAmountOutWithSlippageBaseUnits(q.amountOutBaseUnits, 50));
});

test("quote rejects unusable pools and amounts", () => {
  assert.equal(quotePoolSwap({ ...TROSC, pplIn: true, amountInBaseUnits: 0n, slippageBps: 100 }), null);
  assert.equal(quotePoolSwap({ ...TROSC, nativeReserve: 0, pplIn: true, amountInBaseUnits: 1n, slippageBps: 100 }), null);
  assert.equal(quotePoolSwap({ ...TROSC, tokenReserve: 0, pplIn: true, amountInBaseUnits: 1n, slippageBps: 100 }), null);
});

test("price impact stays in human units", () => {
  // 1 PPL into a 121.77 PPL pool ≈ 0.81%.
  assert.ok(Math.abs(priceImpactPercent(121.77, 1) - 0.8148) < 0.001);
});
