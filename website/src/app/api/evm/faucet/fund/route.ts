import { NextRequest, NextResponse } from "next/server";

import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { DEFAULT_EVM_FAUCET_URL } from "@/lib/evm/public-endpoints";
import { clientIpFromRequest } from "@/lib/request-client-ip";

const FAUCET_BASE = (process.env.EVM_FAUCET_URL ?? DEFAULT_EVM_FAUCET_URL).replace(/\/$/, "");
const MAX_BODY_BYTES = 4 * 1024;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const ip = clientIpFromRequest(request);
  if (!checkSlidingWindowRateLimit("evm-faucet-fund", ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  try {
    const res = await fetch(`${FAUCET_BASE}/fund`, {
      method: "POST",
      // The faucet caps how much of its queue one caller may hold, so it needs the origin of
      // the request; it binds to loopback and only reads this header from a loopback peer.
      headers: { "content-type": "application/json", accept: "application/json", "x-people-client-ip": ip },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "faucet_unavailable" }, { status: 502 });
  }
}
