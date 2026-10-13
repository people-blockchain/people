import { and, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { pplSaleOrders } from "@/db/schema";
import { tryDeliverPaidOrder } from "../service";
import { findOrderForPayment, type WatchedPayment } from "./match";
import { fetchSolanaSplTransfers } from "./solana";
import { fetchTonIncoming } from "./ton";
import { fetchTronUsdtTransfers } from "./tron";

async function matchAndAdvance(
  networkId: string,
  paymentTxId: string,
  payment: WatchedPayment
): Promise<void> {
  const db = await getDbReady();
  const orders = await db
    .select()
    .from(pplSaleOrders)
    .where(eq(pplSaleOrders.networkId, networkId));
  const order = findOrderForPayment(orders, payment);
  if (!order) return;

  const dup = await db
    .select({ id: pplSaleOrders.id })
    .from(pplSaleOrders)
    .where(eq(pplSaleOrders.paymentTxId, paymentTxId))
    .limit(1);
  if (dup[0] && dup[0].id !== order.id) return;

  const now = new Date();
  // Guarded on the status the matcher saw: an order that expired (or was settled by a
  // concurrent tick) between the select and this write must not be flipped back to "paid".
  const claimed = await db
    .update(pplSaleOrders)
    .set({
      paymentTxId,
      status: "paid",
      paymentSeenAt: now,
      confirmedAt: now,
      updatedAt: now,
    })
    .where(and(eq(pplSaleOrders.id, order.id), eq(pplSaleOrders.status, "pending_payment")))
    .returning({ id: pplSaleOrders.id });
  if (!claimed[0]) return;

  await tryDeliverPaidOrder(order.id);
}

export async function runTransferPaymentWatchers(): Promise<{ matched: number }> {
  let matched = 0;
  for (const tx of await fetchTronUsdtTransfers()) {
    await matchAndAdvance("tron", tx.txId, {
      amountMicro: tx.amountMicro,
      memo: null,
      stable: "usdt",
      timestamp: tx.timestamp,
      fromAddress: tx.from,
    });
    matched += 1;
  }
  for (const tx of await fetchTonIncoming()) {
    await matchAndAdvance("ton", tx.txId, {
      amountMicro: tx.amountMicro,
      memo: tx.memo,
      timestamp: tx.timestamp,
      fromAddress: tx.from,
    });
    matched += 1;
  }
  for (const tx of await fetchSolanaSplTransfers()) {
    await matchAndAdvance("solana", tx.txId, {
      amountMicro: tx.amountMicro,
      memo: tx.memo,
      stable: tx.stable,
      timestamp: tx.timestamp,
      fromAddress: tx.from,
    });
    matched += 1;
  }
  return { matched };
}
