import assert from "node:assert/strict";
import { test } from "node:test";

import { CURVE, SALE } from "./config.ts";
import {
  curveSamplesByRaise,
  graduation,
  graduationProgress,
  maxRaiseUsd,
  milestones,
  quoteBuy,
  quoteSell,
  raisedUsd,
  soldPplForRaisedUsd,
  spotPriceUsd,
} from "./curve.ts";

/** Relative tolerance: the reference table in `ppl-curve-final.md` is rounded to 5 dp. */
function closeTo(actual: number, expected: number, rel = 1e-4) {
  const delta = Math.abs(actual - expected);
  assert.ok(
    delta <= Math.abs(expected) * rel,
    `expected ${actual} to be within ${rel * 100}% of ${expected}`,
  );
}

test("price starts at $0.005 and tops out at the $0.25 ceiling", () => {
  closeTo(spotPriceUsd(0), 0.005);
  closeTo(spotPriceUsd(CURVE.supplyPpl), CURVE.ceilingPriceUsd);
  // The ceiling is a ceiling: asking past the supply cannot push the price higher.
  closeTo(spotPriceUsd(CURVE.supplyPpl * 2), CURVE.ceilingPriceUsd);
});

test("milestone table matches ppl-curve-final.md", () => {
  const rows: [number, number, number][] = [
    // raised $, PPL sold, spot price
    [100_000, 14.77e6, 0.00891],
    [500_000, 40.69e6, 0.02456],
    [1_000_000, 55.66e6, 0.04412],
    [2_000_000, 71.89e6, 0.08324],
    [4_000_000, 88.83e6, 0.16148],
  ];
  for (const [raise, sold, price] of rows) {
    closeTo(soldPplForRaisedUsd(raise), sold, 1e-3);
    closeTo(spotPriceUsd(soldPplForRaisedUsd(raise)), price, 1e-3);
  }
});

test("theoretical max raise is $6.263M, graduation comes first", () => {
  closeTo(maxRaiseUsd(), 6_263_000, 1e-3);
  assert.ok(CURVE.graduationRaiseUsd < maxRaiseUsd());
});

test("graduation is $4M at ~88.83M sold and ~$0.1615", () => {
  const g = graduation();
  assert.equal(g.raisedUsd, 4_000_000);
  closeTo(g.soldPpl, 88.83e6, 1e-3);
  closeTo(g.priceUsd, 0.16148, 1e-3);
  // ~11.17M PPL left unsold on the curve at graduation.
  closeTo(CURVE.supplyPpl - g.soldPpl, 11.17e6, 1e-2);
});

test("raisedUsd and soldPplForRaisedUsd are inverses", () => {
  for (const sold of [0, 1e6, 25e6, 55.66e6, 88.83e6, 100e6]) {
    closeTo(soldPplForRaisedUsd(raisedUsd(sold)), sold, 1e-6);
  }
});

test("a buy costs exactly the integral, and the price only moves up", () => {
  const start = 40e6;
  const q = quoteBuy(start, 500);
  closeTo(q.usdIn, 500);
  closeTo(raisedUsd(start + q.pplOut) - raisedUsd(start), 500);
  assert.ok(q.priceAfterUsd > q.priceBeforeUsd);
  // The average paid sits between the before and after spot prices.
  assert.ok(q.avgPriceUsd > q.priceBeforeUsd && q.avgPriceUsd < q.priceAfterUsd);
  assert.equal(q.partial, false);
});

test("early buyers get more PPL for the same money than later buyers", () => {
  const early = quoteBuy(0, SALE.maxPerBuyUsd);
  const late = quoteBuy(80e6, SALE.maxPerBuyUsd);
  assert.ok(early.pplOut > late.pplOut);
  assert.ok(early.avgPriceUsd < late.avgPriceUsd);
});

test("a buy that would overrun the supply is trimmed, not overfilled", () => {
  const q = quoteBuy(CURVE.supplyPpl - 1000, 1_000_000);
  assert.equal(q.partial, true);
  closeTo(q.pplOut, 1000, 1e-6);
  assert.ok(q.usdIn < 1_000_000);
});

test("buy then sell never profits: the 1.5% fee and the curve see to it", () => {
  const start = 50e6;
  const buy = quoteBuy(start, 500);
  const sell = quoteSell(start + buy.pplOut, buy.pplOut, SALE.sellFeePct);
  closeTo(sell.grossUsd, buy.usdIn, 1e-9);
  closeTo(sell.feeUsd, buy.usdIn * 0.015, 1e-9);
  assert.ok(sell.netUsd < buy.usdIn);
  closeTo(sell.priceAfterUsd, buy.priceBeforeUsd, 1e-9);
});

test("selling cannot take out more PPL than the curve has sold", () => {
  const sell = quoteSell(1e6, 5e6, SALE.sellFeePct);
  closeTo(sell.pplIn, 1e6);
  closeTo(sell.priceAfterUsd, CURVE.startPriceUsd);
});

test("chart samples are monotonic and milestones land on the markers", () => {
  const samples = curveSamplesByRaise(CURVE.graduationRaiseUsd, 20);
  assert.equal(samples.length, 21);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].raisedUsd > samples[i - 1].raisedUsd);
    assert.ok(samples[i].priceUsd > samples[i - 1].priceUsd);
  }
  closeTo(samples[samples.length - 1].raisedUsd, CURVE.graduationRaiseUsd);

  const marks = milestones();
  assert.deepEqual(
    marks.map((m) => m.raisedUsd),
    [...CURVE.milestoneRaisesUsd],
  );
});

test("graduation progress is a clamped 0–1 fraction", () => {
  assert.equal(graduationProgress(0), 0);
  assert.equal(graduationProgress(-5), 0);
  closeTo(graduationProgress(2_000_000), 0.5);
  assert.equal(graduationProgress(9_000_000), 1);
});
