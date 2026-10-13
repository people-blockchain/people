import { and, eq, inArray, sql, sum } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { pplSaleOrders } from "@/db/schema";
import {
  decimalUsdtToMicro,
  microUsdtToDecimal,
  quotePplForUsdt,
  uniquePaymentMicroUsdt,
} from "@/lib/sale/economics";
import { deliverPplToPeopleAddress, isDeliveryIncluded } from "@/lib/sale/delivery";
import type { SaleNetworkId, SaleNetworkKind } from "@/lib/sale/networks";
import { getSaleNetwork } from "@/lib/sale/networks";
import { tonAddressToRaw } from "@/lib/sale/watchers/ton";

const TERMINAL = new Set(["delivered", "expired", "failed", "cancelled"]);
const ORDER_TTL_MS = 45 * 60 * 1000;

/** Tron base58 address: always 34 characters, starting with "T". */
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
/** Solana base58 public key: 32-44 characters. */
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * M05-7: normalizes the buyer-supplied "pay from" address for the non-EVM rails, in the exact
 * form the matching chain's watcher extracts a transfer's sender in (see watchers/tron.ts,
 * watchers/ton.ts, watchers/solana.ts) — findOrderForPayment compares them with plain equality,
 * so storage and extraction must agree on casing/format or a legitimate payment will never
 * match. Tron and Solana addresses are base58 and case-sensitive: never lowercase them. TON
 * addresses are converted to the same normalized `wc:hex` form the TON watcher already uses
 * internally to compare addresses (see tonAddressToRaw in watchers/ton.ts). Returns null when
 * the address does not look valid for the given chain.
 */
export function normalizePayerAddress(kind: SaleNetworkKind, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (kind === "tron") return TRON_ADDRESS_RE.test(trimmed) ? trimmed : null;
  if (kind === "solana") return SOLANA_ADDRESS_RE.test(trimmed) ? trimmed : null;
  if (kind === "ton") return tonAddressToRaw(trimmed);
  return null;
}

/**
 * M05-7: only the three non-EVM rails need a payerAddress — EVM purchases are already bound to
 * the order via the on-chain Purchased event's destination (checkEvmPurchaseAgainstOrder /
 * verifyEvmSaleTx), so requiring a payerAddress there would be redundant.
 */
export function payerAddressRequired(kind: SaleNetworkKind): boolean {
  return kind !== "evm";
}

export async function totalDeliveredSoldPpl(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const db = await getDbReady();
  const rows = await db
    .select({ total: sum(pplSaleOrders.pplQuoted) })
    .from(pplSaleOrders)
    .where(eq(pplSaleOrders.status, "delivered"));
  return Number(rows[0]?.total ?? 0);
}

export async function createSaleOrder(input: {
  networkId: SaleNetworkId;
  stable: string;
  peopleAddress: string;
  usdtAmount: number;
  /** Required for tron/ton/solana (M05-7 payer binding); ignored for evm. */
  payerAddress?: string;
}): Promise<
  | {
      ok: true;
      order: {
        id: string;
        paymentAmount: string;
        paymentMicro: string;
        paymentMemo: string | null;
        pplQuoted: number;
        usdtQuoted: number;
        expiresAt: string;
      };
    }
  | { ok: false; code: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, code: "database_unconfigured" };
  const network = getSaleNetwork(input.networkId);
  if (!network) return { ok: false, code: "unknown_network" };
  if (!network.enabled) return { ok: false, code: "network_unavailable" };
  if (!network.stables.includes(input.stable as "usdt" | "usdc")) {
    return { ok: false, code: "stable_not_supported" };
  }
  const peopleAddress = input.peopleAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(peopleAddress)) {
    return { ok: false, code: "invalid_people_address" };
  }

  // M05-7: Tron/TON/Solana orders must be bound to the exact wallet the buyer pays from, or an
  // unrelated transfer of the right amount could satisfy someone else's order. EVM stays bound
  // via the on-chain Purchased event's destination and never requires this.
  let payerAddress: string | null = null;
  if (payerAddressRequired(network.kind)) {
    const rawPayer = (input.payerAddress ?? "").trim();
    if (!rawPayer) return { ok: false, code: "payer_address_required" };
    payerAddress = normalizePayerAddress(network.kind, rawPayer);
    if (!payerAddress) return { ok: false, code: "invalid_payer_address" };
  }

  const sold = await totalDeliveredSoldPpl();
  const quote = quotePplForUsdt(sold, input.usdtAmount);
  if (quote.pplOut <= 0 || quote.usdtUsed <= 0) {
    return { ok: false, code: "quote_unavailable" };
  }

  const baseMicro = decimalUsdtToMicro(quote.usdtUsed);
  let paymentMicro = baseMicro;
  const db = await getDbReady();

  const memo =
    network.transfer?.memoSupported ? `PPL-${peopleAddress.slice(2, 10)}` : null;

  if (network.kind !== "evm") {
    const salt = Math.floor(Math.random() * 1_000_000);
    paymentMicro = uniquePaymentMicroUsdt(baseMicro, salt);
    for (let attempt = 0; attempt < 5; attempt++) {
      const conflict = await db
        .select({ id: pplSaleOrders.id })
        .from(pplSaleOrders)
        .where(
          and(
            eq(pplSaleOrders.networkId, input.networkId),
            eq(pplSaleOrders.paymentMicro, paymentMicro.toString()),
            inArray(pplSaleOrders.status, ["pending_payment", "confirming", "paid"])
          )
        )
        .limit(1);
      if (conflict.length === 0) break;
      paymentMicro = uniquePaymentMicroUsdt(baseMicro, salt + attempt + 1);
    }
  }

  const expiresAt = new Date(Date.now() + ORDER_TTL_MS);
  const id = crypto.randomUUID();
  await db.insert(pplSaleOrders).values({
    id,
    networkId: input.networkId,
    stable: input.stable,
    peopleAddress,
    payerAddress,
    status: "pending_payment",
    usdtQuoted: quote.usdtUsed,
    pplQuoted: quote.pplOut,
    paymentMicro: paymentMicro.toString(),
    paymentMemo: memo,
    soldPplAtQuote: sold,
    expiresAt,
  });

  return {
    ok: true,
    order: {
      id,
      paymentAmount: microUsdtToDecimal(paymentMicro),
      paymentMicro: paymentMicro.toString(),
      paymentMemo: memo,
      pplQuoted: quote.pplOut,
      usdtQuoted: quote.usdtUsed,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function getSaleOrder(id: string) {
  if (!isDatabaseConfigured()) return null;
  const db = await getDbReady();
  const rows = await db.select().from(pplSaleOrders).where(eq(pplSaleOrders.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function markOrderPayment(
  orderId: string,
  paymentTxId: string,
  status: "confirming" | "paid"
): Promise<boolean> {
  const db = await getDbReady();
  const existing = await db
    .select()
    .from(pplSaleOrders)
    .where(eq(pplSaleOrders.paymentTxId, paymentTxId))
    .limit(1);
  if (existing[0] && existing[0].id !== orderId) {
    return false;
  }
  const now = new Date();
  await db
    .update(pplSaleOrders)
    .set({
      paymentTxId,
      status,
      paymentSeenAt: now,
      updatedAt: now,
      ...(status === "paid" ? { confirmedAt: now } : {}),
    })
    .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "pending_payment")));
  return true;
}

export async function finalizeDeliveredOrder(orderId: string, deliveryTxId: string): Promise<void> {
  const db = await getDbReady();
  const now = new Date();
  await db
    .update(pplSaleOrders)
    .set({ status: "delivered", deliveryTxId, deliveredAt: now, updatedAt: now })
    .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "delivering")));
  await creditReferralForSaleBuy(orderId);
}

/** Million Founders referral: a delivered official-sale purchase pays the buyer's inviter extra points. */
async function creditReferralForSaleBuy(orderId: string): Promise<void> {
  try {
    const order = await getSaleOrder(orderId);
    if (!order || order.status !== "delivered") return;
    const { awardReferralExtra, resolveBuyerByWallet } = await import("@/lib/founders/referral-service");
    const buyer = await resolveBuyerByWallet(order.peopleAddress);
    if (buyer) await awardReferralExtra(buyer, "sale_buy", buyer);
  } catch (error) {
    console.error("[sale] referral credit failed", error instanceof Error ? error.message : typeof error);
  }
}

/**
 * Claim-then-send: the order is moved to "delivering" by an atomic conditional update before
 * any PPL is sent, so two concurrent calls (confirm route + cron watcher, or two confirms) can
 * never both pass the claim and send PPL twice for the same order.
 */
export async function tryDeliverPaidOrder(orderId: string): Promise<{ ok: boolean; code?: string; txId?: string }> {
  const order = await getSaleOrder(orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status === "delivered") return { ok: true, txId: order.deliveryTxId ?? undefined };
  // A delivery was already broadcast for this order. Never sign a second transfer — just
  // look for the first one on chain and settle the order once it is actually included.
  if (order.status === "delivering") {
    if (!order.deliveryTxId) return { ok: false, code: "delivery_in_progress" };
    if (!(await isDeliveryIncluded(order.deliveryTxId))) {
      return { ok: false, code: "delivery_pending", txId: order.deliveryTxId };
    }
    await finalizeDeliveredOrder(orderId, order.deliveryTxId);
    return { ok: true, txId: order.deliveryTxId };
  }
  if (order.status !== "paid") return { ok: false, code: "not_paid" };

  const db = await getDbReady();
  const claimed = await db
    .update(pplSaleOrders)
    .set({ status: "delivering", updatedAt: new Date() })
    .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "paid")))
    .returning({ id: pplSaleOrders.id });
  if (!claimed[0]) {
    const fresh = await getSaleOrder(orderId);
    if (fresh?.status === "delivered") return { ok: true, txId: fresh.deliveryTxId ?? undefined };
    return { ok: false, code: "delivery_in_progress" };
  }

  const delivery = await deliverPplToPeopleAddress(order.peopleAddress, order.pplQuoted);
  if (!delivery.ok) {
    if (delivery.txId) {
      // Broadcast but not yet in a block: keep the tx id and stay in "delivering" so the
      // next call polls this same transaction instead of sending a second one.
      await db
        .update(pplSaleOrders)
        .set({ deliveryTxId: delivery.txId, updatedAt: new Date() })
        .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "delivering")));
      return { ok: false, code: delivery.code, txId: delivery.txId };
    }
    // Nothing was broadcast (rejected up front, no key, bad amount) — safe to retry later.
    await db
      .update(pplSaleOrders)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "delivering")));
    return { ok: false, code: delivery.code };
  }
  await finalizeDeliveredOrder(orderId, delivery.txId);
  return { ok: true, txId: delivery.txId };
}

export async function expireStaleOrders(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const db = await getDbReady();
  const now = new Date();
  await db
    .update(pplSaleOrders)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(pplSaleOrders.status, "pending_payment"),
        sql`${pplSaleOrders.expiresAt} < ${now}`
      )
    );
  return 0;
}

export async function listOpenTransferOrders(networkId: SaleNetworkId) {
  const db = await getDbReady();
  return db
    .select()
    .from(pplSaleOrders)
    .where(
      and(
        eq(pplSaleOrders.networkId, networkId),
        inArray(pplSaleOrders.status, ["pending_payment", "confirming"])
      )
    );
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}
