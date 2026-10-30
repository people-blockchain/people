import { NextRequest, NextResponse } from "next/server";
import { checkSharedRateLimit } from "@/lib/api-rate-limit";
import { evmCompatCacheControl } from "@/lib/evm/compat-cache";
import { handleEvmCompatGet } from "@/lib/evm/people-compat";
import { clientIpFromRequest } from "@/lib/request-client-ip";

const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

function cacheHeaderFor(path: string): string | null {
  return evmCompatCacheControl(path);
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (
    !await checkSharedRateLimit("evm-compat", clientIpFromRequest(request), RATE_LIMIT, RATE_WINDOW_MS)
  ) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { path } = await context.params;
  const joined = (path ?? []).map((p) => encodeURIComponent(p)).join("/");
  try {
    const { status, body } = await handleEvmCompatGet(joined, request.nextUrl.searchParams);
    const cacheControl = status === 200 ? cacheHeaderFor(joined) : null;
    return NextResponse.json(body, {
      status,
      ...(cacheControl ? { headers: { "Cache-Control": cacheControl } } : {}),
    });
  } catch {
    return NextResponse.json({ error: "compat_unavailable" }, { status: 502 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "use_evm_wallet" }, { status: 405 });
}
