import { NextResponse } from "next/server";
import { DISCOVER_TOKENS_CACHE_CONTROL, listDiscoverTokensFromNode } from "@/lib/discover/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await listDiscoverTokensFromNode();
  return NextResponse.json({ tokens }, { headers: { "Cache-Control": DISCOVER_TOKENS_CACHE_CONTROL } });
}
