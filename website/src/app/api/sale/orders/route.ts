import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { createSaleOrder } from "@/lib/sale/service";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import type { SaleNetworkId } from "@/lib/sale/sale-hub";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!await checkSharedRateLimit("sale-order", ip, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    networkId?: string;
    stable?: string;
    peopleAddress?: string;
    usdtAmount?: number;
  };
  const result = await createSaleOrder({
    networkId: (body.networkId ?? "base") as SaleNetworkId,
    stable: body.stable ?? "usdc",
    peopleAddress: body.peopleAddress ?? "",
    usdtAmount: Number(body.usdtAmount ?? 0),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: 400 });
  }
  return NextResponse.json(result.order);
}
