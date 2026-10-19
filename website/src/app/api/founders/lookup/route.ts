import { NextResponse } from "next/server";
import { checkRateLimitDurableFirst } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isDatabaseConfigured } from "@/db";
import { lookupFounder } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/**
 * Look up a founder by number or wallet address. Returns the shortened wallet only —
 * enumeration of `/api/founders/lookup?q=1..N` must not yield full addresses, and the
 * name/avatar stay null unless the founder opted in.
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!(await checkRateLimitDurableFirst("founders-lookup", clientIp(request), 30, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const founder = await lookupFounder(q);
    if (!founder) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ founder });
  } catch (error) {
    console.error("[founders/lookup]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
