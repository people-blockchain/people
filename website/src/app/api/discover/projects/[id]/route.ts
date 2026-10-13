import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import {
  getAuthorFeedback,
  getProjectById,
  getReactionSummary,
  getUserReaction,
  isFollowing,
  resubmitProject,
  trackCardVisit,
} from "@/lib/discover/service";
import { isVerifiedHuman } from "@/lib/discover/verified-human";
import { discoverApiGuard } from "@/lib/discover/api-guard";
import { firstProjectFieldError } from "@/lib/discover/field-limits";
import { serializeScreenshotUris } from "@/lib/discover/screenshots";
import { getStaticSeedProjectById } from "@/lib/discover/seed-present";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!isDatabaseConfigured()) {
    const seed = getStaticSeedProjectById(id);
    if (!seed) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      project: seed,
      tallies: { interesting: 0, unclear: 0, not_interesting: 0 },
      myVote: null,
      following: false,
      viewer: { signedIn: false, verified: false },
      authorFeedback: null,
    });
  }
  let project = await getProjectById(id);
  if (!project) {
    const seed = getStaticSeedProjectById(id);
    if (seed) {
      project = {
        id: seed.id,
        authorUserId: null,
        title: seed.title,
        videoUri: seed.videoUri ?? null,
        screenshotUris: seed.screenshotUris ?? "[]",
        tokenIconUri: seed.tokenIconUri,
        idea: seed.idea,
        audience: seed.audience,
        whyToken: seed.whyToken,
        tokenAssetId: seed.tokenAssetId,
        tokenLink: seed.tokenLink,
        productUrl: seed.productUrl,
        stageIndex: seed.stageIndex ?? 3,
        revision: seed.revision ?? 1,
        status: seed.status ?? "promoted",
        weightedScore: 0,
        isSeed: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const verified = userId ? await isVerifiedHuman(userId) : false;
  if (userId && verified) {
    await trackCardVisit(id, userId);
  }

  const [tallies, myVote, following] = await Promise.all([
    getReactionSummary(id, project.revision),
    userId ? getUserReaction(id, userId, project.revision) : null,
    userId ? isFollowing(id, userId) : false,
  ]);

  let authorFeedback = null;
  if (userId && project.authorUserId === userId) {
    authorFeedback = await getAuthorFeedback(id, userId);
  }

  return NextResponse.json({
    project,
    tallies,
    myVote,
    following,
    viewer: { signedIn: Boolean(userId), verified },
    authorFeedback,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const guard = await discoverApiGuard();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const title = String(body.title ?? "").trim();
  const videoUri = String(body.videoUri ?? "").trim() || null;
  const screenshots = Array.isArray(body.screenshotUris)
    ? body.screenshotUris.map((u) => String(u).trim()).filter(Boolean)
    : [];
  const idea = String(body.idea ?? "").trim();
  const audience = String(body.audience ?? "").trim();
  const whyToken = String(body.whyToken ?? "").trim();
  const tokenAssetId = String(body.tokenAssetId ?? "").trim();
  const tokenLink = String(body.tokenLink ?? "").trim();
  const productUrl = body.productUrl ? String(body.productUrl).trim() : null;
  // WEB-M2: same length caps as creation — a revision must not smuggle in unbounded text.
  const fieldError = firstProjectFieldError({
    title,
    idea,
    audience,
    whyToken,
    tokenAssetId,
    tokenLink,
    productUrl,
    videoUri,
    screenshotUris: screenshots,
  });
  if (fieldError) {
    return NextResponse.json({ error: fieldError }, { status: 400 });
  }
  try {
    await resubmitProject(id, guard.userId, {
      title,
      videoUri,
      screenshotUris: serializeScreenshotUris(screenshots),
      tokenIconUri: body.tokenIconUri ? String(body.tokenIconUri).trim() : null,
      idea,
      audience,
      whyToken,
      tokenAssetId,
      tokenLink,
      productUrl,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("invalid_")) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
