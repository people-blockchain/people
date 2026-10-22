import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isDatabaseConfigured } from "@/db";
import { lookupFounder } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/**
 * AUDIT M7: the answer depends only on `q` (part of the CDN cache key) and contains only
 * public, opt-in data, so a short shared cache absorbs repeated lookups of the same founder.
 * Misses are cached more briefly so a fresh registration shows up quickly.
 */
const FOUND_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" };
const NOT_FOUND_CACHE_HEADERS = { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" };

/**
 * Look up a founder by number or wallet address. Returns the shortened wallet only —
 * enumeration of `/api/founders/lookup?q=1..N` must not yield full addresses, and the
 * name/avatar stay null unless the founder opted in.
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!await checkSharedRateLimit("founders-lookup", clientIp(request), 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const founder = await lookupFounder(q);
    if (!founder) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NOT_FOUND_CACHE_HEADERS });
    }
    return NextResponse.json({ founder }, { headers: FOUND_CACHE_HEADERS });
  } catch (error) {
    console.error("[founders/lookup]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
