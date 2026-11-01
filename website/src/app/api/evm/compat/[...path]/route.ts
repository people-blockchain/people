import { NextRequest, NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { handleEvmCompatGet } from "@/lib/evm/people-compat";
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

const TX_CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=300";

function cacheHeaderFor(path: string): string | null {
  // Live balances stay uncached; address history may be partial and is edge-cached briefly.
  const parts = path.split("/").filter(Boolean);
  const [root] = parts;
  if (root === "assets" || root === "liquidity-pools") return CACHE_HEADER;
  if (root === "address" && parts[2] === "transactions") return TX_CACHE_HEADER;
  return null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (
    !await checkSharedRateLimit("evm-compat", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { path } = await context.params;
  const joined = (path ?? []).map((p) => encodeURIComponent(p)).join("/");
  try {
    const { status, body, headers } = await handleEvmCompatGet(joined, request.nextUrl.searchParams);
    const cacheControl = status === 200 ? cacheHeaderFor(joined) : null;
    const responseHeaders = new Headers(headers);
    if (cacheControl) responseHeaders.set("Cache-Control", cacheControl);
    return NextResponse.json(body, {
      status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: "compat_unavailable" }, { status: 502 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "use_evm_wallet" }, { status: 405 });
}
