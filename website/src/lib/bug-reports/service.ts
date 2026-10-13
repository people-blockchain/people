import { desc, eq, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import { bugReports, founderPointsLedger, founders } from "@/db/schema";
import {
  BUG_SEVERITIES,
  BUG_STATUSES,
  MAX_DESCRIPTION_LEN,
  MAX_SCREENSHOT_DATA_URL_LEN,
  type BugReportContext,
  type BugReportType,
  type BugSeverity,
  type BugStatus,
} from "./constants";

export {
  BUG_SEVERITIES,
  BUG_STATUSES,
  MAX_DESCRIPTION_LEN,
  MAX_SCREENSHOT_DATA_URL_LEN,
  type BugReportContext,
  type BugSeverity,
  type BugStatus,
};

/** Statuses that trigger a season-0 points credit once rewardPoints > 0. */
const REWARD_STATUSES = new Set<BugStatus>(["accepted", "fixed"]);

export type BugReportRow = typeof bugReports.$inferSelect;

type Executor = Pick<Awaited<ReturnType<typeof getDbReady>>, "select" | "insert" | "update">;

function clampStr(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().slice(0, max);
  return s.length ? s : undefined;
}

export function sanitizeContext(input: unknown): BugReportContext {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    url: clampStr(o.url, 500),
    route: clampStr(o.route, 300),
    viewport: clampStr(o.viewport, 32),
    userAgent: clampStr(o.userAgent, 500),
    theme: clampStr(o.theme, 20),
    locale: clampStr(o.locale, 20),
    appVersion: clampStr(o.appVersion, 100),
    walletAddress: clampStr(o.walletAddress, 100),
  };
}

export type SubmitValidation =
  | {
      ok: true;
      description: string;
      screenshotData: string | null;
      context: BugReportContext;
    }
  | { ok: false; error: "description_required" | "description_too_long" | "screenshot_too_large" };

export function validateBugReportInput(body: {
  description?: unknown;
  screenshot?: unknown;
  context?: unknown;
}): SubmitValidation {
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return { ok: false, error: "description_required" };
  }
  if (description.length > MAX_DESCRIPTION_LEN) {
    return { ok: false, error: "description_too_long" };
  }

  let screenshotData: string | null = null;
  if (typeof body.screenshot === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.screenshot)) {
    if (body.screenshot.length > MAX_SCREENSHOT_DATA_URL_LEN) {
      return { ok: false, error: "screenshot_too_large" };
    }
    screenshotData = body.screenshot;
  }

  return { ok: true, description, screenshotData, context: sanitizeContext(body.context) };
}

export type CreateBugReportExtra = {
  type?: BugReportType;
  source?: "site" | "telegram";
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  telegramPhotoFileId?: string | null;
};

export async function createBugReport(
  userId: string | null,
  input: { description: string; screenshotData: string | null; context: BugReportContext },
  extra: CreateBugReportExtra = {},
): Promise<BugReportRow> {
  const db = await getDbReady();
  const [row] = await db
    .insert(bugReports)
    .values({
      userId,
      description: input.description,
      screenshotData: input.screenshotData,
      context: input.context,
      type: extra.type ?? "bug",
      source: extra.source ?? "site",
      telegramChatId: extra.telegramChatId ?? null,
      telegramUsername: extra.telegramUsername ?? null,
      telegramPhotoFileId: extra.telegramPhotoFileId ?? null,
    })
    .returning();
  return row;
}

export async function listMyBugReports(userId: string): Promise<BugReportRow[]> {
  const db = await getDbReady();
  return db.select().from(bugReports).where(eq(bugReports.userId, userId)).orderBy(desc(bugReports.createdAt));
}

export type AdminListFilter = { status?: BugStatus };

export async function listBugReportsForAdmin(filter: AdminListFilter = {}): Promise<BugReportRow[]> {
  const db = await getDbReady();
  if (filter.status) {
    return db
      .select()
      .from(bugReports)
      .where(eq(bugReports.status, filter.status))
      .orderBy(desc(bugReports.createdAt));
  }
  return db.select().from(bugReports).orderBy(desc(bugReports.createdAt));
}

export type AdminPatchInput = {
  status?: BugStatus;
  severity?: BugSeverity | null;
  rewardPoints?: number;
  adminNote?: string | null;
};

export type AdminPatchResult =
  | { ok: true; report: BugReportRow; credited: number }
  | { ok: false; error: "not_found" | "invalid_status" | "invalid_severity" | "invalid_reward" };

/**
 * `creditBugBountyPointsTx`'s idempotency key is derived only from the report id, so repeated
 * PATCHes that keep the report in a reward-eligible status (or move it out and back in) never
 * credit twice — and reducing/raising rewardPoints after the first credit does not re-trigger it.
 */
export async function getBugReport(id: string): Promise<BugReportRow | null> {
  const db = await getDbReady();
  const [row] = await db.select().from(bugReports).where(eq(bugReports.id, id)).limit(1);
  return row ?? null;
}

export async function patchBugReportAsAdmin(id: string, patch: AdminPatchInput): Promise<AdminPatchResult> {
  if (patch.status !== undefined && !BUG_STATUSES.includes(patch.status)) {
    return { ok: false, error: "invalid_status" };
  }
  if (patch.severity !== undefined && patch.severity !== null && !BUG_SEVERITIES.includes(patch.severity)) {
    return { ok: false, error: "invalid_severity" };
  }
  if (
    patch.rewardPoints !== undefined &&
    (!Number.isInteger(patch.rewardPoints) || patch.rewardPoints < 0 || patch.rewardPoints > 1_000_000)
  ) {
    return { ok: false, error: "invalid_reward" };
  }

  const db = await getDbReady();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(bugReports).where(eq(bugReports.id, id)).limit(1);
    if (!existing) {
      return { ok: false as const, error: "not_found" as const };
    }

    const next = {
      status: patch.status ?? (existing.status as BugStatus),
      severity: patch.severity === undefined ? existing.severity : patch.severity,
      rewardPoints: patch.rewardPoints ?? existing.rewardPoints,
      adminNote: patch.adminNote === undefined ? existing.adminNote : patch.adminNote,
      updatedAt: new Date(),
    };

    const [updated] = await tx.update(bugReports).set(next).where(eq(bugReports.id, id)).returning();

    let credited = 0;
    if (existing.userId && REWARD_STATUSES.has(next.status) && next.rewardPoints > 0) {
      credited = await creditBugBountyPointsTx(tx, existing.userId, id, next.rewardPoints);
    }

    return { ok: true as const, report: updated, credited };
  });
}

/**
 * Credits season-0 founder points for an accepted/fixed bug report, exactly once. No-op (returns
 * 0) when the reporter never registered as a founder, or when this report already has a ledger
 * entry — both the idempotency guard and the no-founder-row skip are deliberate: a bug report is
 * not retried or backfilled once it slips out of the reward window.
 */
async function creditBugBountyPointsTx(
  tx: Executor,
  userId: string,
  reportId: string,
  points: number,
): Promise<number> {
  const [founder] = await tx.select({ userId: founders.userId }).from(founders).where(eq(founders.userId, userId)).limit(1);
  if (!founder) return 0;

  const idempotencyKey = `bug_bounty:${reportId}`;
  const [dup] = await tx
    .select({ id: founderPointsLedger.id })
    .from(founderPointsLedger)
    .where(eq(founderPointsLedger.idempotencyKey, idempotencyKey))
    .limit(1);
  if (dup) return 0;

  const dayKey = new Date().toISOString().slice(0, 10);
  await tx.insert(founderPointsLedger).values({
    userId,
    actionType: "bug_bounty",
    basePoints: points,
    entryMultiplier: 1,
    awardedPoints: points,
    dayKey,
    idempotencyKey,
  });
  await tx
    .update(founders)
    .set({ totalPoints: sql`${founders.totalPoints} + ${points}` })
    .where(eq(founders.userId, userId));
  return points;
}
