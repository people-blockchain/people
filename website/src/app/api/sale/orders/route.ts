import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { checkDurableRateLimit } from "@/lib/durable-rate-limit";
import { createSaleOrder } from "@/lib/sale/service";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import type { SaleNetworkId } from "@/lib/sale/sale-hub";

/** AUDIT M8: long-lived per-account budget, shared across instances (see durable-rate-limit). */
const USER_ORDER_LIMIT = 30;
const USER_ORDER_WINDOW_MS = 60 * 60 * 1000;

async function userOrderBudgetAllowed(userId: string): Promise<boolean> {
  try {
    return await checkDurableRateLimit("sale-order-user", userId, USER_ORDER_LIMIT, USER_ORDER_WINDOW_MS);
  } catch (error) {
    console.warn(
      "[sale/orders] durable rate limit unavailable, falling back to in-memory",
      error instanceof Error ? error.message : error,
    );
    return checkSlidingWindowRateLimit("sale-order-user", userId, USER_ORDER_LIMIT, USER_ORDER_WINDOW_MS);
  }
}

/**
 * AUDIT M8: creating an order writes a row and runs a SUM over all delivered orders, so it is
 * not open to anonymous callers. Like `/api/sale/evm/confirm` (which an order needs anyway to
 * settle) it requires a signed-in session, on top of the per-IP limit and a durable per-account
 * budget.
 */
export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!checkSlidingWindowRateLimit("sale-order", ip, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
  }
  if (!(await userOrderBudgetAllowed(session.user.id))) {
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
