import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  founderIssuerReferralCredits,
  founderIssuerReferralPrograms,
  founderPointsLedger,
  founderReferralActivations,
  founderReferralAmbassadors,
  founderReferralClaims,
  founderReferralCredits,
  founderReferralPool,
  founders,
} from "@/db/schema";
import { utcDayKey } from "./config.ts";
import { verifyTokenCreatorOnChain } from "./chain-verify.ts";
import {
  REFERRAL_ACTIVE_ACTIONS,
  REFERRAL_CURRENT_SEASON,
  REFERRAL_DAILY_POINTS_CAP,
  REFERRAL_EXTRA_POINTS,
  REFERRAL_L1_POINTS,
  REFERRAL_MAX_ACTIVE_INVITEES,
  REFERRAL_SEASON_1_POOL_PPL,
  applyReferralLimits,
  claimableAmount,
  computeIssuerPurchaseCredits,
  isActiveInvitee,
  issuerAllocationAmount,
  l2PointsFromL1,
  microToPpl,
  normalizeIssuerReferralConfig,
  pointsToPpl,
  pplToMicro,
  seasonPoolPoints,
  staysActiveSevenDays,
  totalVested,
  vestedReferralAmount,
  weeksSince,
  type IssuerReferralConfig,
  type ReferralCapReason,
  type ReferralCreditKind,
  type ReferralExtraKind,
  type VestingCredit,
} from "./referral.ts";
import { canEarnFounderPoints } from "./verification.ts";

type Db = Awaited<ReturnType<typeof getDbReady>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const REAL_ACTIONS: string[] = [...REFERRAL_ACTIVE_ACTIONS];

export type ReferralCreditOutcome =
  | { ok: true; points: number }
  | { ok: false; reason: ReferralCapReason | "duplicate" };

async function ensurePoolRow(tx: Tx, season: number): Promise<void> {
  await tx.insert(founderReferralPool).values({ season, spentPoints: 0 }).onConflictDoNothing();
}

/** Pass `tx` when inside a transaction: the pool is a single connection, a second handle would deadlock. */
export async function getMaxActiveInvitees(userId: string, runner?: Tx): Promise<number> {
  const db = runner ?? (await getDbReady());
  const row = await db
    .select({ max: founderReferralAmbassadors.maxActiveInvitees })
    .from(founderReferralAmbassadors)
    .where(eq(founderReferralAmbassadors.userId, userId))
    .limit(1);
  return Math.max(REFERRAL_MAX_ACTIVE_INVITEES, row[0]?.max ?? 0);
}

/**
 * Inserts one credit under the season-pool row lock: enforces the invitee cap (L1 active
 * credits only), the daily points cap and the season pool, then books the spend.
 * Must run inside a transaction that already holds the pool lock.
 */
async function bookCredit(
  tx: Tx,
  input: {
    beneficiaryUserId: string;
    sourceInviteeUserId: string;
    level: 1 | 2;
    kind: ReferralCreditKind;
    desiredPoints: number;
    idempotencyKey: string;
    season: number;
    enforceInviteeCap: boolean;
    maxActiveInvitees: number;
  },
): Promise<ReferralCreditOutcome> {
  const dup = await tx
    .select({ id: founderReferralCredits.id })
    .from(founderReferralCredits)
    .where(eq(founderReferralCredits.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (dup[0]) return { ok: false, reason: "duplicate" };

  const dayKey = utcDayKey();
  const pool = await tx
    .select({ spent: founderReferralPool.spentPoints })
    .from(founderReferralPool)
    .where(eq(founderReferralPool.season, input.season))
    .for("update")
    .limit(1);
  const spent = pool[0]?.spent ?? 0;

  const activeRow = await tx
    .select({ value: count() })
    .from(founderReferralActivations)
    .where(
      and(
        eq(founderReferralActivations.inviterUserId, input.beneficiaryUserId),
        eq(founderReferralActivations.season, input.season),
      ),
    );
  const todayRow = await tx
    .select({ value: sum(founderReferralCredits.points) })
    .from(founderReferralCredits)
    .where(
      and(
        eq(founderReferralCredits.beneficiaryUserId, input.beneficiaryUserId),
        eq(founderReferralCredits.dayKey, dayKey),
      ),
    );

  const limited = applyReferralLimits({
    desiredPoints: input.desiredPoints,
    alreadyActiveInvitees: Number(activeRow[0]?.value ?? 0),
    enforceInviteeCap: input.enforceInviteeCap,
    maxActiveInvitees: input.maxActiveInvitees,
    alreadyTodayPoints: Number(todayRow[0]?.value ?? 0),
    poolRemainingPoints: seasonPoolPoints() - spent,
  });
  if (!limited.ok) return limited;

  await tx.insert(founderReferralCredits).values({
    beneficiaryUserId: input.beneficiaryUserId,
    sourceInviteeUserId: input.sourceInviteeUserId,
    season: input.season,
    level: input.level,
    kind: input.kind,
    points: limited.points,
    pplMicro: pplToMicro(pointsToPpl(limited.points)).toString(),
    dayKey,
    idempotencyKey: input.idempotencyKey,
  });
  await tx
    .update(founderReferralPool)
    .set({ spentPoints: sql`${founderReferralPool.spentPoints} + ${limited.points}`, updatedAt: new Date() })
    .where(eq(founderReferralPool.season, input.season));
  return { ok: true, points: limited.points };
}

async function eligibleBeneficiary(tx: Tx, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const row = await tx.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  const f = row[0];
  if (!f || f.isBot || !f.verifiedAt || !canEarnFounderPoints(f.verificationLevel as 0 | 1 | 2)) {
    return null;
  }
  return f.userId;
}

/** Credits L1 to the invitee's inviter and L2 (30% of the credited L1) to the inviter's inviter. */
async function creditInviteeEvent(
  tx: Tx,
  input: {
    inviteeUserId: string;
    inviterUserId: string;
    kind: ReferralCreditKind;
    idempotencyKey: string;
    season: number;
  },
): Promise<ReferralCreditOutcome> {
  const maxActive = await getMaxActiveInvitees(input.inviterUserId, tx);
  const desired = input.kind === "active" ? REFERRAL_L1_POINTS : REFERRAL_EXTRA_POINTS[input.kind];
  const l1 = await bookCredit(tx, {
    beneficiaryUserId: input.inviterUserId,
    sourceInviteeUserId: input.inviteeUserId,
    level: 1,
    kind: input.kind,
    desiredPoints: desired,
    idempotencyKey: input.idempotencyKey,
    season: input.season,
    enforceInviteeCap: input.kind === "active",
    maxActiveInvitees: maxActive,
  });
  if (!l1.ok) return l1;

  const inviterRow = await tx
    .select({ invitedBy: founders.invitedByUserId })
    .from(founders)
    .where(eq(founders.userId, input.inviterUserId))
    .limit(1);
  const l2Beneficiary = await eligibleBeneficiary(tx, inviterRow[0]?.invitedBy ?? null);
  const l2Points = l2PointsFromL1(l1.points);
  if (l2Beneficiary && l2Beneficiary !== input.inviteeUserId && l2Points > 0) {
    await bookCredit(tx, {
      beneficiaryUserId: l2Beneficiary,
      sourceInviteeUserId: input.inviteeUserId,
      level: 2,
      kind: input.kind,
      desiredPoints: l2Points,
      idempotencyKey: `${input.idempotencyKey}:l2`,
      season: input.season,
      enforceInviteeCap: false,
      maxActiveInvitees: maxActive,
    });
  }
  return l1;
}

export type ActivationResult =
  | { status: "no_inviter" | "not_active" | "inviter_ineligible" | "already_active" }
  | { status: "capped"; reason: ReferralCapReason }
  | { status: "activated"; points: number };

/**
 * Called after an invitee's real testnet action. Credits the inviter (L1 = 100 pts) and the
 * inviter's inviter (L2 = 30%) once, only if the invitee is verified, has a wallet and has
 * at least one real action. Safe to call repeatedly; a capped attempt is retried next time.
 */
export async function evaluateReferralActivation(inviteeUserId: string): Promise<ActivationResult> {
  const db = await getDbReady();
  const rows = await db.select().from(founders).where(eq(founders.userId, inviteeUserId)).limit(1);
  const invitee = rows[0];
  const inviterId = invitee?.invitedByUserId;
  if (!invitee || !inviterId || inviterId === inviteeUserId) return { status: "no_inviter" };

  const existing = await db
    .select({ id: founderReferralActivations.inviteeUserId })
    .from(founderReferralActivations)
    .where(eq(founderReferralActivations.inviteeUserId, inviteeUserId))
    .limit(1);
  if (existing[0]) {
    await maybeAwardStaySevenDays(inviteeUserId);
    return { status: "already_active" };
  }

  const actions = await db
    .select({ key: founderPointsLedger.idempotencyKey, action: founderPointsLedger.actionType })
    .from(founderPointsLedger)
    .where(
      and(
        eq(founderPointsLedger.userId, inviteeUserId),
        inArray(founderPointsLedger.actionType, REAL_ACTIONS),
      ),
    )
    .orderBy(founderPointsLedger.createdAt)
    .limit(1);
  const [{ value: realActionCount }] = await db
    .select({ value: count() })
    .from(founderPointsLedger)
    .where(
      and(
        eq(founderPointsLedger.userId, inviteeUserId),
        inArray(founderPointsLedger.actionType, REAL_ACTIONS),
      ),
    );

  if (
    !isActiveInvitee({
      verified: Boolean(invitee.verifiedAt),
      walletCreated: Boolean(invitee.walletAddress),
      realActionCount: Number(realActionCount),
      isBot: invitee.isBot,
    }) ||
    !actions[0]
  ) {
    return { status: "not_active" };
  }
  const proof = actions[0];
  const season = REFERRAL_CURRENT_SEASON;

  const result = await db.transaction(async (tx): Promise<ActivationResult> => {
    await ensurePoolRow(tx, season);
    if (!(await eligibleBeneficiary(tx, inviterId))) return { status: "inviter_ineligible" };
    const credit = await creditInviteeEvent(tx, {
      inviteeUserId,
      inviterUserId: inviterId,
      kind: "active",
      idempotencyKey: `ref:active:${season}:${inviteeUserId}`,
      season,
    });
    if (!credit.ok) {
      return credit.reason === "duplicate"
        ? { status: "already_active" }
        : { status: "capped", reason: credit.reason };
    }
    await tx
      .insert(founderReferralActivations)
      .values({
        inviteeUserId,
        inviterUserId: inviterId,
        season,
        proofKey: proof.key,
        proofAction: proof.action,
      })
      .onConflictDoNothing();
    return { status: "activated", points: credit.points };
  });
  return result;
}

/** Extra L1 points (and L2 30%) when an already-active invitee does something extra. */
export async function awardReferralExtra(
  inviteeUserId: string,
  kind: ReferralExtraKind,
  eventKey: string,
): Promise<ReferralCreditOutcome | { ok: false; reason: "not_active" }> {
  const db = await getDbReady();
  const act = await db
    .select()
    .from(founderReferralActivations)
    .where(eq(founderReferralActivations.inviteeUserId, inviteeUserId))
    .limit(1);
  const activation = act[0];
  if (!activation) return { ok: false, reason: "not_active" };
  return db.transaction(async (tx) => {
    await ensurePoolRow(tx, activation.season);
    if (!(await eligibleBeneficiary(tx, activation.inviterUserId))) {
      return { ok: false as const, reason: "zero" as const };
    }
    return creditInviteeEvent(tx, {
      inviteeUserId,
      inviterUserId: activation.inviterUserId,
      kind,
      idempotencyKey: `ref:${kind}:${activation.season}:${eventKey}`,
      season: activation.season,
    });
  });
}

/** stay_7d bonus: invitee has a real action ≥7 days after activation. Idempotent per invitee. */
export async function maybeAwardStaySevenDays(inviteeUserId: string): Promise<void> {
  const db = await getDbReady();
  const act = await db
    .select()
    .from(founderReferralActivations)
    .where(eq(founderReferralActivations.inviteeUserId, inviteeUserId))
    .limit(1);
  const activation = act[0];
  if (!activation) return;
  const times = await db
    .select({ at: founderPointsLedger.createdAt })
    .from(founderPointsLedger)
    .where(
      and(
        eq(founderPointsLedger.userId, inviteeUserId),
        inArray(founderPointsLedger.actionType, REAL_ACTIONS),
      ),
    );
  if (!staysActiveSevenDays(activation.activatedAt.getTime(), times.map((t) => t.at.getTime()))) {
    return;
  }
  await awardReferralExtra(inviteeUserId, "stay_7d", inviteeUserId);
}

/** Best-effort wrapper used from award paths: never breaks the user's own action. */
export async function tryEvaluateReferral(inviteeUserId: string): Promise<void> {
  try {
    await evaluateReferralActivation(inviteeUserId);
  } catch (error) {
    console.error(
      "[founders] referral evaluate failed",
      error instanceof Error ? error.message : typeof error,
    );
  }
}

/** Bot clawback: remove every credit sourced from the invitee, refund the pool, free the cap slot. */
export async function clawBackReferralForBot(inviteeUserId: string): Promise<void> {
  const db = await getDbReady();
  await db.transaction(async (tx) => {
    const credits = await tx
      .select()
      .from(founderReferralCredits)
      .where(eq(founderReferralCredits.sourceInviteeUserId, inviteeUserId));
    const bySeason = new Map<number, number>();
    for (const c of credits) bySeason.set(c.season, (bySeason.get(c.season) ?? 0) + c.points);
    for (const [season, points] of bySeason) {
      await tx
        .update(founderReferralPool)
        .set({ spentPoints: sql`GREATEST(0, ${founderReferralPool.spentPoints} - ${points})` })
        .where(eq(founderReferralPool.season, season));
    }
    await tx
      .delete(founderReferralCredits)
      .where(eq(founderReferralCredits.sourceInviteeUserId, inviteeUserId));
    await tx
      .delete(founderReferralActivations)
      .where(eq(founderReferralActivations.inviteeUserId, inviteeUserId));
  });
}

// ── Status / claims ──────────────────────────────────────────────────────────

export type ReferralInviteeRow = {
  founderNumber: number;
  status: "inactive" | "active" | "over_cap" | "bot";
  verified: boolean;
  registeredAt: string;
  activatedAt: string | null;
  l1Points: number;
};

export type ReferralStatus = {
  season: number;
  referralWallet: string;
  maxActiveInvitees: number;
  ambassador: boolean;
  invitees: ReferralInviteeRow[];
  activeCount: number;
  inactiveCount: number;
  l1Points: number;
  l2Points: number;
  extraPoints: number;
  totalPoints: number;
  todayPoints: number;
  dailyCap: number;
  pool: { seasonPoolPpl: number; spentPpl: number; remainingPpl: number };
  vesting: {
    totalPpl: number;
    liquidAtCreditPpl: number;
    vestedPpl: number;
    claimedPpl: number;
    claimablePpl: number;
  };
  issuerAssets: IssuerAssetStatus[];
};

export type IssuerAssetStatus = {
  tokenAddress: string;
  total: string;
  vested: string;
  claimed: string;
  claimable: string;
};

function toBig(value: string | null | undefined): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return BigInt(0);
  }
}

async function pplVestingCredits(userId: string): Promise<VestingCredit[]> {
  const db = await getDbReady();
  const rows = await db
    .select({ amount: founderReferralCredits.pplMicro, at: founderReferralCredits.createdAt })
    .from(founderReferralCredits)
    .where(eq(founderReferralCredits.beneficiaryUserId, userId));
  return rows.map((r) => ({ amount: toBig(r.amount), startMs: r.at.getTime() }));
}

async function claimedTotal(userId: string, asset: string): Promise<bigint> {
  const db = await getDbReady();
  const row = await db
    .select({ value: sum(founderReferralClaims.amount) })
    .from(founderReferralClaims)
    .where(and(eq(founderReferralClaims.userId, userId), eq(founderReferralClaims.asset, asset)));
  return toBig(row[0]?.value ?? "0");
}

async function issuerVestingByToken(userId: string): Promise<Map<string, VestingCredit[]>> {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(founderIssuerReferralCredits)
    .where(eq(founderIssuerReferralCredits.beneficiaryUserId, userId));
  const map = new Map<string, VestingCredit[]>();
  for (const r of rows) {
    const list = map.get(r.tokenAddress) ?? [];
    list.push({ amount: toBig(r.amount), startMs: r.createdAt.getTime() });
    map.set(r.tokenAddress, list);
  }
  return map;
}

export async function getReferralStatus(userId: string, now = new Date()): Promise<ReferralStatus | null> {
  const db = await getDbReady();
  const me = await db.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  if (!me[0]) return null;
  const season = REFERRAL_CURRENT_SEASON;
  const maxActive = await getMaxActiveInvitees(userId);

  const invited = await db
    .select()
    .from(founders)
    .where(eq(founders.invitedByUserId, userId))
    .orderBy(desc(founders.registeredAt))
    .limit(500);
  const acts = await db
    .select()
    .from(founderReferralActivations)
    .where(
      and(
        eq(founderReferralActivations.inviterUserId, userId),
        eq(founderReferralActivations.season, season),
      ),
    );
  const actByInvitee = new Map(acts.map((a) => [a.inviteeUserId, a]));
  const credits = await db
    .select()
    .from(founderReferralCredits)
    .where(
      and(
        eq(founderReferralCredits.beneficiaryUserId, userId),
        eq(founderReferralCredits.season, season),
      ),
    );

  const l1ByInvitee = new Map<string, number>();
  let l1Points = 0;
  let l2Points = 0;
  let extraPoints = 0;
  let todayPoints = 0;
  const today = utcDayKey(now);
  for (const c of credits) {
    if (c.dayKey === today) todayPoints += c.points;
    if (c.level === 2) {
      l2Points += c.points;
    } else if (c.kind === "active") {
      l1Points += c.points;
      l1ByInvitee.set(c.sourceInviteeUserId, (l1ByInvitee.get(c.sourceInviteeUserId) ?? 0) + c.points);
    } else {
      extraPoints += c.points;
      l1ByInvitee.set(c.sourceInviteeUserId, (l1ByInvitee.get(c.sourceInviteeUserId) ?? 0) + c.points);
    }
  }

  const invitees: ReferralInviteeRow[] = invited.map((f) => {
    const act = actByInvitee.get(f.userId);
    const status: ReferralInviteeRow["status"] = f.isBot ? "bot" : act ? "active" : "inactive";
    return {
      founderNumber: f.founderNumber,
      status,
      verified: Boolean(f.verifiedAt),
      registeredAt: f.registeredAt.toISOString(),
      activatedAt: act ? act.activatedAt.toISOString() : null,
      l1Points: l1ByInvitee.get(f.userId) ?? 0,
    };
  });

  const poolRow = await db
    .select({ spent: founderReferralPool.spentPoints })
    .from(founderReferralPool)
    .where(eq(founderReferralPool.season, season))
    .limit(1);
  const spentPpl = pointsToPpl(poolRow[0]?.spent ?? 0);

  const pplCredits = await pplVestingCredits(userId);
  const total = pplCredits.reduce((a, c) => a + c.amount, BigInt(0));
  const claimed = await claimedTotal(userId, "ppl");
  const nowMs = now.getTime();
  const vested = totalVested(pplCredits, nowMs);
  const liquid = pplCredits.reduce((a, c) => a + vestedReferralAmount(c.amount, 0), BigInt(0));

  const issuerAssets: IssuerAssetStatus[] = [];
  for (const [tokenAddress, list] of await issuerVestingByToken(userId)) {
    const tokenClaimed = await claimedTotal(userId, tokenAddress);
    issuerAssets.push({
      tokenAddress,
      total: list.reduce((a, c) => a + c.amount, BigInt(0)).toString(),
      vested: totalVested(list, nowMs).toString(),
      claimed: tokenClaimed.toString(),
      claimable: claimableAmount(list, tokenClaimed, nowMs).toString(),
    });
  }

  const activeCount = invitees.filter((i) => i.status === "active").length;
  return {
    season,
    referralWallet: me[0].walletAddress,
    maxActiveInvitees: maxActive,
    ambassador: maxActive > REFERRAL_MAX_ACTIVE_INVITEES,
    invitees,
    activeCount,
    inactiveCount: invitees.filter((i) => i.status === "inactive").length,
    l1Points,
    l2Points,
    extraPoints,
    totalPoints: l1Points + l2Points + extraPoints,
    todayPoints,
    dailyCap: REFERRAL_DAILY_POINTS_CAP,
    pool: {
      seasonPoolPpl: REFERRAL_SEASON_1_POOL_PPL,
      spentPpl,
      remainingPpl: Math.max(0, REFERRAL_SEASON_1_POOL_PPL - spentPpl),
    },
    vesting: {
      totalPpl: microToPpl(total),
      liquidAtCreditPpl: microToPpl(liquid),
      vestedPpl: microToPpl(vested),
      claimedPpl: microToPpl(claimed),
      claimablePpl: microToPpl(vested > claimed ? vested - claimed : BigInt(0)),
    },
    issuerAssets,
  };
}

/** Lazy settlement for the inviter's page: award stay_7d for any of their eligible invitees. */
export async function settleStayBonusesForInviter(inviterUserId: string): Promise<void> {
  const db = await getDbReady();
  const acts = await db
    .select({ invitee: founderReferralActivations.inviteeUserId, at: founderReferralActivations.activatedAt })
    .from(founderReferralActivations)
    .where(eq(founderReferralActivations.inviterUserId, inviterUserId));
  for (const a of acts) {
    if (weeksSince(a.at.getTime(), Date.now()) < 1) continue;
    await maybeAwardStaySevenDays(a.invitee).catch(() => undefined);
  }
}

export type ClaimResult =
  | { ok: true; claims: { asset: string; amount: string }[] }
  | { ok: false; error: "nothing_to_claim" };

/** Queues a claim for everything vested and not yet claimed (PPL + issuer tokens). */
export async function claimReferralVested(userId: string, now = new Date()): Promise<ClaimResult> {
  const db = await getDbReady();
  const nowMs = now.getTime();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"referral-claim:" + userId}))`);
    const out: { asset: string; amount: string }[] = [];

    const ppl = (
      await tx
        .select({ amount: founderReferralCredits.pplMicro, at: founderReferralCredits.createdAt })
        .from(founderReferralCredits)
        .where(eq(founderReferralCredits.beneficiaryUserId, userId))
    ).map((r) => ({ amount: toBig(r.amount), startMs: r.at.getTime() }));
    const pplClaimedRow = await tx
      .select({ value: sum(founderReferralClaims.amount) })
      .from(founderReferralClaims)
      .where(and(eq(founderReferralClaims.userId, userId), eq(founderReferralClaims.asset, "ppl")));
    const pplDue = claimableAmount(ppl, toBig(pplClaimedRow[0]?.value ?? "0"), nowMs);
    if (pplDue > BigInt(0)) {
      await tx.insert(founderReferralClaims).values({ userId, asset: "ppl", amount: pplDue.toString() });
      out.push({ asset: "ppl", amount: pplDue.toString() });
    }

    const issuer = await tx
      .select()
      .from(founderIssuerReferralCredits)
      .where(eq(founderIssuerReferralCredits.beneficiaryUserId, userId));
    const byToken = new Map<string, VestingCredit[]>();
    for (const r of issuer) {
      const list = byToken.get(r.tokenAddress) ?? [];
      list.push({ amount: toBig(r.amount), startMs: r.createdAt.getTime() });
      byToken.set(r.tokenAddress, list);
    }
    for (const [token, list] of byToken) {
      const claimedRow = await tx
        .select({ value: sum(founderReferralClaims.amount) })
        .from(founderReferralClaims)
        .where(and(eq(founderReferralClaims.userId, userId), eq(founderReferralClaims.asset, token)));
      const due = claimableAmount(list, toBig(claimedRow[0]?.value ?? "0"), nowMs);
      if (due > BigInt(0)) {
        await tx.insert(founderReferralClaims).values({ userId, asset: token, amount: due.toString() });
        out.push({ asset: token, amount: due.toString() });
      }
    }
    return out.length ? { ok: true as const, claims: out } : { ok: false as const, error: "nothing_to_claim" as const };
  });
}

// ── Ambassador ───────────────────────────────────────────────────────────────

export async function setReferralAmbassador(
  userId: string,
  maxActiveInvitees: number,
  approvedBy: string,
): Promise<boolean> {
  if (!Number.isInteger(maxActiveInvitees) || maxActiveInvitees <= REFERRAL_MAX_ACTIVE_INVITEES) {
    return false;
  }
  const db = await getDbReady();
  await db
    .insert(founderReferralAmbassadors)
    .values({ userId, maxActiveInvitees, approvedBy })
    .onConflictDoUpdate({
      target: founderReferralAmbassadors.userId,
      set: { maxActiveInvitees, approvedBy, approvedAt: new Date() },
    });
  return true;
}

// ── Issuer option ────────────────────────────────────────────────────────────

const TOKEN_RE = /^0x[0-9a-f]{40}$/;

export type IssuerProgramResult =
  | { ok: true; config: IssuerReferralConfig }
  | {
      ok: false;
      error: "invalid_token" | "invalid_config" | "invalid_supply" | "exists" | "not_token_creator";
    };

/**
 * Issuer opt-in at token launch. Without `enabled: true` nothing is stored (option stays off).
 * Must be the token's on-chain `creator` (RA-WEB-N1): without this check any registered
 * founder could register themselves as "issuer" of someone else's already-launched token —
 * `onConflictDoNothing` only stops a *second* registration, not a wrong first one — hijacking
 * that token's referral allocation for their own invitees.
 */
export async function registerIssuerReferralProgram(input: {
  tokenAddress: string;
  issuerUserId: string;
  issuerWalletAddress: string;
  totalSupplyBaseUnits: string;
  enabled?: unknown;
  allocationBps?: unknown;
  l1Bps?: unknown;
}): Promise<IssuerProgramResult> {
  const token = input.tokenAddress.trim().toLowerCase();
  if (!TOKEN_RE.test(token)) return { ok: false, error: "invalid_token" };
  const config = normalizeIssuerReferralConfig(input);
  if (!config) return { ok: false, error: "invalid_config" };
  if (!config.enabled) return { ok: true, config };
  let supply: bigint;
  try {
    supply = BigInt(input.totalSupplyBaseUnits);
  } catch {
    return { ok: false, error: "invalid_supply" };
  }
  if (supply <= BigInt(0)) return { ok: false, error: "invalid_supply" };
  const isCreator = await verifyTokenCreatorOnChain(token, input.issuerWalletAddress);
  if (!isCreator) return { ok: false, error: "not_token_creator" };
  const db = await getDbReady();
  const inserted = await db
    .insert(founderIssuerReferralPrograms)
    .values({
      tokenAddress: token,
      issuerUserId: input.issuerUserId,
      enabled: true,
      allocationBps: config.allocationBps,
      l1Bps: config.l1Bps,
      allocationAmount: issuerAllocationAmount(supply, config.allocationBps).toString(),
    })
    .onConflictDoNothing()
    .returning({ t: founderIssuerReferralPrograms.tokenAddress });
  if (!inserted[0]) return { ok: false, error: "exists" };
  return { ok: true, config };
}

export type IssuerPurchaseResult =
  | { ok: true; credited: { level: 1 | 2; amount: string }[] }
  | { ok: false; error: "no_program" | "buyer_not_active" | "duplicate" | "nothing" };

/**
 * Accounting for an invitee's purchase of an issuer token. Same two levels as the founders
 * bounty (L2 = 30% of L1), same vesting. Called only from a trusted indexer route.
 */
export async function recordIssuerPurchase(input: {
  tokenAddress: string;
  buyerUserId: string;
  purchaseAmount: bigint;
  purchaseKey: string;
}): Promise<IssuerPurchaseResult> {
  const token = input.tokenAddress.trim().toLowerCase();
  const db = await getDbReady();
  return db.transaction(async (tx) => {
    const prog = await tx
      .select()
      .from(founderIssuerReferralPrograms)
      .where(eq(founderIssuerReferralPrograms.tokenAddress, token))
      .for("update")
      .limit(1);
    const program = prog[0];
    if (!program || !program.enabled) return { ok: false as const, error: "no_program" as const };

    const act = await tx
      .select()
      .from(founderReferralActivations)
      .where(eq(founderReferralActivations.inviteeUserId, input.buyerUserId))
      .limit(1);
    if (!act[0]) return { ok: false as const, error: "buyer_not_active" as const };

    const key = `issuer:${token}:${input.purchaseKey}`;
    const dup = await tx
      .select({ id: founderIssuerReferralCredits.id })
      .from(founderIssuerReferralCredits)
      .where(eq(founderIssuerReferralCredits.idempotencyKey, `${key}:l1`))
      .limit(1);
    if (dup[0]) return { ok: false as const, error: "duplicate" as const };

    const inviterId = act[0].inviterUserId;
    const l1Beneficiary = await eligibleBeneficiary(tx, inviterId);
    if (!l1Beneficiary) return { ok: false as const, error: "nothing" as const };
    const inviterRow = await tx
      .select({ invitedBy: founders.invitedByUserId })
      .from(founders)
      .where(eq(founders.userId, inviterId))
      .limit(1);
    const l2Beneficiary = await eligibleBeneficiary(tx, inviterRow[0]?.invitedBy ?? null);

    const credits = computeIssuerPurchaseCredits({
      purchaseAmount: input.purchaseAmount,
      l1Bps: program.l1Bps,
      remainingAllocation: toBig(program.allocationAmount) - toBig(program.spentAmount),
      hasL2Beneficiary: Boolean(l2Beneficiary) && l2Beneficiary !== input.buyerUserId,
    });
    if (!credits.length) return { ok: false as const, error: "nothing" as const };

    let spent = BigInt(0);
    for (const c of credits) {
      await tx.insert(founderIssuerReferralCredits).values({
        tokenAddress: token,
        beneficiaryUserId: c.level === 1 ? l1Beneficiary : (l2Beneficiary as string),
        buyerUserId: input.buyerUserId,
        level: c.level,
        amount: c.amount.toString(),
        idempotencyKey: `${key}:l${c.level}`,
      });
      spent += c.amount;
    }
    await tx
      .update(founderIssuerReferralPrograms)
      .set({ spentAmount: (toBig(program.spentAmount) + spent).toString() })
      .where(eq(founderIssuerReferralPrograms.tokenAddress, token));
    return { ok: true as const, credited: credits.map((c) => ({ level: c.level, amount: c.amount.toString() })) };
  });
}

export async function resolveBuyerByWallet(walletRaw: string): Promise<string | null> {
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
