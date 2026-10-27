/**
 * Pure logic for the PplCurveHubV2 `/buy` panel.
 *
 * Everything here is deterministic and free of React / network access so the
 * limits, slippage, unlock date, partial-failure state and the feature gate can
 * be unit-tested directly.
 */

import { defineChain, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

import { V2_PHASES, V2_PREVIEW_STATES, V2_SALE, type V2Phase, type V2PreviewState } from "./constants";

export type V2Env = Readonly<Record<string, string | undefined>>;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function truthy(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

/** Reads the public env at call time (literal accesses so Next can inline them). */
export function readV2Env(): V2Env {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_PPL_V2_BUY_ENABLED: process.env.NEXT_PUBLIC_PPL_V2_BUY_ENABLED,
    NEXT_PUBLIC_PPL_V2_BUY_PREVIEW: process.env.NEXT_PUBLIC_PPL_V2_BUY_PREVIEW,
    NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: process.env.NEXT_PUBLIC_PPL_V2_HUB_ADDRESS,
    NEXT_PUBLIC_PPL_V2_CHAIN_ID: process.env.NEXT_PUBLIC_PPL_V2_CHAIN_ID,
  };
}

/** Default off: the legacy `/buy` page stays byte-for-byte the same without the flag. */
export function isV2BuyEnabled(env: V2Env): boolean {
  return truthy(env.NEXT_PUBLIC_PPL_V2_BUY_ENABLED);
}

/**
 * Preview mode is opt-in twice (flag + preview) and refused in a Vercel
 * production deployment. It renders fixed data and never reads the chain.
 */
export function isV2PreviewEnabled(env: V2Env): boolean {
  if (!isV2BuyEnabled(env)) return false;
  if ((env.VERCEL_ENV ?? "").trim().toLowerCase() === "production") return false;
  return truthy(env.NEXT_PUBLIC_PPL_V2_BUY_PREVIEW);
}

/** The only gate the page needs. When false the v2 panel is not rendered at all. */
export function shouldRenderV2Buy(env: V2Env): boolean {
  return isV2BuyEnabled(env);
}

export function parseV2PreviewState(raw: string | null | undefined): V2PreviewState {
  const value = (raw ?? "").trim().toLowerCase();
  return (V2_PREVIEW_STATES as readonly string[]).includes(value) ? (value as V2PreviewState) : "unverified";
}

export function validV2Address(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  return ADDRESS_RE.test(value) ? value : null;
}

export type V2Chain = {
  id: number;
  chain: Chain;
  hubAddress: string | null;
  explorer: string | null;
  usdcAddress: string | null;
};

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** Resolves the V2 chain. The contract lives on Base by default. */
export function resolveV2Chain(env: V2Env): V2Chain {
  const parsed = Number.parseInt((env.NEXT_PUBLIC_PPL_V2_CHAIN_ID ?? "").trim(), 10);
  const id = Number.isFinite(parsed) && parsed > 0 ? parsed : base.id;
  const hubAddress = validV2Address(env.NEXT_PUBLIC_PPL_V2_HUB_ADDRESS);
  if (id === baseSepolia.id) {
    return {
      id,
      chain: baseSepolia,
      hubAddress,
      explorer: "https://sepolia.basescan.org",
      usdcAddress: SEPOLIA_USDC,
    };
  }
  if (id === base.id) {
    return {
      id,
      chain: base,
      hubAddress,
      explorer: "https://basescan.org",
      usdcAddress: BASE_USDC,
    };
  }
  return {
    id,
    chain: defineChain({
      id,
      name: `PPL V2 (${id})`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
    }),
    hubAddress,
    explorer: null,
    usdcAddress: null,
  };
}

export type V2AmountValidation =
  | { ok: true; amountUsd: number }
  | { ok: false; reason: "invalid" | "below_min" | "over_max" | "over_day"; limit: number };

/** Per-purchase $10–$500 and $2,000 per address per UTC day. */
export function validateV2BuyAmount(input: {
  amountUsd: number;
  spentTodayUsd?: number;
  minUsd?: number;
  maxPerBuyUsd?: number;
  maxPerDayUsd?: number;
}): V2AmountValidation {
  const min = input.minUsd ?? V2_SALE.minPerBuyUsd;
  const max = input.maxPerBuyUsd ?? V2_SALE.maxPerBuyUsd;
  const daily = input.maxPerDayUsd ?? V2_SALE.maxPerDayUsd;
  const spent = input.spentTodayUsd ?? 0;
  const amount = input.amountUsd;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "invalid", limit: min };
  if (amount < min) return { ok: false, reason: "below_min", limit: min };
  if (amount > max) return { ok: false, reason: "over_max", limit: max };
  if (spent + amount > daily) return { ok: false, reason: "over_day", limit: daily };
  return { ok: true, amountUsd: amount };
}

/** PPL estimate from a 6-decimal USDC amount and an 18-decimal spot price. */
export function estimatePplOut(usdcIn: bigint, spotPriceWad: bigint): bigint {
  if (usdcIn <= BigInt(0) || spotPriceWad <= BigInt(0)) return BigInt(0);
  return (usdcIn * BigInt(10) ** BigInt(30)) / spotPriceWad;
}

/** minPplOut is the estimate minus the 1% slippage tolerance; rounded down. */
export function minPplOutFromEstimate(expected: bigint, slippageBps: number = V2_SALE.slippageBps): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
  return (expected * (BigInt(10_000) - bps)) / BigInt(10_000);
}

/** Sell-back unlocks exactly 30 days after the purchase. */
export function sellBackUnlockMs(boughtAtMs: number, holdDays: number = V2_SALE.holdDays): number {
  return boughtAtMs + holdDays * DAY_MS;
}

/** Human display helper kept pure for tests. */
export function usd6ToNumber(value: bigint): number {
  return Number(value) / 1_000_000;
}

export function spotPriceWadToUsd(spotPriceWad: bigint): number {
  return Number(spotPriceWad) / 1e18;
}

export function pplWeiToNumber(value: bigint): number {
  return Number(value) / 1e18;
}

export type V2PurchaseOutcome = {
  swapSucceeded: boolean;
  buyFailed: boolean;
  receivedUsdc: number;
};

/**
 * A swap can land USDC on Base while `buy()` still fails. That state must offer
 * one retry with exactly the USDC that arrived, never a new swap.
 */
export function partialTopUpAmount(outcome: V2PurchaseOutcome): number | null {
  if (!outcome.swapSucceeded || !outcome.buyFailed) return null;
  if (!Number.isFinite(outcome.receivedUsdc) || outcome.receivedUsdc <= 0) return null;
  return Math.floor(outcome.receivedUsdc * 100) / 100;
}

export type V2PanelVisibility = {
  showForm: boolean;
  showVerification: boolean;
  showSuccess: boolean;
  showTopUp: boolean;
};

/**
 * Once the swap has landed USDC and only the buy failed, the panel is a single
 * top-up card: no form, no estimates, no fees, no LI.FI line, no main CTA.
 */
export function panelVisibility(input: {
  hasPurchase: boolean;
  hasPartial: boolean;
}): V2PanelVisibility {
  if (input.hasPartial) {
    return { showForm: false, showVerification: false, showSuccess: false, showTopUp: true };
  }
  return {
    showForm: !input.hasPurchase,
    showVerification: true,
    showSuccess: input.hasPurchase,
    showTopUp: false,
  };
}

export type V2HeroPhase = "whitelist" | "open" | "closed";

/** The hero title follows the V2 phase when the V2 panel is enabled. */
export function heroPhase(input: {
  v2Enabled: boolean;
  phase: V2Phase | null | undefined;
  legacyOpen: boolean;
}): V2HeroPhase {
  if (!input.v2Enabled) return input.legacyOpen ? "open" : "closed";
  if (input.phase === V2_PHASES.Whitelist) return "whitelist";
  if (input.phase === V2_PHASES.Open) return "open";
  return "closed";
}

export type V2PhaseView = {
  phase: V2Phase;
  /** Whole days left in the 7-day whitelist window, or null outside it. */
  whitelistDaysLeft: number | null;
  /** True only while purchases are allowed. */
  buyable: boolean;
  /** True while the whitelist restricts purchases to verified people. */
  whitelist: boolean;
};

export function phaseView(phase: V2Phase, openedAtSec: number, nowMs: number = Date.now()): V2PhaseView {
  const buyable = phase === V2_PHASES.Whitelist || phase === V2_PHASES.Open;
  const whitelist = phase === V2_PHASES.Whitelist;
  let whitelistDaysLeft: number | null = null;
  if (whitelist && Number.isFinite(openedAtSec) && openedAtSec > 0) {
    const endMs = openedAtSec * 1000 + V2_SALE.whitelistDays * DAY_MS;
    const at = Number.isFinite(nowMs) && nowMs > 0 ? nowMs : openedAtSec * 1000;
    whitelistDaysLeft = Math.max(0, Math.min(V2_SALE.whitelistDays, Math.ceil((endMs - at) / DAY_MS)));
  }
  return { phase, whitelistDaysLeft, buyable, whitelist };
}

export type V2MockSnapshot = {
  phase: V2Phase;
  openedAtSec: number;
  spotPriceWad: bigint;
  personId: string | null;
  siteVerified: boolean;
  purchase: {
    pplOutWei: bigint;
    txHash: string;
    boughtAtMs: number;
  } | null;
  partial: { receivedUsdc: number } | null;
  nowMs: number;
};

const PREVIEW_NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
const PREVIEW_OPENED_AT = Math.floor(Date.UTC(2026, 9, 18, 12, 0, 0) / 1000);
const PREVIEW_SPOT = BigInt("6125000000000000");
const PREVIEW_PPL = BigInt("40816326530612244897");
const PREVIEW_TX = `0x${"ab".repeat(32)}`;
const PREVIEW_PERSON = `0x${"11".repeat(32)}`;

/** Fixed, deterministic data for screenshots. No RPC, no clock, no randomness. */
export function previewSnapshot(state: V2PreviewState): V2MockSnapshot {
  const verified = state !== "unverified";
  const boughtAtMs = Date.UTC(2026, 9, 18, 12, 0, 0);
  return {
    phase: V2_PHASES.Whitelist,
    openedAtSec: PREVIEW_OPENED_AT,
    spotPriceWad: PREVIEW_SPOT,
    personId: state === "success" || state === "partial" ? PREVIEW_PERSON : null,
    siteVerified: verified,
    purchase:
      state === "success"
        ? { pplOutWei: PREVIEW_PPL, txHash: PREVIEW_TX, boughtAtMs }
        : null,
    partial: state === "partial" ? { receivedUsdc: 123.45 } : null,
    nowMs: PREVIEW_NOW,
  };
}
