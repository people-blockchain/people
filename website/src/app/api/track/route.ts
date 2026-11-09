import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { checkSlidingWindowRateLimit, resetRateLimitStoresForTests } from "@/lib/api-rate-limit";
import { checkDurableRateLimit } from "@/lib/durable-rate-limit";
import { clientIpFromHeaders, geoFromRequestHeaders } from "@/lib/analytics/geo";
import { ingestTrackBatch, trackPayloadHasExcludedPath } from "@/lib/analytics/ingest";
import { MAX_TRACK_BODY_BYTES } from "@/lib/analytics/constants";
import { isSameSiteTrackRequest } from "@/lib/analytics/site-origin";
import { parseTrackPayload } from "@/lib/analytics/validate";

export const runtime = "nodejs";

const TRACK_LIMIT = 60;
const TRACK_WINDOW_MS = 60_000;

async function trackRateLimitAllowed(ip: string): Promise<boolean> {
  try {
    return await checkDurableRateLimit("analytics_track", ip, TRACK_LIMIT, TRACK_WINDOW_MS);
  } catch (error) {
    console.warn(
      "[analytics/track] durable rate limit unavailable, falling back to in-memory",
      error instanceof Error ? error.message : error,
    );
    return checkSlidingWindowRateLimit("analytics_track", ip, TRACK_LIMIT, TRACK_WINDOW_MS);
  }
}

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const hdrs = await headers();
  if (!isSameSiteTrackRequest(hdrs)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const ip = clientIpFromHeaders(hdrs);
  if (!(await trackRateLimitAllowed(ip))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength != null) {
    const bytes = Number(contentLength);
    if (Number.isFinite(bytes) && bytes > MAX_TRACK_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
  }

  const rawBuffer = await req.arrayBuffer();
  if (rawBuffer.byteLength > MAX_TRACK_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const rawBody = new TextDecoder().decode(rawBuffer);
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseTrackPayload(json);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (trackPayloadHasExcludedPath(parsed.payload)) {
    return NextResponse.json({ ok: true, accepted: 0, skipped: true });
  }

  const db = await getDbReady();
  const ua = hdrs.get("user-agent") ?? "";
  try {
    const result = await ingestTrackBatch({
      db,
      ip,
      userAgent: ua,
      geo: geoFromRequestHeaders(hdrs),
      payload: parsed.payload,
    });
    return NextResponse.json({ ok: true, accepted: result.accepted, bot: result.isBot });
  } catch (err) {
    if (err instanceof Error && err.message.includes("ANALYTICS_SALT_SECRET")) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    throw err;
  }
}

/** @internal */
export { resetRateLimitStoresForTests };
