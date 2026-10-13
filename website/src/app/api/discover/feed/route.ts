import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { listFeedProjects } from "@/lib/discover/service";
import { seedDiscoverProjectsIfEmpty } from "@/lib/discover/seed";
import { staticSeedProjectsForFeed } from "@/lib/discover/seed-present";
import { isVerifiedHuman } from "@/lib/discover/verified-human";
import { recordSiteVisit } from "@/lib/discover/service";

export const dynamic = "force-dynamic";

/** Parse a non-negative integer query param, ignoring anything malformed. */
function intParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    const projects = staticSeedProjectsForFeed();
    return NextResponse.json({
      configured: false,
      viewer: { signedIn: false, verified: false },
      projects,
    });
  }
  await seedDiscoverProjectsIfEmpty();
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const verified = userId ? await isVerifiedHuman(userId) : false;
  if (userId && verified) {
    await recordSiteVisit(userId);
  }
  const params = new URL(request.url).searchParams;
  const page = await listFeedProjects(userId, verified, {
    limit: intParam(params.get("limit")),
    offset: intParam(params.get("offset")),
  });
  return NextResponse.json({
    configured: true,
    viewer: { signedIn: Boolean(userId), verified },
    page: { hasMore: page.hasMore, nextOffset: page.nextOffset },
    projects: page.projects.map((p) => ({
      id: p.id,
      title: p.title,
      videoUri: p.videoUri,
      screenshotUris: p.screenshotUris,
      tokenIconUri: p.tokenIconUri,
      idea: p.idea,
      audience: p.audience,
      whyToken: p.whyToken,
      tokenAssetId: p.tokenAssetId,
      tokenLink: p.tokenLink,
      productUrl: p.productUrl,
      stageIndex: p.stageIndex,
      status: p.status,
      isSeed: p.isSeed,
      revision: p.revision,
    })),
  });
}
