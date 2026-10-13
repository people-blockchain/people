import { test } from "node:test";
import assert from "node:assert/strict";
import {
  integerSqrt,
  minAmountOutWithSlippage,
  minAmountOutWithSlippageBaseUnits,
  quoteExactIn,
  quoteExactInBaseUnits,
} from "../src/lib/amm-math.ts";

test("AMM quote floors output and keeps k non-decreasing", () => {
  const reserveIn = 1_000_000;
  const reserveOut = 2_000_000;
  const amountIn = 10_000;
  const { amountOut, lpFee } = quoteExactIn(reserveIn, reserveOut, amountIn);
  const kBefore = BigInt(reserveIn) * BigInt(reserveOut);
  const kAfter = BigInt(reserveIn + amountIn) * BigInt(reserveOut - amountOut);
  assert.ok(kAfter >= kBefore);
  assert.equal(amountOut, Number((10_000n * 9970n * 2_000_000n) / (1_000_000n * 10_000n + 10_000n * 9970n)));
  assert.equal(lpFee, 30);
});

test("slippage guard and integer sqrt", () => {
  assert.equal(minAmountOutWithSlippage(1000, 50), 995);
  assert.equal(integerSqrt(99n), 9n);
});

test("micro-PPL pools quote fractional reserves, output and slippage in atomic units", () => {
  const { amountOut, lpFee } = quoteExactIn(123.75, 1_000_000, 0.1, 30, 1_000_000, 1);
  assert.equal(amountOut, Number(100_000n * 9970n * 1_000_000n / (123_750_000n * 10000n + 100_000n * 9970n)));
  assert.equal(lpFee, 0.0003);
  const sale = quoteExactIn(1_000_000, 123.75, 10_000, 30, 1, 1_000_000);
  const minimum = minAmountOutWithSlippage(sale.amountOut, 50, 1_000_000);
  assert.equal(minimum, Number(BigInt(Math.round(sale.amountOut * 1e6)) * 9950n / 10000n) / 1e6);
  assert.throws(() => quoteExactIn(123.75, 1_000_000, 0.0000001, 30, 1_000_000, 1), /precision/);
});

test("quoteExactInBaseUnits matches AmmMath.swapExactIn for a 6-decimal token (M09-1)", () => {
  const reserveIn = 1000n * 10n ** 18n; // 1000 PPL, wei
  const reserveOut = 1_000_000n * 10n ** 6n; // 1,000,000 tokens at 6 decimals
  const amountIn = 10n * 10n ** 18n; // 10 PPL, wei
  const amountOut = quoteExactInBaseUnits(reserveIn, reserveOut, amountIn);
  const amountInWithFee = amountIn * 9970n;
  const expected = (amountInWithFee * reserveOut) / (reserveIn * 10_000n + amountInWithFee);
  assert.equal(amountOut, expected);
  // ~9774 whole tokens, i.e. ~9774 * 1e6 base units — not 9774 base units, which is the bug
  // M09-1 fixes (amountOutMin passed to the router must be base units, not whole tokens).
  assert.ok(amountOut > 9_000_000_000n && amountOut < 10_000_000_000n);

  const amountOutMin = minAmountOutWithSlippageBaseUnits(amountOut, 100);
  assert.equal(amountOutMin, (amountOut * 9900n) / 10_000n);
});

test("quoteExactInBaseUnits works for 18-decimal tokens and fractional-PPL wei reserves", () => {
  const reserveIn = BigInt(Math.round(121.77 * 1e18)); // fractional PPL reserve, in wei
  const reserveOut = 1_000_000n * 10n ** 18n; // 18-decimal token
  const amountIn = 1n * 10n ** 18n;
  const amountOut = quoteExactInBaseUnits(reserveIn, reserveOut, amountIn);
  assert.ok(amountOut > 0n);
  const amountOutMin = minAmountOutWithSlippageBaseUnits(amountOut, 300);
  assert.ok(amountOutMin > 0n && amountOutMin < amountOut);
});

test("quoteExactInBaseUnits rejects empty reserves or amount", () => {
  assert.throws(() => quoteExactInBaseUnits(0n, 100n, 10n));
  assert.throws(() => quoteExactInBaseUnits(100n, 0n, 10n));
  assert.throws(() => quoteExactInBaseUnits(100n, 100n, 0n));
});
