/**
 * Pure helpers for the `/buy` page layout: which phase the page is in, the
 * countdown to opening, where "you are here" sits on the curve, and the
 * preview-only example trades.
 *
 * No React, no network, no env reads at import time, so every rule here is
 * unit-tested in `scripts/buy-page.test.mjs`.
 */

import { GENESIS_ALLOCATIONS } from "../tokenomics";
import type { SaleTrade } from "./adapter";
import { CURVE, SALE, SELL_BACK, TEAM_VESTING } from "./config";
import { graduation, quoteBuy, quoteSell, spotPriceUsd } from "./curve";
import { formatMonths, intlLocale, pct, pplCompact, pricePerPpl, usd, usdCompact } from "./format";
import { V2_PHASES, V2_SALE, type V2Phase } from "./v2/constants";

/** `upcoming` = not opened yet; `ended` = term over or the curve closed. */
export type BuyPagePhase = "upcoming" | "whitelist" | "open" | "ended";

/**
 * With the V2 flag off the page follows the legacy hub gate (open or not).
 * With it on, the contract phase decides; an unknown phase is "upcoming".
 */
export function buyPagePhase(input: {
  v2Enabled: boolean;
  v2Phase: V2Phase | null | undefined;
  legacyOpen: boolean;
}): BuyPagePhase {
  if (!input.v2Enabled) return input.legacyOpen ? "open" : "upcoming";
  switch (input.v2Phase) {
    case V2_PHASES.Whitelist:
      return "whitelist";
    case V2_PHASES.Open:
      return "open";
    case V2_PHASES.Expired:
    case V2_PHASES.Graduated:
      return "ended";
    default:
      return "upcoming";
  }
}

/**
 * "1 December 2026" in the reader's language, always in UTC. A trailing dot
 * (RU "2026 г.") is dropped because the sentence supplies its own.
 */
export function formatOpenDate(openDate: Date, lang: string): string {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(openDate)
    .replace(/\.$/, "");
}

export type Countdown = { days: number; hours: number; minutes: number; done: boolean };

const MINUTE_MS = 60_000;

/**
 * Whole days, hours and minutes left until `targetMs`. Rounds up to the next
 * minute so the display never reads 0:00 while time is still left.
 */
export function countdownTo(targetMs: number, nowMs: number): Countdown {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs) || nowMs >= targetMs) {
    return { days: 0, hours: 0, minutes: 0, done: true };
  }
  const totalMinutes = Math.ceil((targetMs - nowMs) / MINUTE_MS);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
    done: false,
  };
}

/** Inverse of `spotPriceUsd`: PPL sold at a given curve price, or null for a bad reading. */
export function soldPplForSpotPrice(priceUsd: number): number | null {
  if (!Number.isFinite(priceUsd) || priceUsd < CURVE.startPriceUsd) return null;
  const sold = (Math.log(priceUsd / CURVE.startPriceUsd) / CURVE.k) * 1_000_000;
  return Math.min(Math.max(sold, 0), CURVE.supplyPpl);
}

/**
 * Where the "you are here" dot goes. Before opening nothing has been sold, so
 * the dot sits at the start; once the sale runs only a live reading counts —
 * no reading, no dot.
 */
export function curvePosition(input: {
  phase: BuyPagePhase;
  liveSoldPpl: number | null;
}): number | null {
  if (input.liveSoldPpl !== null && Number.isFinite(input.liveSoldPpl)) {
    return Math.min(Math.max(input.liveSoldPpl, 0), CURVE.supplyPpl);
  }
  return input.phase === "upcoming" ? 0 : null;
}

function allocationPct(id: string): number {
  return GENESIS_ALLOCATIONS.find((bucket) => bucket.id === id)?.pct ?? 0;
}

/**
 * Every `{placeholder}` the `/buy` copy uses, resolved from the sale config,
 * the V2 contract constants and the genesis allocation. The copy itself holds
 * no numbers that could drift from the contract.
 */
export function buyCopyVars(lang: string): Record<string, string | number> {
  return {
    days: V2_SALE.whitelistDays,
    whitelistDays: V2_SALE.whitelistDays,
    holdDays: V2_SALE.holdDays,
    min: usd(V2_SALE.minPerBuyUsd, lang),
    max: usd(V2_SALE.maxPerBuyUsd, lang),
    perDay: usd(V2_SALE.maxPerDayUsd, lang),
    cooldown: V2_SALE.cooldownSeconds,
    reservePct: pct(V2_SALE.reserveSharePct, lang),
    treasuryPct: pct(100 - V2_SALE.reserveSharePct, lang),
    sellDailyPct: pct(SELL_BACK.dailyCapReservePct, lang),
    sellPerAddress: usd(SELL_BACK.perPersonPerDayUsd, lang),
    feeLow: pct(SELL_BACK.feePct, lang),
    feeHigh: pct(SELL_BACK.feeHighPct, lang),
    feeThreshold: pct(SELL_BACK.feeHighThresholdReservePct, lang),
    signersM: V2_SALE.treasurySigners.m,
    signersN: V2_SALE.treasurySigners.n,
    releaseDays: V2_SALE.releaseNoticeDays,
    graduation: usdCompact(CURVE.graduationRaiseUsd, lang),
    term: formatMonths(SALE.saleTermMonths, lang),
    start: pricePerPpl(CURVE.startPriceUsd, lang),
    end: pricePerPpl(graduation().priceUsd, lang),
    supply: pplCompact(CURVE.supplyPpl, lang),
    communityPct: pct(allocationPct("community"), lang),
    teamPct: pct(allocationPct("team"), lang),
    teamVesting: formatMonths(TEAM_VESTING.cliffMonths + TEAM_VESTING.linearMonths, lang),
    cliff: formatMonths(TEAM_VESTING.cliffMonths, lang),
    linear: formatMonths(TEAM_VESTING.linearMonths, lang),
  };
}

/* ── Preview-only example trades ───────────────────────────────────────── */

export type DemoEnv = Readonly<Record<string, string | undefined>>;

function lower(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Example trades on `/buy?demo=1`, for previewing the feed before real trades
 * exist. Fails closed: a production Vercel deployment never qualifies, and
 * neither does an unknown environment — only Vercel preview/development
 * deployments and a local `next dev`.
 */
export function tradeDemoAllowed(env: DemoEnv, demoParam: string | string[] | null | undefined): boolean {
  const param = Array.isArray(demoParam) ? demoParam[0] : demoParam;
  if ((param ?? "").trim() !== "1") return false;
  const vercel = lower(env.VERCEL_ENV);
  const publicVercel = lower(env.NEXT_PUBLIC_VERCEL_ENV);
  if (vercel === "production" || publicVercel === "production") return false;
  const nonProd = new Set(["preview", "development"]);
  if (nonProd.has(vercel) || nonProd.has(publicVercel)) return true;
  return !vercel && !publicVercel && lower(env.NODE_ENV) === "development";
}

const DEMO_ROWS: readonly { kind: "buy" | "sell"; usd: number; address: string; minutesAgo: number }[] = [
  { kind: "buy", usd: 250, address: "0x7a3f…91c2", minutesAgo: 2 },
  { kind: "buy", usd: 40, address: "0x1d8e…05ab", minutesAgo: 9 },
  { kind: "sell", usd: 60, address: "0xc4b2…7e10", minutesAgo: 17 },
  { kind: "buy", usd: 500, address: "0x58f0…d3e9", minutesAgo: 26 },
  { kind: "buy", usd: 15, address: "0x9e21…4f7b", minutesAgo: 41 },
  { kind: "buy", usd: 120, address: "0x2b6c…a8d4", minutesAgo: 58 },
];

/** Fixed moment the examples are dated from, so the output never changes. */
const DEMO_NOW_MS = Date.UTC(2026, 11, 1, 12, 0, 0);

/**
 * Six example trades, newest first, priced on the real curve from the start.
 * No explorer link: there is no transaction behind them.
 */
export function demoTrades(): SaleTrade[] {
  let sold = 0;
  const oldestFirst = [...DEMO_ROWS].reverse().map((row, index) => {
    let pplAmount: number;
    let usdAmount: number;
    if (row.kind === "buy") {
      const quote = quoteBuy(sold, row.usd);
      pplAmount = quote.pplOut;
      usdAmount = quote.usdIn;
      sold += pplAmount;
    } else {
      const quote = quoteSell(sold, row.usd / spotPriceUsd(sold), 0);
      pplAmount = quote.pplIn;
      usdAmount = quote.grossUsd;
      sold -= pplAmount;
    }
    return {
      id: `demo-${index}`,
      kind: row.kind,
      usd: usdAmount,
      ppl: pplAmount,
      at: new Date(DEMO_NOW_MS - row.minutesAgo * MINUTE_MS).toISOString(),
      addressShort: row.address,
      explorerUrl: "",
    } satisfies SaleTrade;
  });
  return oldestFirst.reverse();
}
