import { NextRequest, NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { handleEvmCompatGet } from "@/lib/evm/ovn-compat";
import { clientIpFromRequest } from "@/lib/request-client-ip";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

/**
 * Catalog listings (assets / liquidity-pools) are the two calls the explorer token list and the
 * swap page both block on. They are already refreshed in-process with stale-while-revalidate, so
 * letting Vercel's edge answer repeat requests for 30 s (and serve stale for 5 min while
 * revalidating) removes the full log scan from the visitor's critical path entirely.
 */
const CACHE_HEADER = "public, s-maxage=30, stale-while-revalidate=300";

function cacheHeaderFor(path: string): string | null {
  // Live balances (address/accounts/blocks/transactions) stay uncached.
  const [root] = path.split("/");
  return root === "assets" || root === "liquidity-pools" ? CACHE_HEADER : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (
    !checkSlidingWindowRateLimit("evm-compat", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { path } = await context.params;
  const joined = (path ?? []).map((p) => encodeURIComponent(p)).join("/");
  try {
    const { status, body } = await handleEvmCompatGet(joined, request.nextUrl.searchParams);
    const cacheControl = status === 200 ? cacheHeaderFor(joined) : null;
    return NextResponse.json(body, {
      status,
      ...(cacheControl ? { headers: { "Cache-Control": cacheControl } } : {}),
    });
  } catch {
    return NextResponse.json({ error: "compat_unavailable" }, { status: 502 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "use_evm_wallet" }, { status: 405 });
}
