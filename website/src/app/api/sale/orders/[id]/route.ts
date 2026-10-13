import { NextResponse } from "next/server";
import { getSaleOrder } from "@/lib/sale/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const order = await getSaleOrder(id);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    id: order.id,
    networkId: order.networkId,
    stable: order.stable,
    peopleAddress: order.peopleAddress,
    status: order.status,
    usdtQuoted: order.usdtQuoted,
    pplQuoted: order.pplQuoted,
    paymentMicro: order.paymentMicro,
    paymentMemo: order.paymentMemo,
    paymentTxId: order.paymentTxId,
    deliveryTxId: order.deliveryTxId,
    expiresAt: order.expiresAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
  });
}
