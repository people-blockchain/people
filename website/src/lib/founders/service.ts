import { and, count, desc, eq, or, sql, sum } from "drizzle-orm";
import { clawBackInviterPointsForBot } from "./invite-rewards.ts";
import { clawBackReferralForBot, tryEvaluateReferral } from "./referral-service.ts";
import { isReferralActiveAction } from "./referral.ts";
import { getDb, getDbReady } from "@/db";
import {
  founderPointsLedger,
  founders,
} from "@/db/schema";
import { loadVerifiedHuman } from "@/lib/discover/verified-human";
import { stakeMeetsMinimumAmount, swapMeetsMinimumAmount } from "./antibot.ts";
import { verifyFounderActionOnChain } from "./chain-verify.ts";
import {
  earlyEntryMultiplier,
  FOUNDER_ACTION_CONFIG,
  FOUNDER_GOAL,
  isFounderActionType,
  normalizeCountryCode,
  utcDayKey,
  type FounderActionType,
} from "./config.ts";
import { shouldBlockDiscoverPoints } from "./discover-antibot.ts";
import { computePointsAward } from "./points.ts";
import { canAccrueFounderRewards } from "./reward-rules.ts";
import {
  checkRegistrationSlots,
  hashDeviceSlot,
  hashIpSlot,
  incrementRegistrationSlots,
} from "./registration-limits.ts";
import {
  FOUNDER_SEASON_1_POOL_PPL,
  FOUNDER_PROGRAM_POOL_PPL,
  estimatePplPerPoint,
} from "./season-pool.ts";
import {
  canEarnFounderPoints,
  verificationPointsFactor,
  type FounderVerificationLevel,
} from "./verification.ts";

export type FounderPublicStats = {
  verifiedCount: number;
  goal: number;
  countries: { countryCode: string; founderCount: number }[];
  programPoolPpl: number;
  seasonPoolPpl: number;
  totalPoints: number;
  estimatedPplPerPoint: number | null;
};

export type FounderProfile = {
  founderNumber: number;
  countryCode: string;
  entryMultiplier: number;
  totalPoints: number;
  registeredAt: string;
  walletAddress: string;
  verificationLevel: FounderVerificationLevel;
  /** Public founder lists show the account name/avatar only when this is true. */
  publicProfileOptIn: boolean;
  /** Separate wallet linked for Human Passport scoring, lowercase. Null when unlinked. */
  passportWallet: string | null;
};

export type AwardFounderContext = {
  projectAuthorUserId?: string;
  /** On-chain evidence for actions that must be verified server-side (see CHAIN_VERIFIED_ACTIONS). */
  txHash?: string;
};

/** Actions that claim an on-chain event and must be checked against a tx receipt, not trusted. */
const CHAIN_VERIFIED_ACTIONS = new Set<FounderActionType>([
  "swap",
  "stake",
  "token_launch",
  "nft_mint",
  "pool_create",
  "governance_vote",
]);

export async function getTotalFounderPoints(): Promise<number> {
  const db = await getDbReady();
  const row = await db.select({ value: sum(founders.totalPoints) }).from(founders);
  return Number(row[0]?.value ?? 0);
}

function isConnectionClosed(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "CONNECTION_CLOSED" || /CONNECTION_CLOSED|connection.*closed/i.test(e?.message ?? "");
}

/**
 * Public stats are hot (landing + /founders): use the plain client (schema DDL runs at deploy via
 * `npm run db:bootstrap`, not on this request path) and retry once if Neon dropped the connection.
 */
export async function getFounderPublicStats(): Promise<FounderPublicStats> {
  try {
    return await readFounderPublicStats();
  } catch (error) {
    if (!isConnectionClosed(error)) throw error;
    return await readFounderPublicStats();
  }
}

async function readFounderPublicStats(): Promise<FounderPublicStats> {
  const db = getDb();
  const totalRow = await db.select({ value: count() }).from(founders);
  const verifiedCount = Number(totalRow[0]?.value ?? 0);
  const pointsRow = await db.select({ value: sum(founders.totalPoints) }).from(founders);
  const totalPoints = Number(pointsRow[0]?.value ?? 0);
  // Grouped live from `founders` (the single source of truth) rather than a separately
  // maintained counter table, so every registered founder is always counted and a later
  // country change (updateFounderCountry) needs no extra bookkeeping to stay correct.
  const countryRows = await db
    .select({ countryCode: founders.countryCode, founderCount: count() })
    .from(founders)
    .groupBy(founders.countryCode)
    .orderBy(desc(count()))
    .limit(200);
  const countries = countryRows.map((row) => ({
    countryCode: row.countryCode,
    founderCount: Number(row.founderCount),
  }));
  return {
    verifiedCount,
    goal: FOUNDER_GOAL,
    countries,
    programPoolPpl: FOUNDER_PROGRAM_POOL_PPL,
    seasonPoolPpl: FOUNDER_SEASON_1_POOL_PPL,
    totalPoints,
    estimatedPplPerPoint: estimatePplPerPoint(FOUNDER_SEASON_1_POOL_PPL, totalPoints),
  };
}

export async function resolveFounderUserIdByWallet(walletRaw: string): Promise<string | null> {
  const wallet = walletRaw.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return null;
  const db = await getDbReady();
  const row = await db
    .select({ userId: founders.userId })
    .from(founders)
    .where(eq(founders.walletAddress, wallet))
    .limit(1);
  return row[0]?.userId ?? null;
}

export async function markFounderAsBot(inviteeUserId: string): Promise<void> {
  await clawBackInviterPointsForBot(inviteeUserId);
  await clawBackReferralForBot(inviteeUserId);
}

/** A founder flagged as a bot (see markFounderAsBot) may not accrue points or airdrops. */
export async function isFounderMarkedBot(userId: string): Promise<boolean> {
  const db = await getDbReady();
  const row = await db
    .select({ isBot: founders.isBot })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);
  return row[0]?.isBot === true;
}

export async function getFounderByUserId(userId: string): Promise<FounderProfile | null> {
  const db = await getDbReady();
  const row = await db.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  const f = row[0];
  if (!f) return null;
  return {
    founderNumber: f.founderNumber,
    countryCode: f.countryCode,
    entryMultiplier: f.entryMultiplier,
    totalPoints: f.totalPoints,
    registeredAt: f.registeredAt.toISOString(),
    walletAddress: f.walletAddress,
    verificationLevel: (f.verificationLevel ?? 0) as FounderVerificationLevel,
    publicProfileOptIn: f.publicProfileOptIn ?? false,
    passportWallet: f.passportWallet ?? null,
  };
}

/** Any founder (self included) currently holding `address` as their walletAddress or passportWallet. */
export async function findFounderByWalletOrPassportWallet(address: string): Promise<{ userId: string } | null> {
  const db = await getDbReady();
  const rows = await db
    .select({ userId: founders.userId })
    .from(founders)
    .where(or(eq(founders.walletAddress, address), eq(founders.passportWallet, address)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setFounderPassportWallet(userId: string, address: string): Promise<void> {
  const db = await getDbReady();
  await db.update(founders).set({ passportWallet: address }).where(eq(founders.userId, userId));
}

export async function clearFounderPassportWallet(userId: string): Promise<void> {
  const db = await getDbReady();
  await db.update(founders).set({ passportWallet: null }).where(eq(founders.userId, userId));
}

export type RegisterFounderResult =
  | { ok: true; profile: FounderProfile }
  | {
      ok: false;
      error:
        | "poh_required"
        | "invalid_country"
        | "already_registered"
        | "cap_reached"
        | "device_cap"
        | "ip_cap";
    };

export async function registerFounder(
  userId: string,
  countryRaw: string,
  opts?: { deviceId?: string; ip?: string; invitedByUserId?: string | null },
): Promise<RegisterFounderResult> {
  const human = await loadVerifiedHuman(userId);
  if (!human?.walletAddress) {
    return { ok: false, error: "poh_required" };
  }
  const countryCode = normalizeCountryCode(countryRaw);
  if (!countryCode) {
    return { ok: false, error: "invalid_country" };
  }

  const slots = await checkRegistrationSlots(opts?.deviceId, opts?.ip ?? "");
  if (!slots.ok) {
    return { ok: false, error: slots.error };
  }

  const db = await getDbReady();
  const existing = await getFounderByUserId(userId);
  if (existing) {
    return { ok: false, error: "already_registered" };
  }

  const invitedByUserId: string | null =
    opts?.invitedByUserId && opts.invitedByUserId !== userId ? opts.invitedByUserId : null;
  // Registration never grants a verification level, invited or not: levels 1/2 come only
  // from the invitee's own Telegram-phone/Human-Passport verification.
  const verificationLevel: FounderVerificationLevel = 0;

  const walletAddress = human.walletAddress.toLowerCase();
  const deviceSlotHash = opts?.deviceId?.trim() ? hashDeviceSlot(opts.deviceId) : null;
  const ipSlotHash = opts?.ip ? hashIpSlot(opts.ip) : null;

  // Allocate the founder number and insert in one transaction guarded by an advisory lock.
  // Using MAX+1 (not a Postgres sequence) means a registration that fails or loses a race
  // does not permanently burn a founder number.
  const allocated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(742615)`);
    const dup = await tx.select({ userId: founders.userId }).from(founders).where(eq(founders.userId, userId)).limit(1);
    if (dup[0]) return { ok: false as const, error: "already_registered" as const };
    // Read MAX+1 through the query builder, not a raw `tx.execute`: the raw form returns a
    // postgres-js `Result` (an Array subclass) in production but a `{ rows }` object under the
    // PGlite test driver, so `[0].next` silently allocated NaN and made every registration
    // throw. The builder returns rows in the same shape on both drivers.
    const maxRows = await tx
      .select({ next: sql<string | number>`COALESCE(MAX(${founders.founderNumber}), 0) + 1` })
      .from(founders);
    const founderNumber = Number(maxRows[0]?.next);
    if (!Number.isFinite(founderNumber) || founderNumber < 1) {
      throw new Error("founder_number allocation failed");
    }
    if (founderNumber > FOUNDER_GOAL) {
      return { ok: false as const, error: "cap_reached" as const };
    }
    const entryMultiplier = earlyEntryMultiplier(founderNumber);
    await tx.insert(founders).values({
      userId,
      founderNumber,
      countryCode,
      entryMultiplier,
      totalPoints: 0,
      walletAddress,
      verificationLevel,
      invitedByUserId,
      deviceSlotHash,
      ipSlotHash,
    });
    return { ok: true as const };
  });
  if (!allocated.ok) {
    return { ok: false, error: allocated.error };
  }

  await incrementRegistrationSlots(opts?.deviceId, opts?.ip ?? "");

  const profile = await getFounderByUserId(userId);
  if (!profile) throw new Error("founder insert missing");
  return { ok: true, profile };
}

export type UpdateFounderCountryResult =
  | { ok: true; profile: FounderProfile }
  | { ok: false; error: "not_registered" | "invalid_country" };

/**
 * Lets an already-registered founder correct their self-declared country later. Scoped to
 * `userId` from the caller's own session (the route never takes a target user id), so this can
 * only ever change the signed-in founder's own record. The public country breakdown is read
 * live from `founders` (see `getFounderPublicStats`), so there is nothing else to update.
 */
export async function updateFounderCountry(
  userId: string,
  countryRaw: string,
): Promise<UpdateFounderCountryResult> {
  const countryCode = normalizeCountryCode(countryRaw);
  if (!countryCode) {
    return { ok: false, error: "invalid_country" };
  }
  const existing = await getFounderByUserId(userId);
  if (!existing) {
    return { ok: false, error: "not_registered" };
  }
  if (existing.countryCode !== countryCode) {
    const db = await getDbReady();
    await db.update(founders).set({ countryCode }).where(eq(founders.userId, userId));
  }
  const profile = await getFounderByUserId(userId);
  if (!profile) throw new Error("founder update missing");
  return { ok: true, profile };
}

type AwardExecutor = Pick<Awaited<ReturnType<typeof getDbReady>>, "select" | "insert" | "update" | "execute">;

async function sumPreMultiplierBaseForDay(
  userId: string,
  dayKey: string,
  executor?: AwardExecutor,
): Promise<number> {
  const db = executor ?? (await getDbReady());
  const row = await db
    .select({ value: sum(founderPointsLedger.basePoints) })
    .from(founderPointsLedger)
    .where(
      and(eq(founderPointsLedger.userId, userId), eq(founderPointsLedger.dayKey, dayKey)),
    );
  return Number(row[0]?.value ?? 0);
}

async function countActionsForDay(
  userId: string,
  dayKey: string,
  actionType: FounderActionType,
  executor?: AwardExecutor,
): Promise<number> {
  const db = executor ?? (await getDbReady());
  const row = await db
    .select({ value: count() })
    .from(founderPointsLedger)
    .where(
      and(
        eq(founderPointsLedger.userId, userId),
        eq(founderPointsLedger.dayKey, dayKey),
        eq(founderPointsLedger.actionType, actionType),
      ),
    );
  return Number(row[0]?.value ?? 0);
}

export type AwardPointsResult =
  | { ok: true; awardedPoints: number; totalPoints: number }
  | {
      ok: false;
      error:
        | "not_registered"
        | "poh_required"
        | "verification_required"
        | "invalid_action"
        | "duplicate"
        | "action_cap"
        | "daily_total_cap"
        | "zero"
        | "swap_too_small"
        | "stake_too_small"
        | "not_verifiable"
        | "chain_verification_failed"
        | "bot_flagged"
        | "closed_group";
    };

type AwardOptions = { skipInviteCascade?: boolean };

export async function awardFounderPoints(
  userId: string,
  action: string,
  idempotencyKey: string,
  context: AwardFounderContext = {},
  options: AwardOptions = {},
): Promise<AwardPointsResult> {
  // Legacy flat "invite" award is retired: invites now pay through the referral bounty
  // (referral-service.ts) so nobody can self-award or double-collect.
  if (!isFounderActionType(action) || action === "invite") {
    return { ok: false, error: "invalid_action" };
  }

  const human = await loadVerifiedHuman(userId);
  if (!canAccrueFounderRewards(Boolean(human?.walletAddress))) {
    return { ok: false, error: "poh_required" };
  }

  const founder = await getFounderByUserId(userId);
  if (!founder) {
    return { ok: false, error: "not_registered" };
  }
  if (await isFounderMarkedBot(userId)) {
    return { ok: false, error: "bot_flagged" };
  }
  if (!canEarnFounderPoints(founder.verificationLevel)) {
    return { ok: false, error: "verification_required" };
  }

  let key = idempotencyKey.trim();

  // These action types claim an on-chain event happened; never trust the amount/outcome
  // the client reports — fetch the receipt ourselves and derive the idempotency key from
  // the real tx hash so one on-chain action can never be replayed as several claims.
  if (CHAIN_VERIFIED_ACTIONS.has(action)) {
    const txHash = context.txHash?.trim() ?? "";
    const verify = await verifyFounderActionOnChain(action, txHash, founder.walletAddress);
    if (!verify.ok) {
      return {
        ok: false,
        error: verify.error === "not_verifiable" ? "not_verifiable" : "chain_verification_failed",
      };
    }
    if (action === "swap" && !swapMeetsMinimumAmount(verify.swapAmountPpl ?? 0)) {
      return { ok: false, error: "swap_too_small" };
    }
    if (action === "stake" && !stakeMeetsMinimumAmount(verify.stakeAmountPpl ?? 0)) {
      return { ok: false, error: "stake_too_small" };
    }
    key = `chain:${action}:${txHash.toLowerCase()}`;
  }

  if (key.length < 8 || key.length > 200) {
    return { ok: false, error: "invalid_action" };
  }

  if (action === "discover_reaction" || action === "discover_follow") {
    const blocked = await shouldBlockDiscoverPoints(userId, context.projectAuthorUserId);
    if (blocked) {
      return { ok: false, error: "closed_group" };
    }
  }

  const dayKey = utcDayKey();
  const actionConfig = FOUNDER_ACTION_CONFIG[action];
  const verificationFactor = verificationPointsFactor(founder.verificationLevel);

  // The duplicate check and the daily-cap reads must see a stable ledger, so run them
  // inside one transaction serialized per (user, day). Otherwise two parallel claims can
  // both pass the cap checks and double-award; the unique idempotency index alone does not
  // stop that because the keys differ.
  const db = await getDbReady();
  const outcome = await db
    .transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${dayKey}))`,
      );
      const dup = await tx
        .select({ id: founderPointsLedger.id })
        .from(founderPointsLedger)
        .where(eq(founderPointsLedger.idempotencyKey, key))
        .limit(1);
      if (dup[0]) {
        return { ok: false as const, error: "duplicate" as const };
      }

      const alreadyActionCount = await countActionsForDay(userId, dayKey, action, tx);
      const alreadyPreMult = await sumPreMultiplierBaseForDay(userId, dayKey, tx);
      const computed = computePointsAward({
        configBasePoints: actionConfig.basePoints,
        verificationFactor,
        entryMultiplier: founder.entryMultiplier,
        actionConfig,
        alreadyTodayActionCount: alreadyActionCount,
        alreadyTodayPreMultiplierBase: alreadyPreMult,
      });
      if (!computed.ok) {
        return { ok: false as const, error: computed.reason };
      }

      await tx.insert(founderPointsLedger).values({
        id: crypto.randomUUID(),
        userId,
        actionType: action,
        basePoints: computed.creditedBase,
        entryMultiplier: founder.entryMultiplier,
        awardedPoints: computed.awardedPoints,
        dayKey,
        idempotencyKey: key,
      });
      await tx
        .update(founders)
        .set({ totalPoints: sql`${founders.totalPoints} + ${computed.awardedPoints}` })
        .where(eq(founders.userId, userId));
      return { ok: true as const, awardedPoints: computed.awardedPoints };
    })
    .catch((error: unknown) => {
      // Two identical keys racing: the loser hits the unique idempotency index.
      if ((error as { code?: string })?.code === "23505") {
        return { ok: false as const, error: "duplicate" as const };
      }
      throw error;
    });

  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }
  const awardedPoints = outcome.awardedPoints;

  if (!options.skipInviteCascade && isReferralActiveAction(action)) {
    await tryEvaluateReferral(userId);
  }

  return {
    ok: true,
    awardedPoints,
    totalPoints: founder.totalPoints + awardedPoints,
  };
}

export async function tryAwardFounderPoints(
  userId: string,
  action: FounderActionType,
  idempotencyKey: string,
  context: AwardFounderContext = {},
): Promise<void> {
  try {
    await awardFounderPoints(userId, action, idempotencyKey, context);
  } catch (error) {
    console.error(
      "[founders] award failed",
      action,
      error instanceof Error ? error.message : typeof error,
    );
  }
}
