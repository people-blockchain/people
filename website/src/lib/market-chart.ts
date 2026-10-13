/**
 * Pure helpers for the token market panel (price chart + stats). Kept free of any EVM/network
 * code so candle aggregation and the market-cap/progress math can be unit tested directly, the
 * same split as `amm-math.ts`/`swap-math.ts`.
 */

export type MarketTrade = { ts: number; price: number; volumeNative: number };

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export const CHART_INTERVALS = ["5m", "1h", "1d"] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

export const CHART_INTERVAL_MS: Record<ChartInterval, number> = {
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Buckets trades into OHLCV candles of `intervalMs`, one candle per non-empty bucket. */
export function aggregateCandles(trades: MarketTrade[], intervalMs: number): Candle[] {
  if (!(intervalMs > 0)) throw new Error("intervalMs");
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const buckets = new Map<number, Candle>();
  for (const trade of sorted) {
    if (!Number.isFinite(trade.ts) || !(trade.price > 0)) continue;
    const t = Math.floor(trade.ts / intervalMs) * intervalMs;
    const existing = buckets.get(t);
    if (!existing) {
      buckets.set(t, { t, o: trade.price, h: trade.price, l: trade.price, c: trade.price, v: Math.max(0, trade.volumeNative) });
      continue;
    }
    existing.h = Math.max(existing.h, trade.price);
    existing.l = Math.min(existing.l, trade.price);
    existing.c = trade.price;
    existing.v += Math.max(0, trade.volumeNative);
  }
  return [...buckets.values()].sort((a, b) => a.t - b.t);
}

/** Sum of trade volume for trades at or after `sinceMs` (e.g. a rolling 24h window). */
export function volumeSince(trades: MarketTrade[], sinceMs: number): number {
  let total = 0;
  for (const trade of trades) {
    if (trade.ts >= sinceMs) total += Math.max(0, trade.volumeNative);
  }
  return total;
}

/** Token market cap in the native unit, from the current price and total supply. */
export function marketCapNative(priceNative: number, totalSupply: number): number {
  if (!(priceNative > 0) || !(totalSupply > 0)) return 0;
  return priceNative * totalSupply;
}

/** AMM pool TVL in the native unit: both sides hold equal value at the pool price, so 2x the native side. */
export function poolLiquidityNative(nativeReserve: number): number {
  return nativeReserve > 0 ? nativeReserve * 2 : 0;
}

/** Bonding-curve "liquidity": the native balance actually held by the curve, backing sells. */
export function curveLiquidityNative(actualNativeReserve: number): number {
  return actualNativeReserve > 0 ? actualNativeReserve : 0;
}

/**
 * Percent of the way from a curve's starting token inventory down to its migration threshold
 * (`CurveMath.initialState`: `migrationThreshold = curveInventory / 3`). Clamped to [0, 100] so a
 * curve that hasn't traded yet reads 0% and one already past the threshold reads 100%.
 */
export function curveProgressPercent(
  currentTokenReserve: number,
  migrationThreshold: number,
  initialTokenReserve: number,
): number {
  const total = initialTokenReserve - migrationThreshold;
  if (!(total > 0)) return 0;
  const traveled = initialTokenReserve - currentTokenReserve;
  return Math.min(100, Math.max(0, (traveled / total) * 100));
}
