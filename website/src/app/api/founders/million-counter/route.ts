import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { FOUNDER_GOAL } from "@/lib/founders/config";
import { emptyFounderMapStats, getFounderMapStats } from "@/lib/founders/map-stats";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

/**
 * Public counter and country aggregate for the Million Founders hero and world map.
 * Uses verified founders (human verification completed), not raw registration rows.
 */
export async function GET() {
  const goal = FOUNDER_GOAL;
  if (!isDatabaseConfigured()) {
    const empty = emptyFounderMapStats(goal);
    return NextResponse.json(
      {
        current: 0,
        verifiedCount: 0,
        goal,
        countries: empty.countries,
        byCountry: empty.byCountry,
        source: "stub",
      },
      { headers: NO_STORE_HEADERS },
    );
  }
  try {
    const stats = await getFounderMapStats();
    return NextResponse.json(
      {
        current: stats.verifiedCount,
        verifiedCount: stats.verifiedCount,
        goal: stats.goal,
        countries: stats.countries,
        byCountry: stats.byCountry,
        source: "verified",
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error("[founders/million-counter]", error instanceof Error ? error.message : error);
    const empty = emptyFounderMapStats(goal);
    return NextResponse.json(
      {
        current: 0,
        verifiedCount: 0,
        goal,
        countries: empty.countries,
        byCountry: empty.byCountry,
        source: "error",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
