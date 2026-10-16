import { strict as assert } from "node:assert";
import test from "node:test";
import {
  PROMO_BPS_OPTIONS,
  allocationPercent,
  isPromoBps,
  launchAllocation,
} from "../src/lib/token-promo.ts";

const SUPPLY = 1_000_000_000n * 10n ** 18n;

test("only 0, 500 and 1000 bps are promo shares", () => {
  assert.deepEqual([...PROMO_BPS_OPTIONS], [0, 500, 1000]);
  for (const bps of PROMO_BPS_OPTIONS) assert.equal(isPromoBps(bps), true);
  for (const bps of [1, 250, 499, 501, 999, 1001, 10_000]) assert.equal(isPromoBps(bps), false);
});

test("the default split is 60/10/15/10/5 with no promo share", () => {
  const a = launchAllocation(SUPPLY, 0);
  assert.equal(a.promo, 0n);
  assert.equal(a.bondingCurve, (SUPPLY * 60n) / 100n);
  assert.equal(a.communityPool, (SUPPLY * 10n) / 100n);
  assert.equal(a.creator, (SUPPLY * 15n) / 100n);
  assert.equal(a.liquidityReserve, (SUPPLY * 10n) / 100n);
  assert.equal(a.ecosystemReserve, (SUPPLY * 5n) / 100n);
});

test("a promo share only shrinks the curve", () => {
  const base = launchAllocation(SUPPLY, 0);
  for (const bps of [500, 1000]) {
    const a = launchAllocation(SUPPLY, bps);
    assert.equal(a.promo, (SUPPLY * BigInt(bps)) / 10_000n);
    assert.equal(a.communityPool, base.communityPool, "community pool is untouchable");
    assert.equal(a.creator, base.creator);
    assert.equal(a.liquidityReserve, base.liquidityReserve);
    assert.equal(a.ecosystemReserve, base.ecosystemReserve);
    assert.equal(a.bondingCurve + a.promo, base.bondingCurve, "promo comes out of the curve");
  }
  assert.equal(launchAllocation(SUPPLY, 500).bondingCurve, (SUPPLY * 55n) / 100n);
  assert.equal(launchAllocation(SUPPLY, 1000).bondingCurve, (SUPPLY * 50n) / 100n);
});

test("nothing is minted or lost at any supply or promo share", () => {
  for (const supply of [0n, 1n, 7n, 999_999n, SUPPLY, 2n ** 90n + 13n]) {
    for (const bps of PROMO_BPS_OPTIONS) {
      const a = launchAllocation(supply, bps);
      const sum =
        a.bondingCurve +
        a.communityPool +
        a.creator +
        a.liquidityReserve +
        a.ecosystemReserve +
        a.promo;
      assert.equal(sum, supply, `supply ${supply} at ${bps} bps`);
    }
  }
});

test("percentages are reported for display", () => {
  const a = launchAllocation(SUPPLY, 1000);
  assert.equal(allocationPercent(a.bondingCurve, SUPPLY), 50);
  assert.equal(allocationPercent(a.promo, SUPPLY), 10);
  assert.equal(allocationPercent(a.communityPool, SUPPLY), 10);
  assert.equal(allocationPercent(0n, 0n), 0);
});
