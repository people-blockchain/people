import { and, eq, sql, sum } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { pplSaleOrders } from "@/db/schema";
import {
  decimalUsdtToMicro,
  microUsdtToDecimal,
  quotePplForUsdt,
} from "@/lib/sale/economics";
import { deliverPplToPeopleAddress, isDeliveryIncluded } from "@/lib/sale/delivery";
import type { SaleNetworkId, SaleStable } from "@/lib/sale/sale-hub";
import { getSaleNetwork } from "@/lib/sale/sale-hub";

const TERMINAL = new Set(["delivered", "expired", "failed", "cancelled"]);
const ORDER_TTL_MS = 45 * 60 * 1000;

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
  if (input.networkId !== "base") return { ok: false, code: "unknown_network" };
  const network = getSaleNetwork("base");
  if (!network?.enabled) return { ok: false, code: "network_unavailable" };
  if (!network.stables.includes(input.stable as SaleStable)) {
    return { ok: false, code: "stable_not_supported" };
  }
  const peopleAddress = input.peopleAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(peopleAddress)) {
    return { ok: false, code: "invalid_people_address" };
  }

  const sold = await totalDeliveredSoldPpl();
  const quote = quotePplForUsdt(sold, input.usdtAmount);
  if (quote.pplOut <= 0 || quote.usdtUsed <= 0) {
    return { ok: false, code: "quote_unavailable" };
  }

  const paymentMicro = decimalUsdtToMicro(quote.usdtUsed);
  const db = await getDbReady();
  const expiresAt = new Date(Date.now() + ORDER_TTL_MS);
  const id = crypto.randomUUID();
  await db.insert(pplSaleOrders).values({
    id,
    networkId: "base",
    stable: input.stable,
    peopleAddress,
    payerAddress: null,
    status: "pending_payment",
    usdtQuoted: quote.usdtUsed,
    pplQuoted: quote.pplOut,
    paymentMicro: paymentMicro.toString(),
    paymentMemo: null,
    soldPplAtQuote: sold,
    expiresAt,
  });

  return {
    ok: true,
    order: {
      id,
      paymentAmount: microUsdtToDecimal(paymentMicro),
      paymentMicro: paymentMicro.toString(),
      paymentMemo: null,
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
}

export async function tryDeliverPaidOrder(orderId: string): Promise<{ ok: boolean; code?: string; txId?: string }> {
  const order = await getSaleOrder(orderId);
  if (!order) return { ok: false, code: "not_found" };
  if (order.status === "delivered") return { ok: true, txId: order.deliveryTxId ?? undefined };
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
      await db
        .update(pplSaleOrders)
        .set({ deliveryTxId: delivery.txId, updatedAt: new Date() })
        .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "delivering")));
      return { ok: false, code: delivery.code, txId: delivery.txId };
    }
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
      and(eq(pplSaleOrders.status, "pending_payment"), sql`${pplSaleOrders.expiresAt} < ${now}`),
    );
  return 0;
}

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has(status);
}
