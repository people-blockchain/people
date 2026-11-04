import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  partners,
  referralCommissionLedgers,
  referralPayoutBatches,
  saleBuyerBindings,
  salePurchases,
  users,
} from "@/db/schema";
import {
  evaluateReferralAttach,
  normalizeKolCode,
  normalizeReferralCode,
  parseReferralCookie,
  referralCodeFromUserId,
  withinReferralRegistrationWindow,
  type PartnerNode,
} from "@/lib/partner/referral";
import {
  computeKolTierProgress,
  formatMicroPpl,
  formatMicroUsd,
  loadKolTierConfig,
  type KolTierProgress,
} from "@/lib/partner/commission";
import { buildWalletBindMessage, verifyWalletProof, type WalletProof } from "@/lib/partner/wallet";
import { maskEmail } from "@/lib/partner/mask";
import { loadUserWalletVault } from "@/lib/wallet-cloud-server";

function toNode(row: {
  userId: string;
  referralCode: string;
  referredByUserId: string | null;
}): PartnerNode {
  return {
    userId: row.userId,
    referralCode: row.referralCode,
    referredByUserId: row.referredByUserId,
  };
}

function encodeChallenge(nonce: string, issuedAt: string): string {
  return `${nonce}::${issuedAt}`;
}

function decodeChallenge(raw: string | null): { nonce: string; issuedAt: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf("::");
  if (idx <= 0) return null;
  return { nonce: raw.slice(0, idx), issuedAt: raw.slice(idx + 2) };
}

export async function ensurePartner(userId: string) {
  const db = await getDbReady();
  const existing = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const referralCode = referralCodeFromUserId(userId);
  await db.insert(partners).values({ userId, referralCode, createdAt: new Date() }).onConflictDoNothing();
  const created = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  if (!created[0]) {
    throw new Error("failed_to_create_partner");
  }
  return created[0];
}

export type AttachReferralOptions = {
  cookieSetAt?: Date | number | null;
  now?: number;
};

export async function attachReferralIfEligible(
  userId: string,
  rawCode: string | null | undefined,
  options?: AttachReferralOptions,
) {
  const parsedCookie = parseReferralCookie(rawCode);
  const code = parsedCookie?.code ?? normalizeReferralCode(rawCode);
  if (!code) return { attached: false as const, reason: "invalid_code" as const };

  const db = await getDbReady();
  const invitee = await ensurePartner(userId);
  if (invitee.referredByUserId) {
    return { attached: false as const, reason: "already_bound" as const };
  }

  const now = options?.now ?? Date.now();
  const cookieSetAt = options?.cookieSetAt ?? parsedCookie?.setAt ?? invitee.referralCookieSetAt ?? null;

  // Measure the 30-day attribution window from cookie set time when present; fall back to
  // the 24h registration window for legacy untimestamped cookies.
  if (!withinReferralRegistrationWindow(invitee.createdAt, now, cookieSetAt)) {
    return { attached: false as const, reason: "outside_registration_window" as const };
  }

  const referrerRows = await db
    .select()
    .from(partners)
    .where(or(eq(partners.referralCode, code), eq(sql`lower(${partners.kolCode})`, code)))
    .limit(1);
  const referrerRow = referrerRows[0];

  // Cycle/depth decisions only ever need the referrer and its parent (max depth is 2),
  // so fetch those two rows instead of scanning the whole partner table.
  const nodes = new Map<string, PartnerNode>();
  if (referrerRow) {
    nodes.set(referrerRow.userId, toNode(referrerRow));
    if (referrerRow.referredByUserId) {
      const [grandparent] = await db
        .select()
        .from(partners)
        .where(eq(partners.userId, referrerRow.referredByUserId))
        .limit(1);
      if (grandparent) nodes.set(grandparent.userId, toNode(grandparent));
    }
  }

  const decision = evaluateReferralAttach({
    inviteeUserId: userId,
    inviteeAlreadyHasParent: Boolean(invitee.referredByUserId),
    referrer: referrerRow ? toNode(referrerRow) : null,
    nodes,
  });
  if (!decision.ok) {
    return { attached: false as const, reason: decision.reason };
  }

  const matchedKolCode =
    referrerRow?.kolCode && referrerRow.kolCode.toLowerCase() === code
      ? referrerRow.kolCode.toLowerCase()
      : referrerRow?.kolCode?.toLowerCase() ?? null;
  const setAtDate =
    cookieSetAt instanceof Date
      ? cookieSetAt
      : typeof cookieSetAt === "number" && Number.isFinite(cookieSetAt)
        ? new Date(cookieSetAt)
        : new Date(now);

  await db
    .update(partners)
    .set({
      referredByUserId: decision.parentUserId,
      referredByKolCode: matchedKolCode,
      referralAttachedAt: new Date(now),
      referralCookieSetAt: setAtDate,
    })
    .where(eq(partners.userId, userId));

  await db
    .update(partners)
    .set({
      referralClicks: sql`${partners.referralClicks} + 1`,
    })
    .where(eq(partners.userId, decision.parentUserId));

  return {
    attached: true as const,
    parentUserId: decision.parentUserId,
    referralCode: referrerRow?.referralCode ?? code,
    kolCode: matchedKolCode,
  };
}

export async function bindBuyerWalletForReferral(input: {
  buyerWallet: string;
  peopleAddress?: string | null;
  userId?: string | null;
  rawCode?: string | null;
  ipHash?: string | null;
  deviceHash?: string | null;
}) {
  const wallet = input.buyerWallet.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
    return { ok: false as const, error: "invalid_wallet" as const };
  }
  const db = await getDbReady();
  let referrerUserId: string | null = null;
  let kolCode: string | null = null;
  let cookieSetAt: Date | null = null;

  if (input.userId) {
    const profile = await ensurePartner(input.userId);
    referrerUserId = profile.referredByUserId ?? null;
    kolCode = profile.referredByKolCode ?? null;
    cookieSetAt = profile.referralCookieSetAt ?? null;
  }

  if (!referrerUserId && input.rawCode) {
    const parsed = parseReferralCookie(input.rawCode);
    const code = parsed?.code ?? normalizeReferralCode(input.rawCode);
    cookieSetAt = parsed?.setAt ?? cookieSetAt;
    if (code) {
      const [referrer] = await db
        .select()
        .from(partners)
        .where(or(eq(partners.referralCode, code), eq(sql`lower(${partners.kolCode})`, code)))
        .limit(1);
      if (referrer && referrer.userId !== input.userId) {
        referrerUserId = referrer.userId;
        kolCode = referrer.kolCode?.toLowerCase() ?? null;
      }
    }
  }

  const existing = await db
    .select()
    .from(saleBuyerBindings)
    .where(eq(saleBuyerBindings.buyerWallet, wallet))
    .limit(1);

  if (existing[0]) {
    if (!existing[0].userId && input.userId) {
      await db
        .update(saleBuyerBindings)
        .set({
          userId: input.userId,
          referrerUserId: existing[0].referrerUserId ?? referrerUserId,
          kolCode: existing[0].kolCode ?? kolCode,
          peopleAddress: input.peopleAddress?.trim().toLowerCase() ?? existing[0].peopleAddress,
        })
        .where(eq(saleBuyerBindings.buyerWallet, wallet));
    }
    return {
      ok: true as const,
      buyerWallet: wallet,
      referrerUserId: existing[0].referrerUserId ?? referrerUserId,
      kolCode: existing[0].kolCode ?? kolCode,
    };
  }

  await db
    .insert(saleBuyerBindings)
    .values({
      buyerWallet: wallet,
      peopleAddress: input.peopleAddress?.trim().toLowerCase() ?? null,
      userId: input.userId ?? null,
      referrerUserId,
      kolCode,
      source: input.userId ? "account" : "cookie",
      cookieSetAt,
      boundAt: new Date(),
      ipHash: input.ipHash ?? null,
      deviceHash: input.deviceHash ?? null,
    })
    .onConflictDoNothing();

  return { ok: true as const, buyerWallet: wallet, referrerUserId, kolCode };
}

export async function claimKolCode(userId: string, rawKolCode: string | null | undefined) {
  const normalized = normalizeKolCode(rawKolCode);
  if (!normalized) {
    return { ok: false as const, error: "invalid_kol_code" as const };
  }
  const db = await getDbReady();
  await ensurePartner(userId);

  const taken = await db
    .select({ userId: partners.userId })
    .from(partners)
    .where(
      or(
        eq(sql`lower(${partners.kolCode})`, normalized),
        eq(partners.referralCode, normalized),
      ),
    )
    .limit(1);

  if (taken[0] && taken[0].userId !== userId) {
    return { ok: false as const, error: "kol_code_taken" as const };
  }

  await db
    .update(partners)
    .set({ kolCode: normalized })
    .where(eq(partners.userId, userId));

  return { ok: true as const, kolCode: normalized };
}

export async function issueWalletChallenge(userId: string, email: string, origin: string) {
  const db = await getDbReady();
  await ensurePartner(userId);
  const nonce = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await db
    .update(partners)
    .set({ challengeNonce: encodeChallenge(nonce, issuedAt), challengeExpiresAt: expires })
    .where(eq(partners.userId, userId));
  const message = buildWalletBindMessage({ email, nonce, issuedAt, origin });
  return { nonce, issuedAt, expiresAt: expires.toISOString(), message };
}

/** Trusted bind after cloud vault creation (same user owns the key). */
export async function bindPartnerWalletFromVault(userId: string, address: string, publicKey: string) {
  const db = await getDbReady();
  await ensurePartner(userId);
  const normalized = address.trim().toLowerCase();
  const pub = publicKey.trim().toLowerCase().replace(/^0x/, "");
  const taken = await db
    .select({ userId: partners.userId })
    .from(partners)
    .where(eq(partners.walletAddress, normalized))
    .limit(1);
  if (taken[0] && taken[0].userId !== userId) {
    return { ok: false as const, error: "wallet_taken" as const };
  }
  const [row] = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  if (row?.walletAddress && row.walletAddress.toLowerCase() !== normalized) {
    return { ok: false as const, error: "wallet_conflict" as const };
  }
  if (row?.walletAddress?.toLowerCase() === normalized) {
    return { ok: true as const, address: normalized };
  }
  await db
    .update(partners)
    .set({
      walletAddress: normalized,
      walletPublicKey: pub,
      walletBoundAt: new Date(),
      challengeNonce: null,
      challengeExpiresAt: null,
    })
    .where(eq(partners.userId, userId));
  return { ok: true as const, address: normalized };
}

/**
 * Keeps an existing partner-linked wallet. Otherwise links the cloud vault address
 * when present (no signature step).
 */
export async function linkPartnerWalletFromVaultIfAbsent(userId: string) {
  const db = await getDbReady();
  await ensurePartner(userId);
  const [row] = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  if (row?.walletAddress) {
    return { ok: true as const, address: row.walletAddress, source: "existing" as const };
  }
  const vault = await loadUserWalletVault(userId);
  if (!vault) {
    return { ok: false as const, error: "no_vault" as const };
  }
  const bind = await bindPartnerWalletFromVault(userId, vault.address, vault.publicKey);
  if (!bind.ok) return { ok: false as const, error: bind.error };
  return { ok: true as const, address: bind.address, source: "vault" as const };
}

export async function bindWallet(
  userId: string,
  email: string,
  origin: string,
  proof: Omit<WalletProof, "message"> & { message: string },
) {
  const db = await getDbReady();
  const [row] = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  if (!row?.challengeNonce || !row.challengeExpiresAt || row.challengeExpiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: "challenge_expired" as const };
  }
  const parsed = decodeChallenge(row.challengeNonce);
  if (!parsed) {
    return { ok: false as const, error: "challenge_expired" as const };
  }
  const expected = buildWalletBindMessage({
    email,
    nonce: parsed.nonce,
    issuedAt: parsed.issuedAt,
    origin,
  });
  if (proof.message !== expected) {
    return { ok: false as const, error: "challenge_mismatch" as const };
  }
  const verified = verifyWalletProof(proof);
  if (!verified.ok) {
    return { ok: false as const, error: verified.error };
  }
  if (row.walletAddress && row.walletAddress.toLowerCase() !== verified.address) {
    return { ok: false as const, error: "wallet_conflict" as const };
  }
  const taken = await db
    .select({ userId: partners.userId })
    .from(partners)
    .where(eq(partners.walletAddress, verified.address))
    .limit(1);
  if (taken[0] && taken[0].userId !== userId) {
    return { ok: false as const, error: "wallet_taken" as const };
  }
  const updated = await db
    .update(partners)
    .set({
      walletAddress: verified.address,
      walletPublicKey: verified.publicKey,
      walletBoundAt: new Date(),
      challengeNonce: null,
      challengeExpiresAt: null,
    })
    .where(and(eq(partners.userId, userId), eq(partners.challengeNonce, row.challengeNonce)))
    .returning({ userId: partners.userId });
  if (updated.length === 0) {
    return { ok: false as const, error: "challenge_expired" as const };
  }
  return { ok: true as const, address: verified.address };
}

export type CabinetCommissionRow = {
  id: string;
  purchaseId: string;
  buyerAddress: string;
  program: string;
  level: number;
  usdcRateBps: number;
  pplRateBps: number;
  usdPurchaseMicro: string;
  pplPurchaseMicro: string;
  netUsdcMicro: string;
  netPplMicro: string;
  usdcFormatted: string;
  pplFormatted: string;
  usdcSettlementNetwork: string;
  pplSettlementNetwork: string;
  status: string;
  voidReason: string | null;
  holdUntil: string;
  paidTxHashBase: string | null;
  paidTxHashPeople: string | null;
  createdAt: string;
};

export type CabinetPayoutBatchRow = {
  id: string;
  periodKey: string;
  status: string;
  usdcAmountMicro: string;
  pplAmountMicro: string;
  usdcFormatted: string;
  pplFormatted: string;
  usdcNetwork: string;
  pplNetwork: string;
  usdcTxHash: string | null;
  pplTxHash: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type CabinetCommissionItem = CabinetCommissionRow;
export type CabinetPayoutItem = CabinetPayoutBatchRow;

export type CabinetMetrics = {
  clicks: number;
  signUps: number;
  buyers: number;
  volumeUsd: string;
  volumeUsdMicro: string;
  earnedUsdc: {
    pendingMicro: string;
    approvedMicro: string;
    paidMicro: string;
    voidMicro: string;
    totalEarnedMicro: string;
  };
  earnedPpl: {
    pendingMicro: string;
    approvedMicro: string;
    paidMicro: string;
    voidMicro: string;
    totalEarnedMicro: string;
  };
};

export async function loadCabinet(userId: string) {
  const db = await getDbReady();
  const profile = await ensurePartner(userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const lineColumns = {
    userId: partners.userId,
    referralCode: partners.referralCode,
    referredByUserId: partners.referredByUserId,
    email: users.email,
    walletAddress: partners.walletAddress,
  };
  const l1Rows = await db
    .select(lineColumns)
    .from(partners)
    .leftJoin(users, eq(users.id, partners.userId))
    .where(eq(partners.referredByUserId, userId));
  const l1Ids = l1Rows.map((row) => row.userId);
  const l2Rows = l1Ids.length
    ? await db
        .select(lineColumns)
        .from(partners)
        .leftJoin(users, eq(users.id, partners.userId))
        .where(inArray(partners.referredByUserId, l1Ids))
    : [];
  const parent = profile.referredByUserId
    ? (
        await db
          .select(lineColumns)
          .from(partners)
          .leftJoin(users, eq(users.id, partners.userId))
          .where(eq(partners.userId, profile.referredByUserId))
          .limit(1)
      )[0]
    : null;

  const commissionRows = await db
    .select()
    .from(referralCommissionLedgers)
    .where(eq(referralCommissionLedgers.beneficiaryUserId, userId))
    .orderBy(desc(referralCommissionLedgers.createdAt))
    .limit(100);

  const payoutRows = await db
    .select()
    .from(referralPayoutBatches)
    .where(eq(referralPayoutBatches.beneficiaryUserId, userId))
    .orderBy(desc(referralPayoutBatches.createdAt))
    .limit(50);

  const purchaseBuyerRows = await db
    .select({
      buyerAddress: salePurchases.buyerAddress,
      usdMicro: salePurchases.usdMicro,
      status: salePurchases.status,
      eventKind: salePurchases.eventKind,
    })
    .from(salePurchases)
    .where(and(eq(salePurchases.referrerUserId, userId), eq(salePurchases.status, "confirmed")));

  let volumeUsdMicro = BigInt(0);
  const distinctBuyers = new Set<string>();
  for (const p of purchaseBuyerRows) {
    if (p.eventKind === "buy") {
      distinctBuyers.add(p.buyerAddress.toLowerCase());
      volumeUsdMicro += BigInt(p.usdMicro || "0");
    }
  }

  let usdcPending = BigInt(0);
  let usdcApproved = BigInt(0);
  let usdcPaid = BigInt(0);
  let usdcVoid = BigInt(0);
  let pplPending = BigInt(0);
  let pplApproved = BigInt(0);
  let pplPaid = BigInt(0);
  let pplVoid = BigInt(0);

  for (const row of commissionRows) {
    const netUsdc = BigInt(row.netUsdcMicro || "0");
    const netPpl = BigInt(row.netPplMicro || "0");
    if (row.buyerAddress) {
      distinctBuyers.add(row.buyerAddress.toLowerCase());
    }
    if (row.status === "pending") {
      usdcPending += netUsdc;
      pplPending += netPpl;
    } else if (row.status === "approved") {
      usdcApproved += netUsdc;
      pplApproved += netPpl;
    } else if (row.status === "paid") {
      usdcPaid += netUsdc;
      pplPaid += netPpl;
    } else if (row.status === "void") {
      usdcVoid += BigInt(row.grossUsdcMicro || "0");
      pplVoid += BigInt(row.grossPplMicro || "0");
    }
  }

  if (volumeUsdMicro === BigInt(0) && commissionRows.length > 0) {
    for (const row of commissionRows) {
      if (row.status !== "void") {
        volumeUsdMicro += BigInt(row.usdPurchaseMicro || "0");
      }
    }
  }

  const tierConfig = loadKolTierConfig();
  const tier: KolTierProgress = computeKolTierProgress(
    volumeUsdMicro,
    profile.kolTierOverrideBps,
    tierConfig,
  );

  const metrics: CabinetMetrics = {
    clicks: Math.max(profile.referralClicks ?? 0, l1Rows.length),
    signUps: l1Rows.length,
    buyers: distinctBuyers.size,
    volumeUsd: formatMicroUsd(volumeUsdMicro),
    volumeUsdMicro: volumeUsdMicro.toString(),
    earnedUsdc: {
      pendingMicro: usdcPending.toString(),
      approvedMicro: usdcApproved.toString(),
      paidMicro: usdcPaid.toString(),
      voidMicro: usdcVoid.toString(),
      totalEarnedMicro: (usdcPending + usdcApproved + usdcPaid).toString(),
    },
    earnedPpl: {
      pendingMicro: pplPending.toString(),
      approvedMicro: pplApproved.toString(),
      paidMicro: pplPaid.toString(),
      voidMicro: pplVoid.toString(),
      totalEarnedMicro: (pplPending + pplApproved + pplPaid).toString(),
    },
  };

  type LineRow = (typeof l1Rows)[number];
  const mapLine = (row: LineRow) => ({
    userId: row.userId,
    referralCode: row.referralCode,
    email: maskEmail(row.email),
    walletAddress: row.walletAddress ?? null,
  });

  const commissions: CabinetCommissionRow[] = commissionRows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    buyerAddress: row.buyerAddress,
    program: row.program,
    level: row.level,
    usdcRateBps: row.usdcRateBps,
    pplRateBps: row.pplRateBps,
    usdPurchaseMicro: row.usdPurchaseMicro,
    pplPurchaseMicro: row.pplPurchaseMicro,
    netUsdcMicro: row.netUsdcMicro,
    netPplMicro: row.netPplMicro,
    usdcFormatted: formatMicroUsd(row.netUsdcMicro),
    pplFormatted: formatMicroPpl(row.netPplMicro),
    usdcSettlementNetwork: row.usdcSettlementNetwork,
    pplSettlementNetwork: row.pplSettlementNetwork,
    status: row.status,
    voidReason: row.voidReason ?? null,
    holdUntil: row.holdUntil.toISOString(),
    paidTxHashBase: row.paidTxHashBase ?? null,
    paidTxHashPeople: row.paidTxHashPeople ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  const payouts: CabinetPayoutBatchRow[] = payoutRows.map((row) => ({
    id: row.id,
    periodKey: row.periodKey,
    status: row.status,
    usdcAmountMicro: row.usdcAmountMicro,
    pplAmountMicro: row.pplAmountMicro,
    usdcFormatted: formatMicroUsd(row.usdcAmountMicro),
    pplFormatted: formatMicroPpl(row.pplAmountMicro),
    usdcNetwork: row.usdcNetwork,
    pplNetwork: row.pplNetwork,
    usdcTxHash: row.usdcTxHash ?? null,
    pplTxHash: row.pplTxHash ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    email: user?.email ?? null,
    referralCode: profile.referralCode,
    kolCode: profile.kolCode ?? null,
    referredBy: parent ? { referralCode: parent.referralCode, email: maskEmail(parent.email) } : null,
    walletAddress: profile.walletAddress,
    walletBoundAt: profile.walletBoundAt?.toISOString() ?? null,
    l1: l1Rows.map(mapLine),
    l2: l2Rows.map(mapLine),
    metrics,
    tier,
    commissions,
    payouts,
  };
}

/**
 * True when the signed-in JWT still points at a real user row. A session cookie
 * can outlive its user (database reset or account removed); such a session must
 * be treated as signed out, otherwise /login bounces to /partner and /partner
 * fails while creating the partner row (foreign key on "user").
 */
export async function partnerUserExists(userId: string): Promise<boolean> {
  const db = await getDbReady();
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return rows.length > 0;
}
