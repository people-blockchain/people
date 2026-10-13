import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  discoverCardVisits,
  discoverExposures,
  discoverFollows,
  discoverProductClicks,
  discoverProjects,
  discoverQuestions,
  discoverReactions,
  discoverSiteVisits,
} from "@/db/schema";
import {
  DISCOVER_SCORING,
  stageAudienceCap,
  type DiscoverVote,
} from "@/lib/discover/scoring-config";
import { assertProjectFieldLimits } from "@/lib/discover/field-limits";
import { isSafeLinkTarget, isSafeVideoUri } from "@/lib/discover/url-policy";

export type DiscoverProjectRow = typeof discoverProjects.$inferSelect;

export function discoverFeedRank(project: DiscoverProjectRow): number {
  const hasVideo = Boolean(project.videoUri?.trim());
  return project.weightedScore + (hasVideo ? DISCOVER_SCORING.feedVideoRankBoost : 0);
}

export async function countExposures(projectId: string): Promise<number> {
  const db = await getDbReady();
  const rows = await db
    .select({ c: count() })
    .from(discoverExposures)
    .where(eq(discoverExposures.projectId, projectId));
  return Number(rows[0]?.c ?? 0);
}

async function computeWeightedScore(projectId: string, revision: number): Promise<number> {
  const db = await getDbReady();
  const [reactions, follows, questions, clicks, visits] = await Promise.all([
    db
      .select()
      .from(discoverReactions)
      .where(and(eq(discoverReactions.projectId, projectId), eq(discoverReactions.revision, revision))),
    db.select().from(discoverFollows).where(eq(discoverFollows.projectId, projectId)),
    db
      .select()
      .from(discoverQuestions)
      .where(and(eq(discoverQuestions.projectId, projectId), eq(discoverQuestions.revision, revision))),
    db.select().from(discoverProductClicks).where(eq(discoverProductClicks.projectId, projectId)),
    db.select().from(discoverCardVisits).where(eq(discoverCardVisits.projectId, projectId)),
  ]);

  const w = DISCOVER_SCORING.weights;
  let score = 0;
  for (const r of reactions) {
    if (r.vote === "interesting") score += w.voteInteresting;
    else if (r.vote === "unclear") score += w.voteUnclear;
    else if (r.vote === "not_interesting") score += w.voteNotInteresting;
  }
  score += follows.length * w.follow;
  score += questions.length * w.question;
  score += clicks.length * w.productClick;
  for (const v of visits) {
    if (v.visitCount > 1) score += w.repeatVisit * (v.visitCount - 1);
  }
  return score;
}

async function evaluateStage(project: DiscoverProjectRow): Promise<DiscoverProjectRow> {
  if (project.isSeed || project.status !== "active") return project;
  if (project.stageIndex >= DISCOVER_SCORING.maxStageIndex) return project;

  const exposures = await countExposures(project.id);
  const cap = stageAudienceCap(project.stageIndex);
  if (!Number.isFinite(cap) || exposures < Math.min(cap, DISCOVER_SCORING.promotionMinExposures)) {
    return project;
  }

  const score = await computeWeightedScore(project.id, project.revision);
  const db = await getDbReady();

  if (score >= DISCOVER_SCORING.promotionScoreThreshold) {
    const nextStage = Math.min(project.stageIndex + 1, DISCOVER_SCORING.maxStageIndex);
    await db
      .update(discoverProjects)
      .set({
        stageIndex: nextStage,
        weightedScore: score,
        updatedAt: new Date(),
        status: nextStage >= DISCOVER_SCORING.maxStageIndex ? "promoted" : "active",
      })
      .where(eq(discoverProjects.id, project.id));
    const updated = await db.select().from(discoverProjects).where(eq(discoverProjects.id, project.id)).limit(1);
    return updated[0] ?? project;
  }

  if (score < DISCOVER_SCORING.weakScoreThreshold) {
    await db
      .update(discoverProjects)
      .set({ weightedScore: score, status: "needs_work", updatedAt: new Date() })
      .where(eq(discoverProjects.id, project.id));
    const updated = await db.select().from(discoverProjects).where(eq(discoverProjects.id, project.id)).limit(1);
    return updated[0] ?? project;
  }

  await db
    .update(discoverProjects)
    .set({ weightedScore: score, updatedAt: new Date() })
    .where(eq(discoverProjects.id, project.id));
  const updated = await db.select().from(discoverProjects).where(eq(discoverProjects.id, project.id)).limit(1);
  return updated[0] ?? project;
}

export async function refreshProjectScore(projectId: string): Promise<void> {
  const db = await getDbReady();
  const row = await db.select().from(discoverProjects).where(eq(discoverProjects.id, projectId)).limit(1);
  const project = row[0];
  if (!project) return;
  const score = await computeWeightedScore(project.id, project.revision);
  await db
    .update(discoverProjects)
    .set({ weightedScore: score, updatedAt: new Date() })
    .where(eq(discoverProjects.id, projectId));
  await evaluateStage({ ...project, weightedScore: score });
}

export async function recordExposure(projectId: string, userId: string): Promise<void> {
  const db = await getDbReady();
  await db
    .insert(discoverExposures)
    .values({ projectId, userId })
    .onConflictDoNothing();
}

export async function userHasExposure(projectId: string, userId: string): Promise<boolean> {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(discoverExposures)
    .where(and(eq(discoverExposures.projectId, projectId), eq(discoverExposures.userId, userId)))
    .limit(1);
  return Boolean(rows[0]);
}

export async function shouldShowProject(
  project: DiscoverProjectRow,
  viewerUserId: string | null,
  viewerIsVerified: boolean,
): Promise<boolean> {
  if (project.isSeed) return true;
  if (project.stageIndex >= DISCOVER_SCORING.maxStageIndex) return true;
  if (viewerUserId && project.authorUserId === viewerUserId) return true;
  if (!viewerIsVerified || !viewerUserId) return false;

  if (await userHasExposure(project.id, viewerUserId)) return true;

  const exposures = await countExposures(project.id);
  const cap = stageAudienceCap(project.stageIndex);
  if (exposures < cap) {
    await recordExposure(project.id, viewerUserId);
    return true;
  }
  return false;
}

/** Default number of projects returned per feed page. */
export const DISCOVER_FEED_PAGE_SIZE = 30;
/** Hard ceiling for a caller-supplied `limit`. */
export const DISCOVER_FEED_MAX_PAGE_SIZE = 100;

/**
 * WEB-M1: the per-project decision made by `shouldShowProject`, expressed as a pure function over
 * already-fetched data so the feed costs a fixed number of queries instead of O(projects). Given
 * the candidate page plus the viewer's exposure state it returns which projects are visible and
 * which new exposures must be recorded. No DB access — unit-testable.
 */
export function selectFeedProjects(input: {
  projects: DiscoverProjectRow[];
  viewerUserId: string | null;
  viewerIsVerified: boolean;
  /** projectId → number of exposures recorded so far. */
  exposureCounts: ReadonlyMap<string, number>;
  /** projectIds the viewer already has an exposure for. */
  viewerExposed: ReadonlySet<string>;
}): { visible: DiscoverProjectRow[]; recordExposuresFor: string[] } {
  const { projects, viewerUserId, viewerIsVerified, exposureCounts, viewerExposed } = input;
  const visible: DiscoverProjectRow[] = [];
  const recordExposuresFor: string[] = [];

  for (const project of projects) {
    if (project.status === "archived") continue;
    if (project.isSeed) {
      visible.push(project);
      continue;
    }
    if (project.stageIndex >= DISCOVER_SCORING.maxStageIndex) {
      visible.push(project);
      continue;
    }
    if (viewerUserId && project.authorUserId === viewerUserId) {
      visible.push(project);
      continue;
    }
    if (!viewerIsVerified || !viewerUserId) continue;

    if (viewerExposed.has(project.id)) {
      visible.push(project);
      continue;
    }
    const exposures = exposureCounts.get(project.id) ?? 0;
    if (exposures < stageAudienceCap(project.stageIndex)) {
      visible.push(project);
      recordExposuresFor.push(project.id);
    }
  }

  visible.sort((a, b) => {
    const rank = discoverFeedRank(b) - discoverFeedRank(a);
    if (rank !== 0) return rank;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  return { visible, recordExposuresFor };
}

/**
 * WEB-M1: one bounded page of projects with the viewer's exposure state fetched in three set
 * queries (projects + `count(*) GROUP BY projectId` + already-exposed ids) and one multi-row
 * insert, instead of two SELECTs and an INSERT per project. Independent of N.
 */
export async function listFeedProjects(
  viewerUserId: string | null,
  viewerIsVerified: boolean,
  options: { limit?: number; offset?: number } = {},
): Promise<{ projects: DiscoverProjectRow[]; hasMore: boolean; nextOffset: number }> {
  const db = await getDbReady();
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? DISCOVER_FEED_PAGE_SIZE), 1),
    DISCOVER_FEED_MAX_PAGE_SIZE,
  );
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);

  const rows = await db
    .select()
    .from(discoverProjects)
    .where(ne(discoverProjects.status, "archived"))
    .orderBy(desc(discoverProjects.createdAt))
    .limit(limit + 1)
    .offset(offset);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const ids = page.map((p) => p.id);

  let exposureCounts = new Map<string, number>();
  let viewerExposed = new Set<string>();
  if (ids.length > 0) {
    const counts = await db
      .select({ projectId: discoverExposures.projectId, c: count() })
      .from(discoverExposures)
      .where(inArray(discoverExposures.projectId, ids))
      .groupBy(discoverExposures.projectId);
    exposureCounts = new Map(counts.map((row) => [row.projectId, Number(row.c)]));
    if (viewerUserId) {
      const mine = await db
        .select({ projectId: discoverExposures.projectId })
        .from(discoverExposures)
        .where(
          and(
            inArray(discoverExposures.projectId, ids),
            eq(discoverExposures.userId, viewerUserId),
          ),
        );
      viewerExposed = new Set(mine.map((row) => row.projectId));
    }
  }

  const { visible, recordExposuresFor } = selectFeedProjects({
    projects: page,
    viewerUserId,
    viewerIsVerified,
    exposureCounts,
    viewerExposed,
  });

  if (recordExposuresFor.length > 0 && viewerUserId) {
    await db
      .insert(discoverExposures)
      .values(recordExposuresFor.map((projectId) => ({ projectId, userId: viewerUserId })))
      .onConflictDoNothing();
  }

  return { projects: visible, hasMore, nextOffset: offset + page.length };
}

export async function getProjectById(id: string) {
  const db = await getDbReady();
  const rows = await db.select().from(discoverProjects).where(eq(discoverProjects.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function setReaction(projectId: string, userId: string, vote: DiscoverVote) {
  const db = await getDbReady();
  const project = await getProjectById(projectId);
  if (!project) throw new Error("not_found");
  await db
    .insert(discoverReactions)
    .values({ projectId, userId, revision: project.revision, vote })
    .onConflictDoUpdate({
      target: [discoverReactions.projectId, discoverReactions.userId, discoverReactions.revision],
      set: { vote, createdAt: new Date() },
    });
  await refreshProjectScore(projectId);
}

export async function addFollow(projectId: string, userId: string) {
  const db = await getDbReady();
  await db.insert(discoverFollows).values({ projectId, userId }).onConflictDoNothing();
  await refreshProjectScore(projectId);
}

export async function addQuestion(projectId: string, userId: string, body: string) {
  const db = await getDbReady();
  const project = await getProjectById(projectId);
  if (!project) throw new Error("not_found");
  await db.insert(discoverQuestions).values({
    projectId,
    userId,
    revision: project.revision,
    body: body.trim(),
  });
  await refreshProjectScore(projectId);
}

export async function trackProductClick(projectId: string, userId: string | null) {
  const db = await getDbReady();
  await db.insert(discoverProductClicks).values({ projectId, userId: userId ?? undefined });
  await refreshProjectScore(projectId);
}

export async function trackCardVisit(projectId: string, userId: string) {
  const db = await getDbReady();
  const existing = await db
    .select()
    .from(discoverCardVisits)
    .where(and(eq(discoverCardVisits.projectId, projectId), eq(discoverCardVisits.userId, userId)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(discoverCardVisits)
      .set({
        visitCount: existing[0].visitCount + 1,
        lastAt: new Date(),
      })
      .where(
        and(eq(discoverCardVisits.projectId, projectId), eq(discoverCardVisits.userId, userId)),
      );
  } else {
    await db.insert(discoverCardVisits).values({ projectId, userId });
  }
  await refreshProjectScore(projectId);
}

export async function recordSiteVisit(userId: string) {
  const db = await getDbReady();
  await db.insert(discoverSiteVisits).values({ userId });
}

export async function getAuthorFeedback(projectId: string, authorUserId: string) {
  const project = await getProjectById(projectId);
  if (!project || project.authorUserId !== authorUserId) return null;
  const db = await getDbReady();
  const [reactions, questions] = await Promise.all([
    db
      .select()
      .from(discoverReactions)
      .where(and(eq(discoverReactions.projectId, projectId), eq(discoverReactions.revision, project.revision))),
    db
      .select()
      .from(discoverQuestions)
      .where(and(eq(discoverQuestions.projectId, projectId), eq(discoverQuestions.revision, project.revision))),
  ]);
  const tallies = { interesting: 0, unclear: 0, not_interesting: 0 };
  for (const r of reactions) {
    if (r.vote in tallies) tallies[r.vote as keyof typeof tallies] += 1;
  }
  return { project, tallies, questions: questions.map((q) => ({ id: q.id, body: q.body, createdAt: q.createdAt })) };
}

/** Reject link values that would render as a cross-origin or unsafe href. */
function assertSafeProjectLinks(links: { tokenLink: string; productUrl?: string | null; videoUri?: string | null }) {
  if (!isSafeLinkTarget(links.tokenLink)) throw new Error("invalid_token_link");
  if (links.productUrl && !isSafeLinkTarget(links.productUrl)) throw new Error("invalid_product_url");
  if (links.videoUri && !isSafeVideoUri(links.videoUri)) throw new Error("invalid_video_uri");
}

export async function resubmitProject(
  projectId: string,
  authorUserId: string,
  patch: {
    title: string;
    videoUri: string | null;
    screenshotUris: string;
    tokenIconUri: string | null;
    idea: string;
    audience: string;
    whyToken: string;
    tokenAssetId: string;
    tokenLink: string;
    productUrl?: string | null;
  },
) {
  const project = await getProjectById(projectId);
  if (!project || project.authorUserId !== authorUserId) throw new Error("forbidden");
  assertSafeProjectLinks(patch);
  assertProjectFieldLimits(patch);
  const db = await getDbReady();
  await db
    .update(discoverProjects)
    .set({
      title: patch.title,
      videoUri: patch.videoUri,
      screenshotUris: patch.screenshotUris,
      tokenIconUri: patch.tokenIconUri,
      idea: patch.idea,
      audience: patch.audience,
      whyToken: patch.whyToken,
      tokenAssetId: patch.tokenAssetId,
      tokenLink: patch.tokenLink,
      productUrl: patch.productUrl ?? null,
      revision: project.revision + 1,
      stageIndex: 0,
      status: "active",
      weightedScore: 0,
      updatedAt: new Date(),
    })
    .where(eq(discoverProjects.id, projectId));
}

export async function createProject(
  authorUserId: string,
  input: {
    title: string;
    videoUri: string | null;
    screenshotUris: string;
    tokenIconUri: string | null;
    idea: string;
    audience: string;
    whyToken: string;
    tokenAssetId: string;
    tokenLink: string;
    productUrl?: string | null;
  },
) {
  assertSafeProjectLinks(input);
  assertProjectFieldLimits(input);
  const db = await getDbReady();
  const rows = await db
    .insert(discoverProjects)
    .values({
      authorUserId,
      title: input.title,
      videoUri: input.videoUri,
      screenshotUris: input.screenshotUris,
      tokenIconUri: input.tokenIconUri,
      idea: input.idea,
      audience: input.audience,
      whyToken: input.whyToken,
      tokenAssetId: input.tokenAssetId,
      tokenLink: input.tokenLink,
      productUrl: input.productUrl ?? null,
      stageIndex: 0,
      revision: 1,
      status: "active",
      isSeed: false,
    })
    .returning();
  return rows[0];
}

export async function getReturningUserStats(withinDays = 14) {
  const db = await getDbReady();
  const rows = await db.execute(sql`
    WITH firsts AS (
      SELECT "userId", MIN("visitedAt") AS first_at
      FROM discover_site_visit
      GROUP BY "userId"
    ),
    returns AS (
      SELECT f."userId"
      FROM firsts f
      JOIN discover_site_visit v ON v."userId" = f."userId"
      WHERE v."visitedAt" > f.first_at
        AND v."visitedAt" <= f.first_at + (${withinDays} || ' days')::interval
    )
    SELECT
      (SELECT COUNT(*)::int FROM firsts) AS unique_visitors,
      (SELECT COUNT(DISTINCT "userId")::int FROM returns) AS returning_within_window,
      (SELECT COUNT(*)::int FROM discover_site_visit) AS total_visit_events
  `);
  const row = rows[0] as Record<string, number> | undefined;
  return {
    uniqueVisitors: Number(row?.unique_visitors ?? 0),
    returningWithinDays: Number(row?.returning_within_window ?? 0),
    totalVisitEvents: Number(row?.total_visit_events ?? 0),
    windowDays: withinDays,
  };
}

export async function getReactionSummary(projectId: string, revision: number) {
  const db = await getDbReady();
  const reactions = await db
    .select()
    .from(discoverReactions)
    .where(and(eq(discoverReactions.projectId, projectId), eq(discoverReactions.revision, revision)));
  const tallies = { interesting: 0, unclear: 0, not_interesting: 0 };
  for (const r of reactions) {
    if (r.vote in tallies) tallies[r.vote as keyof typeof tallies] += 1;
  }
  return tallies;
}

export async function getUserReaction(projectId: string, userId: string, revision: number) {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(discoverReactions)
    .where(
      and(
        eq(discoverReactions.projectId, projectId),
        eq(discoverReactions.userId, userId),
        eq(discoverReactions.revision, revision),
      ),
    )
    .limit(1);
  return rows[0]?.vote ?? null;
}

export async function isFollowing(projectId: string, userId: string) {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(discoverFollows)
    .where(and(eq(discoverFollows.projectId, projectId), eq(discoverFollows.userId, userId)))
    .limit(1);
  return Boolean(rows[0]);
}
