import { NextResponse } from "next/server";
import { checkSlidingWindowRateLimit } from "@/lib/api-rate-limit";
import { clientIp, discoverApiGuard } from "@/lib/discover/api-guard";
import { firstProjectFieldError } from "@/lib/discover/field-limits";
import { DISCOVER_SCORING } from "@/lib/discover/scoring-config";
import { createProject } from "@/lib/discover/service";
import { isSafeLinkTarget, isSafeVideoUri } from "@/lib/discover/url-policy";
import { serializeScreenshotUris } from "@/lib/discover/screenshots";
import { listDiscoverTokensFromNode } from "@/lib/discover/seed";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export async function POST(request: Request) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const body = (await request.json()) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  const rawVideo = String(body.videoUri ?? "").trim();
  const videoUri = rawVideo || null;
  const idea = String(body.idea ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const whyToken = String(body.whyToken ?? "").trim();
  const tokenAssetId = String(body.tokenAssetId ?? "").trim();
  const tokenLink = String(body.tokenLink ?? "").trim();
  const productUrl = body.productUrl ? String(body.productUrl).trim() : null;
  const screenshotUris = Array.isArray(body.screenshotUris)
    ? body.screenshotUris.map((u) => String(u).trim()).filter(Boolean)
    : [];

  if (!title || !idea || !audience || !whyToken || !tokenAssetId || !tokenLink) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  // WEB-M2: reject over-long content before any external lookup or DB write.
  const fieldError = firstProjectFieldError({
    title,
    idea,
    audience,
    whyToken,
    tokenAssetId,
    tokenLink,
    productUrl,
    videoUri,
    screenshotUris,
  });
  if (fieldError) {
    return NextResponse.json({ error: fieldError }, { status: 400 });
  }
  if (!isSafeLinkTarget(tokenLink)) {
    return NextResponse.json({ error: "invalid_token_link" }, { status: 400 });
  }
  if (productUrl && !isSafeLinkTarget(productUrl)) {
    return NextResponse.json({ error: "invalid_product_url" }, { status: 400 });
  }
  if (videoUri && !isSafeVideoUri(videoUri)) {
    return NextResponse.json({ error: "invalid_video_uri" }, { status: 400 });
  }

  // WEB-M2: project creation has no rate limit of its own — an account could otherwise write
  // unbounded rows (each also costing a token lookup) and every feed visitor pays for them.
  const { rateLimits } = DISCOVER_SCORING;
  const ip = clientIp(request);
  const limited =
    !checkSlidingWindowRateLimit(
      "discover-project-create",
      guard.userId,
      rateLimits.projectsPerUserPerHour,
      HOUR_MS,
    ) ||
    !checkSlidingWindowRateLimit(
      "discover-project-create-day",
      guard.userId,
      rateLimits.projectsPerUserPerDay,
      DAY_MS,
    ) ||
    !checkSlidingWindowRateLimit(
      "discover-project-create-ip",
      ip,
      rateLimits.projectsPerIpPerHour,
      HOUR_MS,
    );
  if (limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const tokens = await listDiscoverTokensFromNode();
  const token = tokens.find((t) => t.assetId === tokenAssetId);

  try {
    const project = await createProject(guard.userId, {
      title,
      videoUri,
      screenshotUris: serializeScreenshotUris(screenshotUris),
      tokenIconUri: token?.imageUri ?? null,
      idea,
      audience,
      whyToken,
      tokenAssetId,
      tokenLink,
      productUrl,
    });
    return NextResponse.json({ project: { id: project.id } });
  } catch (error) {
    // createProject re-validates links/lengths; surface that as 400, not a 500.
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("invalid_")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    throw error;
  }
}
