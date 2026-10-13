import { cache } from "react";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { isDatabaseConfigured } from "@/db";
import { listFeedProjects, getProjectById, getReactionSummary, getUserReaction, isFollowing, getAuthorFeedback } from "@/lib/discover/service";
import { getStaticSeedProjectById, staticSeedProjectsForFeed } from "@/lib/discover/seed-present";
import { isVerifiedHuman } from "@/lib/discover/verified-human";
import type { DiscoverProjectRow } from "@/lib/discover/service";
import type { DiscoverPresentableProject } from "@/lib/discover/seed-present";

export const DISCOVER_DB_TIMEOUT_MS = 1500;
/** Server render budget: show seed HTML quickly, merge DB when it responds in time. */
export const DISCOVER_SSR_DB_BUDGET_MS = 400;
export const DISCOVER_FEED_REVALIDATE_SEC = 60;

export type DiscoverFeedProjectPayload = {
  id: string;
  title: string;
  videoUri: string | null;
  screenshotUris: string;
  tokenIconUri: string | null;
  idea: string;
  audience: string;
  whyToken: string;
  tokenAssetId: string;
  tokenLink: string;
  productUrl: string | null;
  stageIndex: number;
  status: string;
  isSeed: boolean;
  revision: number;
};

export type DiscoverFeedViewer = { signedIn: boolean; verified: boolean };

export type DiscoverProjectDetailPayload = {
  project: DiscoverFeedProjectPayload & { authorUserId: string | null };
  tallies: { interesting: number; unclear: number; not_interesting: number };
  myVote: string | null;
  following: boolean;
  authorFeedback: {
    tallies: { interesting: number; unclear: number; not_interesting: number };
    questions: { id: string; body: string }[];
  } | null;
};

function serializeFeedProject(row: DiscoverProjectRow | DiscoverFeedProjectPayload | DiscoverPresentableProject): DiscoverFeedProjectPayload {
  return {
    id: row.id,
    title: row.title,
    videoUri: row.videoUri ?? null,
    screenshotUris: row.screenshotUris ?? "[]",
    tokenIconUri: row.tokenIconUri,
    idea: row.idea,
    audience: row.audience,
    whyToken: row.whyToken,
    tokenAssetId: row.tokenAssetId,
    tokenLink: row.tokenLink,
    productUrl: row.productUrl,
    stageIndex: row.stageIndex ?? 0,
    status: row.status ?? "active",
    isSeed: Boolean(row.isSeed),
    revision: row.revision ?? 1,
  };
}

export function staticSeedFeedPayload(): DiscoverFeedProjectPayload[] {
  return staticSeedProjectsForFeed().map((p) => serializeFeedProject(p));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadFeedFromDatabase(viewerUserId: string | null, viewerIsVerified: boolean): Promise<DiscoverFeedProjectPayload[]> {
  if (!isDatabaseConfigured()) {
    return staticSeedFeedPayload();
  }
  const page = await listFeedProjects(viewerUserId, viewerIsVerified);
  return page.projects.map(serializeFeedProject);
}

const cachedAnonymousFeed = unstable_cache(
  async () => loadFeedFromDatabase(null, false),
  ["discover-feed-anonymous-v1"],
  { revalidate: DISCOVER_FEED_REVALIDATE_SEC },
);

export const loadDiscoverFeedForPage = cache(async (): Promise<{
  projects: DiscoverFeedProjectPayload[];
  viewer: DiscoverFeedViewer;
}> => {
  const seeds = staticSeedFeedPayload();
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let verified = false;
  if (userId) {
    verified = await withTimeout(isVerifiedHuman(userId), DISCOVER_DB_TIMEOUT_MS, false);
  }

  const viewer: DiscoverFeedViewer = { signedIn: Boolean(userId), verified };

  if (!userId) {
    const projects = await withTimeout(cachedAnonymousFeed(), DISCOVER_SSR_DB_BUDGET_MS, seeds);
    return { projects: projects.length > 0 ? projects : seeds, viewer };
  }

  const projects = await withTimeout(loadFeedFromDatabase(userId, verified), DISCOVER_DB_TIMEOUT_MS, seeds);
  return { projects: projects.length > 0 ? projects : seeds, viewer };
});

function seedRowToDbShape(seed: ReturnType<typeof getStaticSeedProjectById>): DiscoverProjectRow | null {
  if (!seed) return null;
  const now = new Date();
  return {
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
    createdAt: now,
    updatedAt: now,
  };
}

async function loadProjectDetailFromDatabase(
  id: string,
  userId: string | null,
): Promise<DiscoverProjectDetailPayload | null> {
  if (!isDatabaseConfigured()) {
    const seed = getStaticSeedProjectById(id);
    if (!seed) return null;
    return {
      project: { ...serializeFeedProject(seed), authorUserId: null },
      tallies: { interesting: 0, unclear: 0, not_interesting: 0 },
      myVote: null,
      following: false,
      authorFeedback: null,
    };
  }

  let project: DiscoverProjectRow | null = await getProjectById(id);
  if (!project) {
    project = seedRowToDbShape(getStaticSeedProjectById(id));
  }
  if (!project) return null;

  const [tallies, myVote, following] = await Promise.all([
    getReactionSummary(id, project.revision),
    userId ? getUserReaction(id, userId, project.revision) : null,
    userId ? isFollowing(id, userId) : false,
  ]);

  let authorFeedback = null;
  if (userId && project.authorUserId === userId) {
    authorFeedback = await getAuthorFeedback(id, userId);
  }

  return {
    project: { ...serializeFeedProject(project), authorUserId: project.authorUserId },
    tallies,
    myVote,
    following,
    authorFeedback,
  };
}

function loadCachedSeedDetail(id: string): Promise<DiscoverProjectDetailPayload | null> {
  return unstable_cache(
    async () => {
      const seed = getStaticSeedProjectById(id);
      if (!seed) return null;
      return {
        project: { ...serializeFeedProject(seed), authorUserId: null },
        tallies: { interesting: 0, unclear: 0, not_interesting: 0 },
        myVote: null,
        following: false,
        authorFeedback: null,
      } satisfies DiscoverProjectDetailPayload;
    },
    ["discover-seed-detail-v1", id],
    { revalidate: DISCOVER_FEED_REVALIDATE_SEC },
  )();
}

export const loadDiscoverProjectDetailForPage = cache(async (id: string): Promise<DiscoverProjectDetailPayload | null> => {
  const seedFallback = getStaticSeedProjectById(id);
  const staticDetail = seedFallback
    ? {
        project: { ...serializeFeedProject(seedFallback), authorUserId: null },
        tallies: { interesting: 0, unclear: 0, not_interesting: 0 },
        myVote: null,
        following: false,
        authorFeedback: null,
      }
    : null;

  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId && seedFallback) {
    const cached = await loadCachedSeedDetail(id);
    if (cached) return cached;
  }

  const detail = await withTimeout(loadProjectDetailFromDatabase(id, userId), DISCOVER_DB_TIMEOUT_MS, staticDetail);
  return detail;
});

export function discoverProjectTitleForMetadata(detail: DiscoverProjectDetailPayload | null, id: string): string {
  if (detail?.project?.title?.trim()) return detail.project.title.trim();
  const seed = getStaticSeedProjectById(id);
  return seed?.title?.trim() || "Project";
}
