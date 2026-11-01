import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderNftAuthNonces } from "@/db/schema";
import type { FounderNftWalletAuthRow } from "./founder-nft-wallet-auth.ts";

const TTL_MS = 10 * 60 * 1000;

/**
 * Single-use wallet-auth nonce for Founder NFT mint and rebind. Same storage shape as
 * `founder_passport_nonce` (code, user, expiry, usedAt). No new secret: the nonce is random
 * and the wallet signature is the proof. `expiresAt` returned to the client is the value read
 * back from the row, so the signed message matches what verification rebuilds.
 */
export async function createFounderNftAuthNonce(
  userId: string,
  chainId: number,
): Promise<{ nonce: string; expiresAt: string; chainId: number }> {
  const nonce = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const db = await getDbReady();
  await db.insert(founderNftAuthNonces).values({ code: nonce, userId, chainId, expiresAt });
  const row = await readFounderNftAuthNonce(userId, nonce);
  if (!row) throw new Error("founder_nft_auth_nonce_insert_failed");
  return { nonce, expiresAt: row.expiresAt, chainId: row.chainId };
}

export async function readFounderNftAuthNonce(userId: string, nonce: string): Promise<FounderNftWalletAuthRow | null> {
  const db = await getDbReady();
  const rows = await db
    .select({
      chainId: founderNftAuthNonces.chainId,
      expiresAt: founderNftAuthNonces.expiresAt,
      usedAt: founderNftAuthNonces.usedAt,
    })
    .from(founderNftAuthNonces)
    .where(and(eq(founderNftAuthNonces.code, nonce), eq(founderNftAuthNonces.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { chainId: row.chainId, expiresAt: row.expiresAt.toISOString(), used: row.usedAt !== null };
}

/** Claims an unused nonce. False when it is missing, already used, or expired. */
export async function consumeFounderNftAuthNonce(userId: string, nonce: string): Promise<boolean> {
  const db = await getDbReady();
  const rows = await db
    .update(founderNftAuthNonces)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(founderNftAuthNonces.code, nonce),
        eq(founderNftAuthNonces.userId, userId),
        isNull(founderNftAuthNonces.usedAt),
        gt(founderNftAuthNonces.expiresAt, new Date()),
      ),
    )
    .returning({ code: founderNftAuthNonces.code });
  return rows.length === 1;
}
