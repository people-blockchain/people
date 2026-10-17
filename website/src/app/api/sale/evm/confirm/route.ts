import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import {
  checkEvmPurchaseAgainstOrder,
  confirmOrderAction,
  normalizeEvmTxHash,
} from "@/lib/sale/evm-order-check";
import { verifyEvmSaleTx } from "@/lib/sale/evm-verify";
import type { SaleStable } from "@/lib/sale/sale-hub";
import { getSaleOrder, tryDeliverPaidOrder } from "@/lib/sale/service";
import { getDbReady } from "@/db";
import { pplSaleOrders } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";

/**
 * WEB-M4: this endpoint is a fan-out to an external RPC — every call runs up to three RPC
 * requests, and a provider 429 there stalls *all* payments, not just the abusive caller. So it
 * requires a signed-in session, is rate-limited per IP, never trusts a client-supplied amount
 * (the payment is re-derived from the order and the on-chain `Purchased` event), and is
 * idempotent: an order that is already paid/delivered is settled, not re-verified on chain.
 */
export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!checkSlidingWindowRateLimit("sale-evm-confirm", ip, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    txHash?: string;
  };
  const orderId = body.orderId?.trim();
  const txHash = body.txHash ? normalizeEvmTxHash(body.txHash) : null;
  if (!orderId || !txHash) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const order = await getSaleOrder(orderId);
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Idempotency: a settled order is returned as-is, and an order that is already paid (or
  // mid-delivery) only has its delivery resumed — never a second on-chain verification.
  const action = confirmOrderAction(order, txHash);
  if (action === "done") {
    return NextResponse.json({ ok: true, status: order.status, deliveryTxId: order.deliveryTxId });
  }
  if (action === "conflict") {
    return NextResponse.json({ error: "payment_tx_used" }, { status: 409 });
  }
  if (action === "not_payable") {
    // expired / failed / cancelled orders are terminal and must not be re-opened by a caller.
    return NextResponse.json({ error: "order_not_payable" }, { status: 409 });
  }
  if (action === "resume_delivery") {
    const delivery = await tryDeliverPaidOrder(orderId);
    return NextResponse.json({
      ok: true,
      status: delivery.ok ? "delivered" : order.status,
      deliveryTxId: delivery.txId,
      code: delivery.code,
    });
  }

  const db = await getDbReady();
  const dupe = await db
    .select({ id: pplSaleOrders.id })
    .from(pplSaleOrders)
    .where(
      and(
        eq(pplSaleOrders.networkId, order.networkId),
        sql`lower(${pplSaleOrders.paymentTxId}) = ${txHash}`,
        ne(pplSaleOrders.id, orderId)
      )
    )
    .limit(1);
  if (dupe[0]) {
    return NextResponse.json({ error: "payment_tx_used" }, { status: 409 });
  }
  const verified = await verifyEvmSaleTx(
    order.stable as SaleStable,
    txHash,
    order.peopleAddress,
    order.pplQuoted * 0.99,
    order.createdAt.getTime(),
    order.expiresAt?.getTime()
  );
  if (!verified.ok) {
    const status = verified.code === "awaiting_confirmations" ? 202 : 400;
    return NextResponse.json({ error: verified.code }, { status });
  }
  const checked = checkEvmPurchaseAgainstOrder(order, verified);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.code }, { status: 400 });
  }
  const now = new Date();
  try {
    await db
      .update(pplSaleOrders)
      .set({
        paymentTxId: txHash,
        status: "paid",
        paymentSeenAt: now,
        confirmedAt: now,
        updatedAt: now,
        pplQuoted: checked.pplToDeliver,
        usdtQuoted: checked.usdtPaid,
      })
      .where(and(eq(pplSaleOrders.id, orderId), eq(pplSaleOrders.status, "pending_payment")));
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "payment_tx_used" }, { status: 409 });
    }
    throw error;
  }

  const delivery = await tryDeliverPaidOrder(orderId);
  return NextResponse.json({
    ok: true,
    status: delivery.ok ? "delivered" : "paid",
    deliveryTxId: delivery.txId,
    code: delivery.code,
  });
}
