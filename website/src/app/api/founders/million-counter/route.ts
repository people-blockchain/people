import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { FOUNDER_GOAL } from "@/lib/founders/config";
import { getCommunityCounters } from "@/lib/founders/transparency";

export const dynamic = "force-dynamic";

/**
 * Public counter for the Million Founders hero.
 * Uses verified founders (human verification completed), not raw registration rows.
 */
export async function GET() {
  const goal = FOUNDER_GOAL;
  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      current: 0,
      goal,
      source: "stub",
      todo: "Connect database to read verified founder count from getCommunityCounters",
    });
  }
  try {
    const { verifiedPeople } = await getCommunityCounters();
    return NextResponse.json(
      { current: verifiedPeople, goal, source: "verified" },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" } },
    );
  } catch (error) {
    console.error("[founders/million-counter]", error instanceof Error ? error.message : error);
    return NextResponse.json({ current: 0, goal, source: "error" }, { status: 500 });
  }
}
