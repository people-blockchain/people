/** Tolerances between the on-chain Purchased event and the order quote. */
export const EVM_PPL_OUT_MAX_RATIO = 1.01;
export const EVM_USDT_PAID_MIN_RATIO = 0.99;

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * M05-4: RPCs accept hex in any letter case, so the same tx can be submitted as
 * "0xAB.." or "0xab..". Always store/compare the lowercase form, or the unique
 * index on (networkId, paymentTxId) lets one payment confirm many orders.
 */
export function normalizeEvmTxHash(raw: string): `0x${string}` | null {
  const trimmed = raw.trim();
  return TX_HASH_RE.test(trimmed) ? (trimmed.toLowerCase() as `0x${string}`) : null;
}

export type EvmPurchaseCheck =
  | { ok: true; pplToDeliver: number; usdtPaid: number }
  | { ok: false; code: "ppl_out_exceeds_quote" | "usdt_below_quote" };

export type ConfirmOrderAction =
  | "done"
  | "resume_delivery"
  | "conflict"
  | "not_payable"
  | "verify";

/**
 * WEB-M4: what a confirm request may do, decided before any RPC call. An order that is already
 * paid/delivered is settled idempotently instead of being re-verified on chain, and a different
 * tx hash against an already-paid order is a conflict (the payment is bound to one tx).
 */
export function confirmOrderAction(
  order: { status: string; paymentTxId: string | null },
  txHash: string,
): ConfirmOrderAction {
  if (order.status === "delivered") return "done";
  if (order.status === "paid" || order.status === "delivering") {
    return order.paymentTxId && order.paymentTxId.toLowerCase() !== txHash
      ? "conflict"
      : "resume_delivery";
  }
  return order.status === "pending_payment" ? "verify" : "not_payable";
}

/**
 * The sale contract event is not trusted beyond the order: PPL above the quote
 * (+1%) or payment below the quote (−1%) is rejected, and delivery never exceeds
 * the quoted PPL.
 */
export function checkEvmPurchaseAgainstOrder(
  order: { pplQuoted: number; usdtQuoted: number },
  verified: { pplOut: number; usdtPaid: number },
): EvmPurchaseCheck {
  if (!(verified.pplOut <= order.pplQuoted * EVM_PPL_OUT_MAX_RATIO)) {
    return { ok: false, code: "ppl_out_exceeds_quote" };
  }
  if (!(verified.usdtPaid >= order.usdtQuoted * EVM_USDT_PAID_MIN_RATIO)) {
    return { ok: false, code: "usdt_below_quote" };
  }
  return { ok: true, pplToDeliver: Math.min(verified.pplOut, order.pplQuoted), usdtPaid: verified.usdtPaid };
}
