import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { checkDurableRateLimit } from "@/lib/durable-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { allowlistDescribeLang, sanitizeDescribeText } from "@/lib/describe-helper-lang";
import { parseDescribeHelperKind, type DescribeHelperKind } from "@/lib/describe-helper-kinds";
import { parseTokenDescription, normalizeTokenPromoBps } from "@/lib/token-describe-parse";
import { formatSpotPpl } from "@/lib/token-curve-start-price";
import { parseNftDescription } from "@/lib/nft-describe-parse";
import { parseContractDescription } from "@/lib/contract-describe-parse";
import { parseDiscoverDescription } from "@/lib/discover-describe-parse";
import { parseLavkaDescription } from "@/lib/lavka-describe-parse";

export const DESCRIBE_IP_LIMIT = 10;
export const DESCRIBE_IP_WINDOW_MS = 60_000;
export const DESCRIBE_MIN_CHARS = 12;
export const DESCRIBE_MAX_CHARS = 4_000;

const RATE_NS = "factory-describe";

async function ipRateLimitAllowed(ip: string): Promise<boolean> {
  try {
    return await checkDurableRateLimit(RATE_NS, ip, DESCRIBE_IP_LIMIT, DESCRIBE_IP_WINDOW_MS);
  } catch (error) {
    console.warn(
      "[factory-describe] durable rate limit unavailable, falling back to in-memory",
      error instanceof Error ? error.message : error,
    );
    return checkSlidingWindowRateLimit(RATE_NS, ip, DESCRIBE_IP_LIMIT, DESCRIBE_IP_WINDOW_MS);
  }
}

export async function handleDescribeHelperRequest(
  request: Request,
  forcedKind?: DescribeHelperKind,
): Promise<Response> {
  const ip = clientIpFromRequest(request);
  if (!(await ipRateLimitAllowed(ip))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    lang?: string;
    type?: string;
    promoBps?: unknown;
  };
  const kind = forcedKind ?? parseDescribeHelperKind(body.type);
  if (!kind) {
    return Response.json({ error: "unknown_type" }, { status: 400 });
  }

  const description = sanitizeDescribeText(body.description ?? "");
  if (description.length < DESCRIBE_MIN_CHARS) {
    return Response.json({ error: "description_too_short" }, { status: 400 });
  }
  if (description.length > DESCRIBE_MAX_CHARS) {
    return Response.json({ error: "description_too_long" }, { status: 413 });
  }

  const lang = allowlistDescribeLang(body.lang);

  if (kind === "token") {
    const parsed = await parseTokenDescription(description, lang, normalizeTokenPromoBps(body.promoBps));
    if (!parsed) return Response.json({ error: "parse_failed" }, { status: 422 });
    return Response.json({
      type: "token",
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

  if (kind === "nft") {
    const parsed = await parseNftDescription(description, lang);
    if (!parsed) return Response.json({ error: "parse_failed" }, { status: 422 });
    return Response.json({ type: "nft", ...parsed });
  }
  if (kind === "contract") {
    const parsed = await parseContractDescription(description, lang);
    if (!parsed) return Response.json({ error: "parse_failed" }, { status: 422 });
    return Response.json({ type: "contract", ...parsed });
  }
  if (kind === "discover") {
    const parsed = await parseDiscoverDescription(description, lang);
    if (!parsed) return Response.json({ error: "parse_failed" }, { status: 422 });
    return Response.json({ type: "discover", ...parsed });
  }
  const parsed = await parseLavkaDescription(description, lang);
  if (!parsed) return Response.json({ error: "parse_failed" }, { status: 422 });
  return Response.json({ type: "lavka", ...parsed });
}
