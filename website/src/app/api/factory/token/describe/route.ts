import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { checkDurableRateLimit } from "@/lib/durable-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { parseTokenDescription } from "@/lib/token-describe-parse";
import { formatSpotPpl } from "@/lib/token-curve-start-price";

export const runtime = "nodejs";

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60_000;
const MAX_DESCRIPTION_CHARS = 4_000;
const MIN_DESCRIPTION_CHARS = 12;

async function ipRateLimitAllowed(ip: string): Promise<boolean> {
  try {
    return await checkDurableRateLimit("factory-token-describe", ip, IP_LIMIT, IP_WINDOW_MS);
  } catch (error) {
    console.warn(
      "[factory-token-describe] durable rate limit unavailable, falling back to in-memory",
      error instanceof Error ? error.message : error,
    );
    return checkSlidingWindowRateLimit("factory-token-describe", ip, IP_LIMIT, IP_WINDOW_MS);
  }
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!(await ipRateLimitAllowed(ip))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { description?: string; lang?: string };
  const description = (body.description ?? "").trim();
  if (description.length < MIN_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: "description_too_short" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: "description_too_long" }, { status: 413 });
  }

  const lang = typeof body.lang === "string" && body.lang.length >= 2 ? body.lang.slice(0, 8) : "en";

  const parsed = await parseTokenDescription(description, lang);
  if (!parsed) {
    return NextResponse.json({ error: "parse_failed" }, { status: 422 });
  }

  return NextResponse.json({
    name: parsed.name,
    symbol: parsed.symbol,
    supply: parsed.supply,
    rationale: parsed.rationale,
    source: parsed.source,
    warnings: parsed.warnings,
    price: {
      spotPplPerWholeToken: parsed.price.spotPplPerWholeToken,
      spotPplFormatted: formatSpotPpl(parsed.price.spotPplPerWholeToken),
      bondingCurveWholeTokens: parsed.price.bondingCurveWholeTokens.toString(),
      totalSupplyWhole: parsed.price.totalSupplyWhole.toString(),
      virtualNativePpl: 60,
    },
  });
}