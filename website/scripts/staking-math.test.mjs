import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commissionPercent,
  decCoinToPpl,
  coinToPpl,
  sumDecCoinsPpl,
  networkSharePercent,
  estimateAprPercent,
  secondsToDaysLabel,
} from "../src/lib/staking-math.ts";

test("commissionPercent reads the SDK Dec fraction as a 0-100 percent", () => {
  assert.equal(commissionPercent(100_000_000_000_000_000n), 10);
  assert.equal(commissionPercent(0n), 0);
  assert.equal(commissionPercent(1_000_000_000_000_000_000n), 100);
});

test("coinToPpl treats the appl-denom amount like wei", () => {
  assert.equal(coinToPpl(1_000_000_000_000_000_000n), 1);
  assert.equal(coinToPpl(500_000_000_000_000_000n), 0.5);
});

test("decCoinToPpl removes both the Dec precision and the appl denom's 18 decimals", () => {
  // 1 whole PPL of reward, as a DecCoin with the SDK's standard 18-digit Dec precision.
  const oneWholePpl = 1_000_000_000_000_000_000n * 1_000_000_000_000_000_000n;
  assert.equal(decCoinToPpl(oneWholePpl, 18), 1);
  assert.equal(decCoinToPpl(0n, 18), 0);
});

test("sumDecCoinsPpl adds across multiple DecCoins", () => {
  const unit = 1_000_000_000_000_000_000n * 1_000_000_000_000_000_000n;
  const total = sumDecCoinsPpl([
    { amount: unit, precision: 18 },
    { amount: unit / 2n, precision: 18 },
  ]);
  assert.equal(total, 1.5);
});

test("networkSharePercent handles an empty bonded pool without dividing by zero", () => {
  assert.equal(networkSharePercent(0n, 0n), 0);
  assert.equal(networkSharePercent(10n, 100n), 10);
});

test("estimateAprPercent nets out commission and is zero for an unstaked validator", () => {
  assert.equal(estimateAprPercent(1, 0, 10, 365), 0);
  // 1 PPL reward per epoch on 100 PPL staked, 365 epochs/year, 10% commission.
  const apr = estimateAprPercent(1, 100, 10, 365);
  assert.equal(apr, 365 * 0.9);
});

test("secondsToDaysLabel rounds to one decimal day", () => {
  assert.equal(secondsToDaysLabel(1_814_400), 21);
  assert.equal(secondsToDaysLabel(86_400 * 1.25), 1.3);
});
