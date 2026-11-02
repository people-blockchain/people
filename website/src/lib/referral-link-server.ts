import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founders, partners } from "@/db/schema";
import { normalizeReferralCode } from "@/lib/partner/referral";

/**
 * One invite link for every program. The short code in `/?ref=<code>` is the inviter's
 * partner code, which every account gets at first sign-in (`ensurePartner`). These helpers
 * turn that code into what each program needs: the user id (founders referral, partner
 * graph) and a wallet address (the on-chain participant referral).
 */

export async function resolveUserIdByReferralCode(raw: string | null | undefined): Promise<string | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const db = await getDbReady();
  const row = await db
    .select({ userId: partners.userId })
    .from(partners)
    .where(eq(partners.referralCode, code))
    .limit(1);
  return row[0]?.userId ?? null;
}

/** The inviter only counts for the founders referral when they are a founder themselves. */
export async function resolveFounderUserIdByReferralCode(raw: string | null | undefined): Promise<string | null> {
  const userId = await resolveUserIdByReferralCode(raw);
  if (!userId) return null;
  const db = await getDbReady();
  const row = await db
    .select({ userId: founders.userId })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);
  return row[0]?.userId ?? null;
}

/** Founder card wallet first (what old `?ref=0x…` links carried), else the partner-linked wallet. */
export async function resolveWalletByReferralCode(raw: string | null | undefined): Promise<string | null> {
  const userId = await resolveUserIdByReferralCode(raw);
  if (!userId) return null;
  const db = await getDbReady();
  const founder = await db
    .select({ wallet: founders.walletAddress })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);
  if (founder[0]?.wallet) return founder[0].wallet;
  const partner = await db
    .select({ wallet: partners.walletAddress })
    .from(partners)
    .where(eq(partners.userId, userId))
    .limit(1);
  return partner[0]?.wallet ?? null;
}

export async function referralCodeForUserId(userId: string): Promise<string | null> {
  const db = await getDbReady();
  const row = await db
    .select({ code: partners.referralCode })
    .from(partners)
    .where(eq(partners.userId, userId))
    .limit(1);
  return row[0]?.code ?? null;
}
