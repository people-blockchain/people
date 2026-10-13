import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyToPpl, tallyTotal, quorumPercent, yesThresholdPercent, vetoThresholdPercent, decToPercent } from "../src/lib/gov/math.ts";
import { gasLimitWithMargin, feeForGasLimit } from "../src/lib/gov/fee.ts";

test("tallyToPpl converts appl-denominated counts to whole PPL", () => {
  const tally = tallyToPpl({
    yes_count: "3000000000000000000",
    no_count: "1000000000000000000",
    abstain_count: "0",
    no_with_veto_count: "0",
  });
  assert.equal(tally.yes, 3);
  assert.equal(tally.no, 1);
  assert.equal(tallyTotal(tally), 4);
});

test("quorumPercent is turnout over bonded stake", () => {
  const tally = { yes: 40, no: 10, abstain: 0, noWithVeto: 0 };
  const bonded = 500n * 10n ** 18n;
  assert.equal(quorumPercent(tally, bonded), 10);
});

test("quorumPercent is 0 when nothing is bonded", () => {
  assert.equal(quorumPercent({ yes: 1, no: 0, abstain: 0, noWithVeto: 0 }, 0n), 0);
});

test("yesThresholdPercent and vetoThresholdPercent exclude abstains", () => {
  const tally = { yes: 60, no: 30, abstain: 100, noWithVeto: 10 };
  assert.equal(yesThresholdPercent(tally), 60);
  assert.equal(vetoThresholdPercent(tally), 10);
});

test("decToPercent reads an SDK Dec string as a 0-100 percent", () => {
  assert.equal(decToPercent("0.334000000000000000"), 33.4);
  assert.equal(decToPercent("0.5"), 50);
});

test("gasLimitWithMargin adds a 30% safety margin over the simulated gas", () => {
  assert.equal(gasLimitWithMargin(100_000n), 130_000n);
});

test("feeForGasLimit rounds up to the node's 0.0001appl minimum gas price", () => {
  assert.deepEqual(feeForGasLimit(100_000n), [{ denom: "appl", amount: "10" }]);
  // Not an exact multiple of 10000 -> must round up, never down.
  assert.deepEqual(feeForGasLimit(100_001n), [{ denom: "appl", amount: "11" }]);
  assert.deepEqual(feeForGasLimit(1n), [{ denom: "appl", amount: "1" }]);
});
