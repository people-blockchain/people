import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { isDatabaseConfigured } from "@/db";
import { MAX_AMBASSADORS, getCommunityCounters, getTopAmbassadors } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/** Public, read-only counters + ambassador leaderboard for /transparency. */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!checkSlidingWindowRateLimit("founders-transparency", clientIp(request), 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const [counters, ambassadors] = await Promise.all([
      getCommunityCounters(),
      getTopAmbassadors(),
    ]);
    return NextResponse.json({ counters, ambassadors, maxAmbassadors: MAX_AMBASSADORS });
  } catch (error) {
    console.error("[founders/transparency]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
