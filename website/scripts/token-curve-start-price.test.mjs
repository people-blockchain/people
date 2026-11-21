import test from "node:test";
import assert from "node:assert/strict";
import {
  VIRTUAL_NATIVE_RESERVE_PPL,
  launchSpotFromSupplyWhole,
  supplyWholeForMaxSpotPpl,
  bondingCurveAllocationBaseUnits,
} from "../src/lib/token-curve-start-price.ts";
import { wholeTokensToBaseUnits } from "../src/lib/token-supply-limits.ts";

test("launch spot matches 60 PPL / curve allocation (1M supply)", () => {
  const supply = 1_000_000n;
  const spot = launchSpotFromSupplyWhole(supply);
  assert.ok(spot);
  const base = wholeTokensToBaseUnits(String(supply), "6");
  const curve = bondingCurveAllocationBaseUnits(base, 0);
  const curveWhole = curve / 1_000_000n;
  assert.equal(curveWhole, 600_000n);
  assert.equal(spot.bondingCurveWholeTokens, curveWhole);
  assert.ok(Math.abs(spot.spotPplPerWholeToken - VIRTUAL_NATIVE_RESERVE_PPL / 600_000) < 1e-12);
});

test("higher supply lowers spot price", () => {
  const a = launchSpotFromSupplyWhole(1_000_000n);
  const b = launchSpotFromSupplyWhole(10_000_000n);
  assert.ok(a && b);
  assert.ok(b.spotPplPerWholeToken < a.spotPplPerWholeToken);
});

test("supplyWholeForMaxSpotPpl respects minimum supply", () => {
  const supply = supplyWholeForMaxSpotPpl(0.01);
  assert.ok(supply >= 1_000_000n);
  const spot = launchSpotFromSupplyWhole(supply);
  assert.ok(spot);
  assert.ok(spot.spotPplPerWholeToken <= 0.01 * 1.01);
});