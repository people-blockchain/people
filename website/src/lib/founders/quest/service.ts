import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  founderQuestDailyAttempts,
  founderQuestLedger,
  founderQuestProfiles,
  founderQuestSecrets,
  founderQuestUsedXUrls,
  founderTelegramUsers,
  founders,
} from "@/db/schema";
import { getFounderByUserId, isFounderMarkedBot } from "../service.ts";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "../verification.ts";
import {
  isQuestOpen,
  normalizeSecretWord,
  normalizeXHandle,
  projectedQuestPpl,
  QUEST_POINTS_CAP,
  QUEST_TASK_POINTS,
  questDayKey,
  questSocialIdempotencyKey,
  type QuestTaskType,
} from "./config.ts";
import { fetchTelegramChannelMember, isActiveTelegramMember } from "./telegram-channel.ts";
import { verifyXReplyViaOembed } from "./x-oembed.ts";

export type QuestAwardResult =
  | { ok: true; awardedPoints: number; totalQuestPoints: number }
  | {
      ok: false;
      error:
        | "not_registered"
        | "bot_flagged"
        | "quest_closed"
        | "duplicate"
        | "cap_reached"
        | "invalid"
        | "rate_limited"
        | "not_eligible";
    };

type DbTx = Awaited<ReturnType<typeof getDbReady>>;

function hashUrl(url: string): string {
  return createHash("sha256").update(url.trim().toLowerCase()).digest("hex");
}

export function generatePersonalQuestCode(): string {
  return `PPL-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function ensureQuestProfile(userId: string, tx?: DbTx): Promise<{ personalCode: string; xHandle: string | null }> {
  const db = tx ?? (await getDbReady());
  const existing = await db
    .select({ personalCode: founderQuestProfiles.personalCode, xHandle: founderQuestProfiles.xHandle })
    .from(founderQuestProfiles)
    .where(eq(founderQuestProfiles.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  const personalCode = generatePersonalQuestCode();
  await db.insert(founderQuestProfiles).values({ userId, personalCode, xHandle: null });
  return { personalCode, xHandle: null };
}

async function readQuestPoints(userId: string, tx?: DbTx): Promise<number> {
  const db = tx ?? (await getDbReady());
  const row = await db.select({ questPoints: founders.questPoints }).from(founders).where(eq(founders.userId, userId)).limit(1);
  return Number(row[0]?.questPoints ?? 0);
}

async function recordDailyAttempt(
  userId: string,
  attemptKey: string,
  dayKey: string,
  tx: DbTx,
): Promise<boolean> {
  const inserted = await tx
    .insert(founderQuestDailyAttempts)
    .values({ userId, attemptKey, dayKey })
    .onConflictDoNothing()
    .returning({ userId: founderQuestDailyAttempts.userId });
  return inserted.length > 0;
}

export async function awardQuestPoints(
  userId: string,
  taskType: QuestTaskType,
  points: number,
  idempotencyKey: string,
  dayKey = questDayKey(),
): Promise<QuestAwardResult> {
  if (!isQuestOpen()) return { ok: false, error: "quest_closed" };
  if (!Number.isFinite(points) || points === 0) return { ok: false, error: "invalid" };
  const key = idempotencyKey.trim();
  if (key.length < 8 || key.length > 200) return { ok: false, error: "invalid" };

  const founder = await getFounderByUserId(userId);
  if (!founder) return { ok: false, error: "not_registered" };
  if (await isFounderMarkedBot(userId)) return { ok: false, error: "bot_flagged" };

  const db = await getDbReady();
  const outcome = await db
    .transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext('quest'))`);
      const dup = await tx
        .select({ id: founderQuestLedger.id })
        .from(founderQuestLedger)
        .where(eq(founderQuestLedger.idempotencyKey, key))
        .limit(1);
      if (dup[0]) return { ok: false as const, error: "duplicate" as const };

      const current = await readQuestPoints(userId, tx);
      if (points > 0 && current + points > QUEST_POINTS_CAP) {
        return { ok: false as const, error: "cap_reached" as const };
      }

      await tx.insert(founderQuestLedger).values({
        id: crypto.randomUUID(),
        userId,
        taskType,
        points,
        dayKey,
        idempotencyKey: key,
      });
      await tx
        .update(founders)
        .set({ questPoints: sql`${founders.questPoints} + ${points}` })
        .where(eq(founders.userId, userId));
      return { ok: true as const, awardedPoints: points, totalQuestPoints: current + points };
    })
    .catch((error: unknown) => {
      if ((error as { code?: string })?.code === "23505") {
        return { ok: false as const, error: "duplicate" as const };
      }
      throw error;
    });

  return outcome;
}

export async function tryAwardQuestVerification(userId: string): Promise<void> {
  const founder = await getFounderByUserId(userId);
  if (!founder || founder.verificationLevel < VERIFICATION_LEVEL_TELEGRAM_PHONE) return;
  await awardQuestPoints(
    userId,
    "verify",
    QUEST_TASK_POINTS.verify,
    questSocialIdempotencyKey("verify", userId),
  );
}

export async function tryAwardQuestFounderCard(userId: string): Promise<void> {
  const founder = await getFounderByUserId(userId);
  if (!founder) return;
  await awardQuestPoints(
    userId,
    "founder_card",
    QUEST_TASK_POINTS.founder_card,
    questSocialIdempotencyKey("founder_card", userId),
  );
}

export async function getQuestProfile(userId: string): Promise<{
  personalCode: string;
  xHandle: string | null;
  questPoints: number;
  projectedPpl: number;
}> {
  const founder = await getFounderByUserId(userId);
  if (!founder) {
    const profile = await ensureQuestProfile(userId);
    return { ...profile, questPoints: 0, projectedPpl: 0 };
  }
  const db = await getDbReady();
  const ptsRow = await db
    .select({ questPoints: founders.questPoints })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);
  const questPoints = Number(ptsRow[0]?.questPoints ?? 0);
  const profile = await ensureQuestProfile(userId);
  return {
    ...profile,
    questPoints,
    projectedPpl: projectedQuestPpl(questPoints),
  };
}

export async function setQuestXHandle(userId: string, handleRaw: string): Promise<{ ok: true } | { ok: false; error: "invalid" | "not_registered" }> {
  const handle = normalizeXHandle(handleRaw);
  if (!handle) return { ok: false, error: "invalid" };
  const founder = await getFounderByUserId(userId);
  if (!founder) return { ok: false, error: "not_registered" };
  await ensureQuestProfile(userId);
  const db = await getDbReady();
  await db.update(founderQuestProfiles).set({ xHandle: handle, updatedAt: new Date() }).where(eq(founderQuestProfiles.userId, userId));
  return { ok: true };
}

export async function checkTelegramJoinQuest(userId: string): Promise<QuestAwardResult> {
  const db = await getDbReady();
  const tg = await db
    .select({ telegramUserId: founderTelegramUsers.telegramUserId })
    .from(founderTelegramUsers)
    .where(eq(founderTelegramUsers.userId, userId))
    .limit(1);
  if (!tg[0]) return { ok: false, error: "not_eligible" };

  const member = await fetchTelegramChannelMember(tg[0].telegramUserId);
  if (!member.ok || !isActiveTelegramMember(member.status)) {
    return { ok: false, error: "not_eligible" };
  }
  return awardQuestPoints(
    userId,
    "telegram_join",
    QUEST_TASK_POINTS.telegram_join,
    questSocialIdempotencyKey("telegram", userId),
  );
}

export async function revokeTelegramJoinQuest(userId: string): Promise<QuestAwardResult> {
  return awardQuestPoints(
    userId,
    "telegram_join",
    -QUEST_TASK_POINTS.telegram_join,
    questSocialIdempotencyKey("telegram", userId, "revoke"),
  );
}

export async function submitXEngagementQuest(
  userId: string,
  replyUrl: string,
  mode: "engagement" | "daily",
  deps?: Parameters<typeof verifyXReplyViaOembed>[0]["fetchOEmbed"] extends infer F ? { fetchOEmbed?: F } : never,
): Promise<QuestAwardResult> {
  const db = await getDbReady();
  const dayKey = questDayKey();
  const attemptKey = mode === "daily" ? "x_daily" : "x_engagement";
  const attemptOk = await db.transaction(async (tx) => {
    const first = await recordDailyAttempt(userId, attemptKey, dayKey, tx);
    return first;
  });
  if (!attemptOk) return { ok: false, error: "rate_limited" };

  const profile = await ensureQuestProfile(userId);
  if (!profile.xHandle) return { ok: false, error: "not_eligible" };

  const verify = await verifyXReplyViaOembed({
    replyUrl,
    linkedHandle: profile.xHandle,
    personalCode: profile.personalCode,
    fetchOEmbed: deps?.fetchOEmbed,
  });
  if (!verify.ok) return { ok: false, error: "invalid" };

  const urlHash = hashUrl(replyUrl);
  const urlTaken = await db.select({ urlHash: founderQuestUsedXUrls.urlHash }).from(founderQuestUsedXUrls).where(eq(founderQuestUsedXUrls.urlHash, urlHash)).limit(1);
  if (urlTaken[0]) return { ok: false, error: "duplicate" };

  const taskType: QuestTaskType = mode === "daily" ? "x_daily" : "x_engagement";
  const points = QUEST_TASK_POINTS[taskType];
  const idem =
    mode === "daily"
      ? questSocialIdempotencyKey("x_repost", userId, dayKey)
      : questSocialIdempotencyKey("x", userId);

  const award = await awardQuestPoints(userId, taskType, points, idem, dayKey);
  if (award.ok) {
    await db.insert(founderQuestUsedXUrls).values({ urlHash, userId }).onConflictDoNothing();
  }
  return award;
}

export async function submitSecretWordQuest(
  userId: string,
  platform: "youtube" | "medium",
  wordRaw: string,
  now = new Date(),
): Promise<QuestAwardResult> {
  const word = normalizeSecretWord(wordRaw);
  if (!word) return { ok: false, error: "invalid" };

  const db = await getDbReady();
  const dayKey = questDayKey(now);
  const attemptKey = `${platform}_word`;
  const attemptOk = await db.transaction(async (tx) => recordDailyAttempt(userId, attemptKey, dayKey, tx));
  if (!attemptOk) return { ok: false, error: "rate_limited" };

  const rows = await db
    .select()
    .from(founderQuestSecrets)
    .where(
      and(
        eq(founderQuestSecrets.platform, platform),
        eq(founderQuestSecrets.wordNormalized, word),
        lte(founderQuestSecrets.validFrom, now),
        gte(founderQuestSecrets.validTo, now),
      ),
    )
    .orderBy(desc(founderQuestSecrets.validFrom))
    .limit(1);
  const secret = rows[0];
  if (!secret) return { ok: false, error: "invalid" };

  const taskType: QuestTaskType = platform === "youtube" ? "youtube_word" : "medium_word";
  const points = QUEST_TASK_POINTS[taskType];
  return awardQuestPoints(
    userId,
    taskType,
    points,
    questSocialIdempotencyKey(platform, userId, secret.id),
    dayKey,
  );
}

export async function recordXCardShareQuest(userId: string): Promise<QuestAwardResult> {
  return awardQuestPoints(
    userId,
    "x_card_share",
    QUEST_TASK_POINTS.x_card_share,
    questSocialIdempotencyKey("x_card", userId),
  );
}

export async function countQuestTasksCompleted(userId: string): Promise<number> {
  const db = await getDbReady();
  const rows = await db
    .select({ taskType: founderQuestLedger.taskType })
    .from(founderQuestLedger)
    .where(and(eq(founderQuestLedger.userId, userId), gt(founderQuestLedger.points, 0)));
  const distinct = new Set(rows.map((r) => r.taskType));
  return distinct.size;
}

export type QuestLeaderboardRow = {
  founderNumber: number;
  questPoints: number;
  verifiedInvitees: number;
  projectedReferralPpl: number;
  rank: number;
};

export async function readQuestLeaderboard(limit = 200): Promise<QuestLeaderboardRow[]> {
  const db = await getDbReady();
  const foundersRows = await db
    .select({
      userId: founders.userId,
      founderNumber: founders.founderNumber,
      questPoints: founders.questPoints,
    })
    .from(founders)
    .where(gt(founders.questPoints, 0))
    .orderBy(desc(founders.questPoints))
    .limit(500);

  const enriched: Omit<QuestLeaderboardRow, "rank">[] = [];
  for (const row of foundersRows) {
    const verifiedInvitees = await countVerifiedQuestInvitees(row.userId);
    enriched.push({
      founderNumber: row.founderNumber,
      questPoints: row.questPoints,
      verifiedInvitees,
      projectedReferralPpl: Math.min(verifiedInvitees, 50) * 1_000,
    });
  }
  enriched.sort((a, b) => {
    if (b.verifiedInvitees !== a.verifiedInvitees) return b.verifiedInvitees - a.verifiedInvitees;
    return b.questPoints - a.questPoints;
  });
  return enriched.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function countVerifiedQuestInvitees(inviterUserId: string): Promise<number> {
  const db = await getDbReady();
  const invitees = await db
    .select({ userId: founders.userId, verificationLevel: founders.verificationLevel, isBot: founders.isBot })
    .from(founders)
    .where(eq(founders.invitedByUserId, inviterUserId));
  let countOk = 0;
  for (const inv of invitees) {
    if (inv.isBot || inv.verificationLevel < VERIFICATION_LEVEL_TELEGRAM_PHONE) continue;
    const tasks = await countQuestTasksCompleted(inv.userId);
    if (tasks >= 3) countOk += 1;
  }
  return countOk;
}

export async function isWalletQuestComplete(walletRaw: string): Promise<boolean> {
  const wallet = walletRaw.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return false;
  const db = await getDbReady();
  const row = await db
    .select({ verificationLevel: founders.verificationLevel })
    .from(founders)
    .where(eq(founders.walletAddress, wallet))
    .limit(1);
  return Boolean(row[0] && row[0].verificationLevel >= VERIFICATION_LEVEL_TELEGRAM_PHONE);
}

export async function recheckTelegramQuestMembers(): Promise<{ checked: number; revoked: number }> {
  const db = await getDbReady();
  const rows = await db
    .select({ userId: founderQuestLedger.userId })
    .from(founderQuestLedger)
    .where(
      and(
        eq(founderQuestLedger.taskType, "telegram_join"),
        gt(founderQuestLedger.points, 0),
      ),
    );
  const userIds = [...new Set(rows.map((r) => r.userId))];
  let revoked = 0;
  for (const userId of userIds) {
    const tg = await db
      .select({ telegramUserId: founderTelegramUsers.telegramUserId })
      .from(founderTelegramUsers)
      .where(eq(founderTelegramUsers.userId, userId))
      .limit(1);
    if (!tg[0]) continue;
    const member = await fetchTelegramChannelMember(tg[0].telegramUserId);
    if (member.ok && isActiveTelegramMember(member.status)) continue;
    const result = await revokeTelegramJoinQuest(userId);
    if (result.ok) revoked += 1;
  }
  return { checked: userIds.length, revoked };
}

export async function createQuestSecretWord(input: {
  platform: "youtube" | "medium";
  word: string;
  validFrom: Date;
  validTo: Date;
}): Promise<{ id: string }> {
  const wordNormalized = normalizeSecretWord(input.word);
  if (!wordNormalized) throw new Error("invalid_word");
  const db = await getDbReady();
  const id = crypto.randomUUID();
  await db.insert(founderQuestSecrets).values({
    id,
    platform: input.platform,
    wordNormalized,
    validFrom: input.validFrom,
    validTo: input.validTo,
  });
  return { id };
}

export async function exportQuestReviewCsv(): Promise<string> {
  const db = await getDbReady();
  const rows = await db
    .select({
      userId: founders.userId,
      founderNumber: founders.founderNumber,
      walletAddress: founders.walletAddress,
      questPoints: founders.questPoints,
      verificationLevel: founders.verificationLevel,
      isBot: founders.isBot,
    })
    .from(founders)
    .orderBy(desc(founders.questPoints));
  const header = "founderNumber,wallet,questPoints,verifiedInvitees,verificationLevel,isBot";
  const lines = [header];
  for (const row of rows) {
    const verifiedInvitees = await countVerifiedQuestInvitees(row.userId);
    lines.push(
      [
        row.founderNumber,
        row.walletAddress,
        row.questPoints,
        verifiedInvitees,
        row.verificationLevel,
        row.isBot ? "yes" : "no",
      ].join(","),
    );
  }
  return lines.join("\n");
}

export async function readQuestTaskStatus(userId: string): Promise<Record<string, boolean>> {
  const db = await getDbReady();
  const ledger = await db
    .select({ taskType: founderQuestLedger.taskType, points: founderQuestLedger.points, dayKey: founderQuestLedger.dayKey })
    .from(founderQuestLedger)
    .where(eq(founderQuestLedger.userId, userId));
  const dayKey = questDayKey();
  const positive = new Set(
    ledger.filter((r) => r.points > 0).map((r) => (r.taskType === "x_daily" ? `${r.taskType}:${r.dayKey}` : r.taskType)),
  );
  return {
    verify: positive.has("verify"),
    founder_card: positive.has("founder_card"),
    telegram_join: positive.has("telegram_join"),
    x_engagement: positive.has("x_engagement"),
    x_card_share: positive.has("x_card_share"),
    x_daily: positive.has(`x_daily:${dayKey}`),
  };
}
