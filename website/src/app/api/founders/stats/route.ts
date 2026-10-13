import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/db";
import { getFounderPublicStats } from "@/lib/founders/service";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  try {
    const stats = await getFounderPublicStats();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[founders/stats]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
