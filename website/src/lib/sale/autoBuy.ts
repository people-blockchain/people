/**
 * Auto-start of the purchase step after funds arrive on Base (LI.FI widget on /buy).
 *
 * Everything here is pure and free of network access so it can be unit-tested:
 *  - `decideAutoBuy` decides whether a delivery (a completed LI.FI route or a USDC balance
 *    increase) should start the purchase step, and for how much;
 *  - `reduceBalanceSample` turns successive balance samples into delivery events;
 *  - `deliveredFromRoute` extracts the delivered USDC amount from a LI.FI route.
 *
 * Starting the step only opens the existing approve + buyWith flow; every transaction is still
 * signed by the user in the wallet. No contract call on the destination side is made by LI.FI.
 */

import { BASE_MAINNET_USDC, type SaleChainKey } from "@/lib/sale/saleChain";

/** USDC has 6 decimals on Base. */
export const USDC_DECIMALS = 6;

/** Base mainnet chain id (the only chain the LI.FI widget delivers to). */
export const AUTO_BUY_DELIVERY_CHAIN_ID = 8453;

export type AutoBuyTrigger =
  | {
      source: "event";
      /** LI.FI route id; the dedup key. */
      routeId?: string | null;
      /** Delivered USDC in base units, or null when the route did not say. */
      deliveredUnits: bigint | null;
    }
  | {
      source: "balance";
      balanceBefore: bigint;
      balanceAfter: bigint;
      /** Sequence number from `reduceBalanceSample`, so equal balances later are distinct deliveries. */
      seq?: number;
    };

export type AutoBuyReason =
  | "disabled-chain"
  | "bad-limits"
  | "no-delivery"
  | "duplicate"
  | "busy"
  | "below-min";

export type AutoBuyDecision =
  | { action: "none"; reason: AutoBuyReason; amountUsd?: number }
  | { action: "start"; amountUsd: number; key: string; capped: boolean };

export type AutoBuyInput = {
  /** Sale chain key. The LI.FI widget does not work on the test chain, so auto-buy is off there. */
  chainKey: SaleChainKey;
  trigger: AutoBuyTrigger;
  minUsd: number;
  maxUsd: number;
  /** Keys of deliveries that already started a purchase step. */
  alreadyTriggered: ReadonlySet<string>;
  /** A purchase is in flight; do not start another. */
  busy?: boolean;
  decimals?: number;
};

/** Dedup key of a trigger. */
export function autoBuyKey(trigger: AutoBuyTrigger): string {
  if (trigger.source === "event") {
    return trigger.routeId ? `route:${trigger.routeId}` : `event:${trigger.deliveredUnits ?? "unknown"}`;
  }
  return `balance:${trigger.seq ?? 0}:${trigger.balanceBefore}:${trigger.balanceAfter}`;
}

function deliveredUnitsOf(trigger: AutoBuyTrigger): bigint {
  if (trigger.source === "event") return trigger.deliveredUnits ?? BigInt(0);
  return trigger.balanceAfter - trigger.balanceBefore;
}

/** Rounds down to whole cents. Returns the amount in cents. */
function floorCents(units: bigint, decimals: number): bigint {
  if (decimals <= 2) return units * BigInt(10) ** BigInt(2 - decimals);
  return units / BigInt(10) ** BigInt(decimals - 2);
}

export function decideAutoBuy(input: AutoBuyInput): AutoBuyDecision {
  const { chainKey, trigger, minUsd, maxUsd, alreadyTriggered, busy = false, decimals = USDC_DECIMALS } = input;
  if (chainKey !== "base") return { action: "none", reason: "disabled-chain" };
  if (!(minUsd > 0) || !(maxUsd >= minUsd)) return { action: "none", reason: "bad-limits" };

  const cents = floorCents(deliveredUnitsOf(trigger), decimals);
  if (cents <= BigInt(0)) return { action: "none", reason: "no-delivery" };

  const key = autoBuyKey(trigger);
  if (alreadyTriggered.has(key)) return { action: "none", reason: "duplicate" };
  if (busy) return { action: "none", reason: "busy" };

  const minCents = BigInt(Math.round(minUsd * 100));
  const maxCents = BigInt(Math.round(maxUsd * 100));
  if (cents < minCents) return { action: "none", reason: "below-min", amountUsd: Number(cents) / 100 };

  const capped = cents > maxCents;
  return { action: "start", amountUsd: Number(capped ? maxCents : cents) / 100, key, capped };
}

/* ── Balance watcher (pure part) ───────────────────────────────────────── */

export type DeliveryState = { baseline: bigint | null; seq: number };

export type BalanceDelivery = { balanceBefore: bigint; balanceAfter: bigint; seq: number };

export const INITIAL_DELIVERY_STATE: DeliveryState = { baseline: null, seq: 0 };

/**
 * Feeds one balance sample. The first sample only sets the baseline. A later increase is a
 * delivery and moves the baseline up; a decrease (the purchase spent funds) moves it down.
 */
export function reduceBalanceSample(
  state: DeliveryState,
  balance: bigint,
): { state: DeliveryState; delivery: BalanceDelivery | null } {
  if (state.baseline === null || balance < state.baseline) {
    return { state: { ...state, baseline: balance }, delivery: null };
  }
  if (balance === state.baseline) return { state, delivery: null };
  const seq = state.seq + 1;
  return {
    state: { baseline: balance, seq },
    delivery: { balanceBefore: state.baseline, balanceAfter: balance, seq },
  };
}

/* ── LI.FI route extraction ────────────────────────────────────────────── */

type RouteLike = {
  id?: unknown;
  toChainId?: unknown;
  toAmount?: unknown;
  toAmountMin?: unknown;
  toToken?: { address?: unknown; chainId?: unknown } | null;
};

function parseUnits(value: unknown): bigint | null {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
}

/**
 * Reads the delivered USDC (base units) from a `RouteExecutionCompleted` payload. Uses the
 * guaranteed minimum (`toAmountMin`) when present. `deliveredUnits` is null if the route does
 * not end in Base USDC or carries no usable amount.
 */
export function deliveredFromRoute(route: unknown): { routeId: string | null; deliveredUnits: bigint | null } {
  const r = (route ?? {}) as RouteLike;
  const routeId = typeof r.id === "string" && r.id ? r.id : null;
  const chainId = r.toChainId ?? r.toToken?.chainId;
  const token = typeof r.toToken?.address === "string" ? r.toToken.address.toLowerCase() : "";
  if (chainId !== AUTO_BUY_DELIVERY_CHAIN_ID || token !== BASE_MAINNET_USDC.toLowerCase()) {
    return { routeId, deliveredUnits: null };
  }
  return { routeId, deliveredUnits: parseUnits(r.toAmountMin) ?? parseUnits(r.toAmount) };
}
