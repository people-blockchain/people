import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { resolveMillionCounterPayload } from "@/lib/founders/million-counter";
import { getCommunityCounters } from "@/lib/founders/transparency";
import { showCommunityStats } from "@/lib/show-community-stats";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
};

/**
 * Public founder-count endpoint.
 * Never reveals a live verified-wallet count before the Founding 1,000 lock-in,
 * even if `NEXT_PUBLIC_SHOW_COMMUNITY_STATS` is on.
 */
export async function GET() {
  const hidden = resolveMillionCounterPayload({ statsPublic: false, verifiedCount: null });

  if (!showCommunityStats()) {
    return NextResponse.json(hidden, { headers: CACHE_HEADERS });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      resolveMillionCounterPayload({ statsPublic: true, verifiedCount: null }),
      { headers: CACHE_HEADERS },
    );
  }
  try {
    const { verifiedPeople } = await getCommunityCounters();
    return NextResponse.json(
      resolveMillionCounterPayload({ statsPublic: true, verifiedCount: verifiedPeople }),
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error("[founders/million-counter]", error instanceof Error ? error.message : error);
    return NextResponse.json(hidden, { status: 500, headers: CACHE_HEADERS });
  }
}
