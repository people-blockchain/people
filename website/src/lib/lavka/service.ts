import { and, desc, eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import {
  lavkaCustomerLinks,
  lavkaEscrowRecords,
  lavkaLoyaltyPrograms,
  lavkaMerchants,
  lavkaRedemptions,
  partners,
} from "@/db/schema";
import { normalizeCountryCode } from "@/lib/founders/config";
import { verifyEscrowCreatedTx, verifyProgramCreatedTx, verifyRedeemVisitTx } from "./chain-verify";
import { enrollFounderAfterFirstRedeem } from "./founder-bridge";
import { displayNameError, programTitleError } from "./limits";
import { slugifyMerchantName, withSlugSuffix } from "./slug";

export type MerchantProfile = {
  userId: string;
  slug: string;
  displayName: string;
  countryCode: string;
  walletAddress: string;
  ratingAvg: number;
  ratingCount: number;
};

export type LoyaltyProgramRow = {
  id: string;
  chainProgramId: number;
  title: string;
  visitsPerPurchase: number;
  validUntil: string | null;
  transferable: boolean;
  pricePpl: number;
};

export async function resolveWallet(userId: string): Promise<string | null> {
  const db = await getDbReady();
  const row = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  const w = row[0]?.walletAddress?.trim();
  return w ? w.toLowerCase() : null;
}

export async function getMerchantByUserId(userId: string): Promise<MerchantProfile | null> {
  const db = await getDbReady();
  const row = await db.select().from(lavkaMerchants).where(eq(lavkaMerchants.userId, userId)).limit(1);
  const m = row[0];
  if (!m) return null;
  const ratingAvg = m.ratingCount > 0 ? m.ratingSum / m.ratingCount : 0;
  return {
    userId: m.userId,
    slug: m.slug,
    displayName: m.displayName,
    countryCode: m.countryCode,
    walletAddress: m.walletAddress,
    ratingAvg,
    ratingCount: m.ratingCount,
  };
}

export async function getMerchantBySlug(slug: string): Promise<MerchantProfile | null> {
  const db = await getDbReady();
  const row = await db.select().from(lavkaMerchants).where(eq(lavkaMerchants.slug, slug)).limit(1);
  const m = row[0];
  if (!m) return null;
  const ratingAvg = m.ratingCount > 0 ? m.ratingSum / m.ratingCount : 0;
  return {
    userId: m.userId,
    slug: m.slug,
    displayName: m.displayName,
    countryCode: m.countryCode,
    walletAddress: m.walletAddress,
    ratingAvg,
    ratingCount: m.ratingCount,
  };
}

export async function upsertMerchant(input: {
  userId: string;
  displayName: string;
  countryRaw: string;
}): Promise<{ ok: true; merchant: MerchantProfile } | { ok: false; error: "invalid_country" | "wallet_required" }> {
  // LAV-M6: the route already rejects out-of-range names; this is the last line of defense
  // so any future caller cannot write an unbounded string into the public venue page.
  if (displayNameError(input.displayName)) throw new Error("merchant_display_name_invalid");
  const countryCode = normalizeCountryCode(input.countryRaw);
  if (!countryCode) return { ok: false, error: "invalid_country" };
  const wallet = await resolveWallet(input.userId);
  if (!wallet) return { ok: false, error: "wallet_required" };

  const db = await getDbReady();
  const existing = await getMerchantByUserId(input.userId);
  if (existing) {
    await db
      .update(lavkaMerchants)
      .set({ displayName: input.displayName.trim(), countryCode })
      .where(eq(lavkaMerchants.userId, input.userId));
    const updated = await getMerchantByUserId(input.userId);
    if (!updated) throw new Error("merchant_update_failed");
    return { ok: true, merchant: updated };
  }

  const baseSlug = slugifyMerchantName(input.displayName);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const taken = await db.select().from(lavkaMerchants).where(eq(lavkaMerchants.slug, slug)).limit(1);
    if (!taken[0]) break;
    slug = withSlugSuffix(baseSlug, crypto.randomUUID().slice(0, 6));
  }

  await db.insert(lavkaMerchants).values({
    userId: input.userId,
    slug,
    displayName: input.displayName.trim(),
    countryCode,
    walletAddress: wallet,
  });

  const merchant = await getMerchantByUserId(input.userId);
  if (!merchant) throw new Error("merchant_insert_failed");
  return { ok: true, merchant };
}

export async function listProgramsForMerchant(merchantUserId: string): Promise<LoyaltyProgramRow[]> {
  const db = await getDbReady();
  const rows = await db
    .select()
    .from(lavkaLoyaltyPrograms)
    .where(eq(lavkaLoyaltyPrograms.merchantUserId, merchantUserId))
    .orderBy(desc(lavkaLoyaltyPrograms.createdAt));
  return rows.map((r) => ({
    id: r.id,
    chainProgramId: r.chainProgramId,
    title: r.title,
    visitsPerPurchase: r.visitsPerPurchase,
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
    transferable: r.transferable,
    pricePpl: r.pricePpl,
  }));
}

export type RegisterProgramResult =
  | { ok: true; program: LoyaltyProgramRow }
  | {
      ok: false;
      error:
        | "merchant_missing"
        | "invalid_tx_hash"
        | "tx_not_found"
        | "tx_failed"
        | "wrong_contract"
        | "event_missing"
        | "invalid_program_terms"
        | "not_program_owner"
        | "program_already_registered";
    };

/**
 * The chain program id and all its terms come from the `ProgramCreated` event of
 * `createTxHash`, never from the caller — see chain-verify.ts. This is what keeps one
 * merchant from squatting someone else's (or a future) program id.
 */
export async function registerProgram(input: {
  merchantUserId: string;
  title: string;
  createTxHash: string;
}): Promise<RegisterProgramResult> {
  // LAV-M6: same defense-in-depth cap as upsertMerchant — titles are rendered publicly.
  if (programTitleError(input.title)) throw new Error("program_title_invalid");
  const merchant = await getMerchantByUserId(input.merchantUserId);
  if (!merchant) return { ok: false, error: "merchant_missing" };

  const verify = await verifyProgramCreatedTx(input.createTxHash, merchant.walletAddress);
  if (!verify.ok) {
    return {
      ok: false,
      error: verify.error === "merchant_mismatch" ? "not_program_owner" : verify.error,
    };
  }

  const db = await getDbReady();
  const id = crypto.randomUUID();
  const inserted = await db
    .insert(lavkaLoyaltyPrograms)
    .values({
      id,
      merchantUserId: input.merchantUserId,
      chainProgramId: verify.chainProgramId,
      title: input.title.trim(),
      visitsPerPurchase: verify.visitsPerPurchase,
      validUntil: verify.validUntil,
      transferable: verify.transferable,
      pricePpl: verify.pricePpl,
      createTxHash: input.createTxHash.toLowerCase(),
    })
    .onConflictDoNothing()
    .returning({ id: lavkaLoyaltyPrograms.id });
  if (!inserted[0]) {
    return { ok: false, error: "program_already_registered" };
  }
  const rows = await listProgramsForMerchant(input.merchantUserId);
  const created = rows.find((p) => p.id === id);
  if (!created) throw new Error("program_missing");
  return { ok: true, program: created };
}

export type RecordRedemptionResult =
  | { ok: true; visits: number; founder: Awaited<ReturnType<typeof enrollFounderAfterFirstRedeem>> }
  | {
      ok: false;
      error:
        | "program_not_found"
        | "invalid_tx_hash"
        | "tx_not_found"
        | "tx_failed"
        | "wrong_contract"
        | "event_missing"
        | "program_mismatch"
        | "holder_mismatch"
        | "zero_visits"
        | "visits_mismatch";
    };

export async function recordRedemption(input: {
  customerUserId: string;
  programDbId: string;
  walletAddress: string;
  txHash: string;
  ip: string;
  /** The visit count the caller asked the wallet to redeem; verified against the event (AUD-M14). */
  expectedVisits?: number;
}): Promise<RecordRedemptionResult> {
  const db = await getDbReady();
  const program = await db
    .select()
    .from(lavkaLoyaltyPrograms)
    .where(eq(lavkaLoyaltyPrograms.id, input.programDbId))
    .limit(1);
  const p = program[0];
  if (!p) return { ok: false, error: "program_not_found" };

  const verify = await verifyRedeemVisitTx(
    input.txHash,
    p.chainProgramId,
    input.walletAddress,
    input.expectedVisits,
  );
  if (!verify.ok) return { ok: false, error: verify.error };

  const inserted = await db
    .insert(lavkaRedemptions)
    .values({
      programId: input.programDbId,
      customerUserId: input.customerUserId,
      walletAddress: input.walletAddress.toLowerCase(),
      visits: verify.visits,
      txHash: input.txHash.toLowerCase(),
    })
    .onConflictDoNothing()
    .returning({ id: lavkaRedemptions.id });

  if (!inserted[0]) {
    return { ok: true, visits: verify.visits, founder: { status: "skipped", reason: "duplicate_tx" } };
  }

  const merchant = await getMerchantByUserId(p.merchantUserId);
  if (!merchant) throw new Error("merchant_missing");

  const linkExists = await db
    .select()
    .from(lavkaCustomerLinks)
    .where(
      and(
        eq(lavkaCustomerLinks.merchantUserId, p.merchantUserId),
        eq(lavkaCustomerLinks.customerUserId, input.customerUserId),
      ),
    )
    .limit(1);

  let founderBridge: Awaited<ReturnType<typeof enrollFounderAfterFirstRedeem>> = {
    status: "skipped",
    reason: "not_first",
  };
  if (!linkExists[0]) {
    await db.insert(lavkaCustomerLinks).values({
      merchantUserId: p.merchantUserId,
      customerUserId: input.customerUserId,
    });
    founderBridge = await enrollFounderAfterFirstRedeem(
      input.customerUserId,
      merchant.countryCode,
      p.merchantUserId,
      input.ip,
    );
  }

  return { ok: true, visits: verify.visits, founder: founderBridge };
}

export type RecordEscrowResult =
  | { ok: true; chainEscrowId: number }
  | {
      ok: false;
      error:
        | "merchant_not_found"
        | "wallet_required"
        | "invalid_tx_hash"
        | "tx_not_found"
        | "tx_failed"
        | "wrong_contract"
        | "event_missing"
        | "merchant_mismatch"
        | "customer_mismatch"
        | "terms_mismatch"
        | "escrow_already_recorded";
    };

/**
 * Records a prepaid escrow after checking it against the chain. Every stored field except the
 * free-text note comes from the `EscrowCreated` event and the escrow struct — the request body
 * only says *which* transaction to look at. Without this, a customer could register an escrow id
 * that belongs to someone else (or to no escrow at all) and a merchant screen built on these rows
 * would be reading fiction. Mirrors `registerProgram` / `recordRedemption`.
 */
export async function recordEscrowFromChain(input: {
  customerUserId: string;
  merchantSlug: string;
  createTxHash: string;
  termsNote: string | null;
}): Promise<RecordEscrowResult> {
  const merchant = await getMerchantBySlug(input.merchantSlug);
  if (!merchant) return { ok: false, error: "merchant_not_found" };
  const customerWallet = await resolveWallet(input.customerUserId);
  if (!customerWallet) return { ok: false, error: "wallet_required" };

  const verify = await verifyEscrowCreatedTx(
    input.createTxHash,
    merchant.walletAddress,
    customerWallet,
    input.termsNote,
  );
  if (!verify.ok) return { ok: false, error: verify.error };

  const db = await getDbReady();
  const inserted = await db
    .insert(lavkaEscrowRecords)
    .values({
      chainEscrowId: verify.chainEscrowId,
      merchantUserId: merchant.userId,
      customerUserId: input.customerUserId,
      amountPpl: verify.amountPpl,
      deadline: verify.deadline,
      status: "locked",
      termsNote: input.termsNote,
      createTxHash: input.createTxHash.toLowerCase(),
    })
    .onConflictDoNothing()
    .returning({ id: lavkaEscrowRecords.id });
  if (!inserted[0]) return { ok: false, error: "escrow_already_recorded" };
  return { ok: true, chainEscrowId: verify.chainEscrowId };
}

export async function bumpMerchantRating(merchantUserId: string, stars: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  const db = await getDbReady();
  const row = await db.select().from(lavkaMerchants).where(eq(lavkaMerchants.userId, merchantUserId)).limit(1);
  const m = row[0];
  if (!m) return;
  await db
    .update(lavkaMerchants)
    .set({
      ratingSum: m.ratingSum + clamped,
      ratingCount: m.ratingCount + 1,
    })
    .where(eq(lavkaMerchants.userId, merchantUserId));
}
