import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { evmContractsReady } from "@/lib/evm/config";
import { fetchTokenMarketSnapshotCached } from "@/lib/evm/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!evmContractsReady()) {
    return NextResponse.json({ hasMarket: false }, { status: 503 });
  }
  if (!checkSlidingWindowRateLimit("evm-token-market", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { token } = await context.params;
  if (!isAddress(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  try {
    const snapshot = await fetchTokenMarketSnapshotCached(token);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[evm/market]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
