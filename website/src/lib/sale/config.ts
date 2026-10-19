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
  /**
   * Sale window: until all curve PPL is sold or this many months from open,
   * whichever comes first (fixed term, no extensions). After it ends, unsold
   * PPL goes to the community pool; whatever was raised is split 50/50.
   */
  durationMonths: 24,
  /** Derived day cap for countdown UI and adapters (~24 calendar months). */
  durationDays: 730,
  /** Max USD value of a single purchase. */
  maxPerBuyUsd: 500,
  /** Max USD value one person may buy in a rolling 24 hours. */
  maxPerDayUsd: 2_000,
  /** Minimum gap between two trades from the same person, in seconds. */
  cooldownSeconds: 60,
  /** Taken off a sell back to the curve; goes to PPL buyback, not to the team. */
  sellFeePct: 1.5,
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

/** Team vesting, shown on the sale page's transparency block. */
export const TEAM_VESTING = { cliffMonths: 6, linearMonths: 18 } as const;

export type SaleStableSymbol = "USDC" | "USDT";

/** Sells pay out here unless the buyer picks their own chain (bridge, minutes). */
export const PAYOUT_DEFAULT = { networkLabel: "Base", stable: "USDC" as SaleStableSymbol } as const;

/** Wallets the sale accepts. The connect flow itself is the site-wide wallet modal. */
export const SUPPORTED_WALLETS = [
  "MetaMask",
  "Phantom",
  "Trust Wallet",
  "WalletConnect",
  "Tonkeeper (TON Connect)",
  "Google",
] as const;

/* ── Addresses ─────────────────────────────────────────────────────────── */

/**
 * The chain the curve hub is deployed on — needed to read the hub.
 *
 * This is plumbing, not copy: the sale page never renders the network name or
 * the RPC endpoint (owner decision 2026-10-16 — the treasury is internal and
 * the only place the page names a network is the sell-back payout). The project
 * treasury address and its balance are deliberately not part of this module.
 */
export const SALE_HUB_CHAIN = {
  chainId: 8453,
  /** Public, keyless endpoint. Overridable without a redeploy. */
  rpcUrl: (process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org").trim(),
} as const;

/**
 * Where the sale page sends anyone who wants to look something up on-chain:
 * the People network explorer this site already ships (`app/explorer/*`).
 *
 * Owner decision 2026-10-16: no third-party explorer brand on `/buy`. Every
 * explorer URL on the page is built from `base` below, so swapping the explorer
 * — a path today, an absolute URL if it ever moves to its own host — is a
 * one-line change here and nowhere else.
 */
export const PEOPLE_EXPLORER = {
  /** Route prefix (or origin + prefix) of the People network explorer. */
  base: "/explorer",
} as const;

/**
 * Sale (curve hub) contract. TODO(sale-deploy): set
 * `NEXT_PUBLIC_SALE_HUB_ADDRESS` once `PplCurveHub` is deployed. Until then the
 * page shows "not deployed yet" and the buy action stays disabled.
 */
export function saleContractAddress(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SALE_HUB_ADDRESS ?? "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw : null;
}

/** True once a sale contract is configured — the only gate on real purchases. */
export function saleContractConfigured(): boolean {
  return saleContractAddress() !== null;
}

/** Account page for an address on the People network explorer. */
export function explorerAddressUrl(address: string): string {
  return `${PEOPLE_EXPLORER.base}/address/${encodeURIComponent(address)}`;
}

/** Contract page — the one that renders the verified source. */
export function explorerContractUrl(address: string): string {
  return `${PEOPLE_EXPLORER.base}/contract/${encodeURIComponent(address)}`;
}

/** Transaction page, used by the recent-trades feed. */
export function explorerTxUrl(txHash: string): string {
  return `${PEOPLE_EXPLORER.base}/tx/${encodeURIComponent(txHash)}`;
}

/* ── Security reviews ──────────────────────────────────────────────────── */

/**
 * AI models named on `/buy`, `/transparency` and the litepaper. Keep this list in
 * sync with the public copy — exactly these three, in this order.
 *
 * No external audit firm has reviewed the code. That qualification is stated in
 * the page's small print and must not be dropped.
 */
export const AI_AUDITS = [
  { id: "opus", model: "Claude Opus 5.5" },
  { id: "astra", model: "GPT Astra" },
  { id: "fable", model: "Fable 5.1" },
] as const;

/** Model names as the copy lists them, in the order the audits happened. */
export const AI_AUDIT_MODELS: readonly string[] = AI_AUDITS.map((audit) => audit.model);

/** No external firm has audited the contracts. Do not flip without a real report. */
export const EXTERNAL_FIRM_AUDIT = false;

/** A bug bounty is open to everyone: the bug button on any page, rewarded in founder points. */
export const BUG_BOUNTY_OPEN = true;
