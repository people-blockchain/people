import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCandles,
  curveLiquidityNative,
  curveProgressPercent,
  marketCapNative,
  poolLiquidityNative,
  volumeSince,
} from "../src/lib/market-chart.ts";

test("aggregateCandles buckets trades by interval and tracks OHLCV", () => {
  const trades = [
    { ts: 0, price: 1, volumeNative: 10 },
    { ts: 1_000, price: 1.5, volumeNative: 5 },
    { ts: 2_000, price: 0.8, volumeNative: 3 },
    { ts: 5_000, price: 2, volumeNative: 1 },
  ];
  const candles = aggregateCandles(trades, 5_000);
  assert.equal(candles.length, 2);
  assert.deepEqual(candles[0], { t: 0, o: 1, h: 1.5, l: 0.8, c: 0.8, v: 18 });
  assert.deepEqual(candles[1], { t: 5_000, o: 2, h: 2, l: 2, c: 2, v: 1 });
});

test("aggregateCandles ignores out-of-order input and non-positive prices", () => {
  const trades = [
    { ts: 3_000, price: 3, volumeNative: 1 },
    { ts: 1_000, price: 1, volumeNative: 1 },
    { ts: 2_000, price: 0, volumeNative: 1 },
    { ts: 4_000, price: Number.NaN, volumeNative: 1 },
  ];
  const candles = aggregateCandles(trades, 10_000);
  assert.equal(candles.length, 1);
  assert.equal(candles[0].o, 1);
  assert.equal(candles[0].c, 3);
  assert.equal(candles[0].v, 2);
});

test("aggregateCandles rejects a non-positive interval", () => {
  assert.throws(() => aggregateCandles([], 0), /intervalMs/);
});

test("volumeSince sums only trades at or after the cutoff", () => {
  const trades = [
    { ts: 100, price: 1, volumeNative: 4 },
    { ts: 200, price: 1, volumeNative: 6 },
    { ts: 300, price: 1, volumeNative: -1 },
  ];
  assert.equal(volumeSince(trades, 200), 6);
  assert.equal(volumeSince(trades, 0), 10);
});

test("marketCapNative multiplies price by supply and guards non-positive inputs", () => {
  assert.equal(marketCapNative(2.5, 1_000_000), 2_500_000);
  assert.equal(marketCapNative(0, 1_000_000), 0);
  assert.equal(marketCapNative(2.5, 0), 0);
  assert.equal(marketCapNative(-1, 1_000_000), 0);
});

test("poolLiquidityNative doubles the native-side reserve", () => {
  assert.equal(poolLiquidityNative(121.77), 243.54);
  assert.equal(poolLiquidityNative(0), 0);
});

test("curveLiquidityNative passes through the curve's native balance", () => {
  assert.equal(curveLiquidityNative(42), 42);
  assert.equal(curveLiquidityNative(-5), 0);
});

test("curveProgressPercent tracks distance travelled toward the migration threshold", () => {
  // CurveMath.initialState: migrationThreshold = curveInventory / 3.
  const initial = 900;
  const threshold = 300;
  assert.equal(curveProgressPercent(initial, threshold, initial), 0);
  assert.equal(curveProgressPercent(threshold, threshold, initial), 100);
  assert.equal(curveProgressPercent(600, threshold, initial), 50);
});

test("curveProgressPercent clamps outside the [initial, threshold] range", () => {
  const initial = 900;
  const threshold = 300;
  assert.equal(curveProgressPercent(950, threshold, initial), 0);
  assert.equal(curveProgressPercent(0, threshold, initial), 100);
  assert.equal(curveProgressPercent(100, 100, 100), 0);
});
