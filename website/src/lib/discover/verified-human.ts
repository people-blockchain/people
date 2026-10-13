import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { partners } from "@/db/schema";

export type VerifiedHumanContext = {
  userId: string;
  email: string | null | undefined;
  walletAddress: string | null;
};

/**
 * Minimal proof-of-humanity gate: signed-in account with a linked wallet.
 * Replace internals when on-chain PoH ships; keep this function as the single entry point.
 */
export async function loadVerifiedHuman(userId: string): Promise<VerifiedHumanContext | null> {
  if (!userId) return null;
  const db = await getDbReady();
  const row = await db.select().from(partners).where(eq(partners.userId, userId)).limit(1);
  const walletAddress = row[0]?.walletAddress?.trim() || null;
  if (!walletAddress) return null;
  return { userId, email: undefined, walletAddress };
}

export async function isVerifiedHuman(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const ctx = await loadVerifiedHuman(userId);
  return Boolean(ctx?.walletAddress);
}
