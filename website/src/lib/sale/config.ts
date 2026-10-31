/**
 * Single source of truth for the public PPL sale on `/buy`.
 *
 * Every number the sale page renders comes from here or from
 * `@/lib/sale/curve` (which derives from here). Nothing on the page may
 * hard-code a price, a limit, a duration or an address.
 *
 * Parameters are the ones approved by the owner on 2026-10-15
 * (`ppl-curve-final.md`, `ppl-sale-plan.md` §"Decisions approved 2026-10-15").
 * Do not change them without an explicit owner decision — see AGENTS.md §3.
 *
 * Nothing here is deployed yet: `saleContractAddress()` returns `null` until an
 * address is configured, which is what keeps the buy button disabled.
 */

import { SALE_CHAIN, readSaleChainEnv, resolveSaleChain, type SaleChainEnv } from "@/lib/sale/saleChain";

/* ── Curve ─────────────────────────────────────────────────────────────── */

/**
 * `price(x) = startPriceUsd · e^(k·x)` with `x` = millions of PPL sold.
 * `k = ln(50)/100` makes the price exactly 50× the start (the ceiling) when
 * all 100M PPL on the curve are sold.
 */
export const CURVE = {
  /** PPL offered on the curve: 10% of the fixed 1B supply. */
  supplyPpl: 100_000_000,
  /** Price of the first PPL, in USD. */
  startPriceUsd: 0.005,
  /** Hard ceiling, reached only at `supplyPpl` sold. Curve-only — see `CAP_IS_CURVE_ONLY`. */
  ceilingPriceUsd: 0.25,
  /** Growth rate per 1M PPL sold. */
  k: Math.log(50) / 100,
  /** The curve closes once this much has been raised (net reserve). */
  graduationRaiseUsd: 4_000_000,
  /** Raise markers drawn on the chart. */
  milestoneRaisesUsd: [1_000_000, 2_000_000, 4_000_000] as const,
} as const;

/** The $0.25 ceiling binds on the curve only; after graduation it is a free market. */
export const CAP_IS_CURVE_ONLY = true;

/* ── Sale window, limits, fees ─────────────────────────────────────────── */

export const SALE = {
  /** Sale term in months: until sold out or this long after opening, whichever comes first. */
  saleTermMonths: 24,
  /** The term is never extended. */
  extensions: false as const,
  /** Where PPL left unsold at the end of the term goes. */
  unsoldGoesTo: "Community Pool",
  /** Purchases are final. */
  refunds: false as const,
  /** Min USD value of a single purchase (single source; economics.ts re-exports it). */
  minPerBuyUsd: 10,
  /** Slippage tolerance applied to the on-chain quote, in basis points. */
  slippageBps: 100,
  /** Max USD value of a single purchase. */
  maxPerBuyUsd: 500,
  /** Max USD value one person may buy in a rolling 24 hours. */
  maxPerDayUsd: 2_000,
  /** Minimum gap between two trades from the same person, in seconds. */
  cooldownSeconds: 60,
  /** Share of the raise seeded into the DEX pool at graduation. */
  liquiditySharePct: 50,
  /** Share of the raise sent to the project multisig at graduation. */
  multisigSharePct: 50,
  /** How long the pool's LP tokens are locked. */
  lpLockMonths: 24,
  /** Full mainnet (PPL transfers + pool trading) opens at whichever comes first. */
  fullMainnetVerifiedPeople: 1_000,
  fullMainnetMaxMonths: 6,
} as const;

/** Selling PPL back to the reserve. Closes at graduation. */
export const SELL_BACK = {
  verifiedOnly: true,
  holdDays: 30, // per lot
  priceRule: "curve-at-exit",
  dailyCapReservePct: 2, // all sellers combined, any rolling 24 hours
  perPersonPerDayUsd: 2000,
  /** Goes to the PPL buyback by the project, not to the team. */
  feePct: 1.5,
  feeHighPct: 3,
  /** The fee is `feeHighPct` on the part of the rolling-24h sell-backs above this share of the reserve. */
  feeHighThresholdReservePct: 1,
  closesAt: "graduation",
  payout: { token: "USDC", chainId: 8453 },
} as const;

/** Source ecosystems the built-in swap widget accepts. TON is not supported. */
export const PAY_FROM_OTHER_CHAINS = { evm: true, tron: true, solana: true, ton: false } as const;

/**
 * ISO date the sale opens (UTC). `null` until announced; the page then says so.
 * Same date as the `/buy` hero countdown (`V2_OPEN_DATE_DEFAULT` in `v2/stats-copy.ts`).
 */
export const SALE_OPENING_DATE_UTC: string | null = "2026-12-01";

/** Minimum native balance (ETH) needed on Base to pay the network fee. */
export const MIN_GAS_ETH = 0.00002;

/** Team vesting, shown on the sale page's transparency block. */
export const TEAM_VESTING = { cliffMonths: 6, linearMonths: 18 } as const;

export type SaleStableSymbol = "USDC" | "USDT";

/** Sells pay out here unless the buyer picks their own chain (bridge, minutes). */
export const PAYOUT_DEFAULT = { networkLabel: "Base", stable: "USDC" as SaleStableSymbol } as const;

/* ── Addresses ─────────────────────────────────────────────────────────── */

/**
 * The chain the curve hub is deployed on: Base mainnet, or Base Sepolia when
 * `NEXT_PUBLIC_SALE_CHAIN=base-sepolia` (see `saleChain.ts`, the single source of truth).
 * Contract links on /buy go to the chain's explorer.
 */
export { SALE_CHAIN, SALE_CHAIN_KEY, saleTokenAddress } from "@/lib/sale/saleChain";
export const SALE_HUB_CHAIN = {
  chainId: SALE_CHAIN.id,
  rpcUrl: SALE_CHAIN.rpcUrl,
} as const;

/** Public block explorer for the sale contract and tokens. */
export { BASE_USDC_ADDRESS as BASE_USDC, BASE_USDT_ADDRESS as BASE_USDT } from "@/lib/sale/bridge";
/** Base mainnet explorer. On a test sale chain the helpers below use `SALE_CHAIN.explorer`. */
export const BASESCAN = "https://basescan.org";
export const basescanAddressUrl = (address: string): string => `${SALE_CHAIN.explorer}/address/${address}`;
export const basescanTxUrl = (txHash: string): string => `${SALE_CHAIN.explorer}/tx/${txHash}`;

/**
 * Addresses published on /buy once the owner fills them in. `null` = not published yet,
 * the page then says the address appears before the sale opens.
 */
export const SALE_ADDRESSES: {
  ppl: string | null;
  multisig: string | null;
  multisigThreshold: { m: number; n: number } | null;
} = { ppl: null, multisig: null, multisigThreshold: null };

/** Links to published AI review reports; empty until there are any. */
export const AI_REVIEW_REPORTS: readonly { label: string; url: string }[] = [];

/**
 * Sale (curve hub) contract. TODO(sale-deploy): set
 * `NEXT_PUBLIC_SALE_HUB_ADDRESS` once `PplCurveHub` is deployed. Until then the
 * page shows "not deployed yet" and the buy action stays disabled.
 */
export function saleContractAddress(env: SaleChainEnv = readSaleChainEnv()): string | null {
  return resolveSaleChain(env).hubAddress;
}

/** True once a sale contract is configured — the only gate on real purchases. */
export function saleContractConfigured(env: SaleChainEnv = readSaleChainEnv()): boolean {
  return saleContractAddress(env) !== null;
}

/* ── Security reviews ──────────────────────────────────────────────────── */

/** No external firm has audited the contracts. Do not flip without a real report. */
export const EXTERNAL_FIRM_AUDIT = false;

/** A bug bounty is open to everyone: the bug button on any page, rewarded in founder points. */
export const BUG_BOUNTY_OPEN = true;
