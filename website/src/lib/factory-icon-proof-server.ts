import { lt } from "drizzle-orm";
import { getDbReady } from "@/db";
import { factoryIconProofNonces } from "@/db/schema";
import { ICON_QUOTA_PROOF_MAX_AGE_MS } from "@/lib/factory-icon-proof";

/** WEB-02: consume a wallet-ownership proof nonce once so the same signature cannot be replayed. */
export async function claimIconQuotaProofNonce(
  wallet: string,
  nonce: string,
  issuedAt: number
): Promise<boolean> {
  const db = await getDbReady();
  const normalized = wallet.trim().toLowerCase();
  const expiresAt = new Date(issuedAt + ICON_QUOTA_PROOF_MAX_AGE_MS);
  const rows = await db
    .insert(factoryIconProofNonces)
    .values({ walletAddress: normalized, nonce, expiresAt })
    .onConflictDoNothing()
    .returning({ nonce: factoryIconProofNonces.nonce });
  if (Math.random() < 0.05) {
    await db
      .delete(factoryIconProofNonces)
      .where(lt(factoryIconProofNonces.expiresAt, new Date()))
      .catch(() => {});
  }
  return rows.length > 0;
}
