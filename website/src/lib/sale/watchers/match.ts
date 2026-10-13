export type WatchedSaleOrder = {
  id: string;
  status: string;
  stable: string;
  paymentMicro: string;
  paymentMemo: string | null;
  createdAt: Date;
  /** Quote validity; a transfer that landed after this never pays for the order. */
  expiresAt?: Date | null;
  /**
   * M05-7: the wallet the buyer committed to pay FROM (Tron/TON/Solana only — EVM is bound via
   * the on-chain Purchased event's destination instead and never sets this). Null on orders
   * created before this field existed, which keep matching on amount alone.
   */
  payerAddress?: string | null;
};

export type WatchedPayment = {
  amountMicro: bigint;
  memo: string | null;
  /** Stablecoin the transfer was made in, when the watcher knows it. */
  stable?: string;
  /** Block time in ms; when given, transfers made before the order was created never match. */
  timestamp?: number;
  /**
   * The sender of this transfer, in the same normalized form the chain's watcher always
   * produces (case-sensitive base58 for Tron/Solana, lowercase `wc:hex` for TON) — matches the
   * normalization applied to `WatchedSaleOrder.payerAddress` at order-creation time.
   */
  fromAddress?: string | null;
};

/**
 * Pending order paid by this transfer: exact unique amount, same stable, made inside the
 * order's quote window, and — when the order records a payerAddress (M05-7) — sent from that
 * exact address. All bounds matter: a transfer from before the order was created (replayed
 * history), one that landed after the quote expired, and one sent by someone other than the
 * buyer who claimed the order must never pay for it. The time window is only checked when the
 * watcher reports a block time, since the Tron/TON feeds do not always carry one. The payer
 * check is only enforced when the order has a payerAddress recorded — orders created before
 * this field existed (payerAddress null) keep matching on amount alone, so they are not broken
 * by this change.
 */
export function findOrderForPayment<T extends WatchedSaleOrder>(orders: T[], payment: WatchedPayment): T | undefined {
  return orders.find(
    (o) =>
      o.status === "pending_payment" &&
      BigInt(o.paymentMicro) === payment.amountMicro &&
      (payment.stable === undefined || o.stable === payment.stable) &&
      (payment.timestamp === undefined ||
        (payment.timestamp >= o.createdAt.getTime() &&
          (!o.expiresAt || payment.timestamp <= o.expiresAt.getTime()))) &&
      (!o.paymentMemo || !payment.memo || o.paymentMemo === payment.memo) &&
      (!o.payerAddress || (payment.fromAddress != null && payment.fromAddress === o.payerAddress)),
  );
}
