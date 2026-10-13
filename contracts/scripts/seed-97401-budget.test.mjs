import test from "node:test";
import assert from "node:assert/strict";
import { parseMaxPools, parsePpl, seedMinPpl } from "./seed-97401-budget.mjs";

test("parseMaxPools: unset means no cap, integers parse, junk throws", () => {
  assert.equal(parseMaxPools(undefined), Infinity);
  assert.equal(parseMaxPools(""), Infinity);
  assert.equal(parseMaxPools("0"), 0);
  assert.equal(parseMaxPools(" 2 "), 2);
  assert.throws(() => parseMaxPools("-1"));
  assert.throws(() => parseMaxPools("1.5"));
  assert.throws(() => parseMaxPools("two"));
});

test("parsePpl: default when empty, rejects negatives", () => {
  assert.equal(parsePpl(undefined, 180, "X"), 180);
  assert.equal(parsePpl("", 20, "X"), 20);
  assert.equal(parsePpl("126", 180, "X"), 126);
  assert.equal(parsePpl("0", 20, "X"), 0);
  assert.throws(() => parsePpl("-5", 20, "X"));
});

test("seedMinPpl: defaults keep the previous 1227 PPL minimum", () => {
  assert.equal(
    seedMinPpl({ tokensToCreate: 6, poolsToCreate: 6, maxPools: Infinity, maxCurveSpendPpl: 180, fallbackPoolPpl: 20 }),
    1227,
  );
});

test("seedMinPpl: two pools at 126 PPL curve spend fit in 350 PPL", () => {
  const min = seedMinPpl({ tokensToCreate: 6, poolsToCreate: 6, maxPools: 2, maxCurveSpendPpl: 126, fallbackPoolPpl: 0 });
  assert.equal(min, 279);
  assert.ok(min <= 350);
});

test("seedMinPpl: re-run after tokens and two pools exist only needs the margin", () => {
  assert.equal(
    seedMinPpl({ tokensToCreate: 0, poolsToCreate: 4, maxPools: 0, maxCurveSpendPpl: 126, fallbackPoolPpl: 0 }),
    15,
  );
  assert.equal(
    seedMinPpl({ tokensToCreate: 0, poolsToCreate: 0, maxPools: Infinity, maxCurveSpendPpl: 180, fallbackPoolPpl: 20 }),
    15,
  );
});

test("126 PPL in 3 PPL chunks crosses the migration point (net > 120 PPL after 1% fee)", () => {
  const chunk = 3;
  const netPerChunk = chunk * 0.99; // CURVE_FEE_BPS = 100
  let spent = 0;
  let net = 0;
  while (spent < 126 && net <= 120) {
    spent += chunk;
    net += netPerChunk;
  }
  assert.ok(net > 120, `net ${net}`);
  assert.ok(spent <= 126, `spent ${spent}`);
});
