import { NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { fetchCommunityAgentSnapshot } from "@/lib/evm/community-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  if (!await checkSharedRateLimit("community-agent-live", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const snapshot = await fetchCommunityAgentSnapshot(10);
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[agents/community-agent]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
