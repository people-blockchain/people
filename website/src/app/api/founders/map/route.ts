import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIp } from "@/lib/discover/api-guard";
import { FOUNDER_GOAL } from "@/lib/founders/config";
import { emptyFounderMapStats, getFounderMapStats } from "@/lib/founders/map-stats";

export const dynamic = "force-dynamic";

/** Public read-only CDN cache (60–300 s window). */
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

/**
 * Public read-only aggregate for the /founders verified counter and world map.
 * Returns only the verified total, goal (1,000,000) and per-ISO-country counts.
 * Never returns personal data (addresses, user ids, founder numbers, names) or fake numbers.
 */
export async function GET(request: Request) {
  if (!(await checkSharedRateLimit("founders-map", clientIp(request), 120, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: NO_STORE_HEADERS });
  }

  if (!isDatabaseConfigured()) {
    const empty = emptyFounderMapStats(FOUNDER_GOAL);
    return NextResponse.json(
      { ...empty, available: false },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const stats = await getFounderMapStats();
    return NextResponse.json(
      {
        verifiedCount: stats.verifiedCount,
        goal: stats.goal,
        countries: stats.countries,
        byCountry: stats.byCountry,
        available: true,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error("[founders/map]", error instanceof Error ? error.message : error);
    const empty = emptyFounderMapStats(FOUNDER_GOAL);
    return NextResponse.json(
      { ...empty, available: false, error: "unavailable" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
