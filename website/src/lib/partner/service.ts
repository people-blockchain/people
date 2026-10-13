import { and, eq, inArray } from "drizzle-orm";
import { getDbReady } from "@/db";
import { partners, users } from "@/db/schema";
import {
  evaluateReferralAttach,
  normalizeReferralCode,
  referralCodeFromUserId,
  withinReferralRegistrationWindow,
  type PartnerNode,
} from "@/lib/partner/referral";
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

export async function attachReferralIfEligible(userId: string, rawCode: string | null | undefined) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { attached: false as const, reason: "invalid_code" as const };
  const db = await getDbReady();
  const invitee = await ensurePartner(userId);
  // Bind near registration only: a stale cookie must not attribute an old account.
  if (!withinReferralRegistrationWindow(invitee.createdAt)) {
    return { attached: false as const, reason: "outside_registration_window" as const };
  }
  const referrerRows = await db.select().from(partners).where(eq(partners.referralCode, code)).limit(1);
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
  await db
    .update(partners)
    .set({ referredByUserId: decision.parentUserId })
    .where(eq(partners.userId, userId));
  return { attached: true as const, parentUserId: decision.parentUserId };
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
  // Replacing an already-bound wallet requires an explicit owner flow; reject like the
  // vault-sync path rather than silently swapping the address.
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
  // wallet-sessions.md #7: two concurrent bindWallet() calls for the same user could both read
  // the same still-valid nonce above and both pass verification. Clear it with a conditional
  // UPDATE scoped to the exact nonce just read; whichever request loses the race updates zero
  // rows and is treated as a failure instead of silently double-binding.
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

export async function loadCabinet(userId: string) {
  const db = await getDbReady();
  const profile = await ensurePartner(userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  // Only the viewer's own line (L1 + their L2) and immediate referrer are needed, so
  // read those rows directly instead of scanning the whole partner table per page view.
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
  type LineRow = (typeof l1Rows)[number];
  const mapLine = (row: LineRow) => ({
    userId: row.userId,
    referralCode: row.referralCode,
    email: maskEmail(row.email),
    walletAddress: row.walletAddress ?? null,
  });
  return {
    email: user?.email ?? null,
    referralCode: profile.referralCode,
    referredBy: parent ? { referralCode: parent.referralCode, email: maskEmail(parent.email) } : null,
    walletAddress: profile.walletAddress,
    walletBoundAt: profile.walletBoundAt?.toISOString() ?? null,
    l1: l1Rows.map(mapLine),
    l2: l2Rows.map(mapLine),
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
