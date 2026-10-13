import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderPassportNonces } from "@/db/schema";

const TTL_MS = 10 * 60 * 1000;

export async function createFounderPassportNonce(
  userId: string,
): Promise<{ nonce: string; issuedAt: Date; expiresAt: Date }> {
  const nonce = randomBytes(18).toString("base64url");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + TTL_MS);
  const db = await getDbReady();
  await db.insert(founderPassportNonces).values({ code: nonce, userId, expiresAt, createdAt: issuedAt });
  return { nonce, issuedAt, expiresAt };
}

/**
 * Atomically claims the nonce: it must belong to this user, be unused and unexpired. The
 * `usedAt` write only succeeds once per nonce, so two concurrent requests can never both win.
 */
export async function consumeFounderPassportNonce(
  nonce: string,
  userId: string,
): Promise<{ ok: true; issuedAt: Date; expiresAt: Date } | { ok: false }> {
  const db = await getDbReady();
  const now = new Date();
  const rows = await db
    .update(founderPassportNonces)
    .set({ usedAt: now })
    .where(
      and(
        eq(founderPassportNonces.code, nonce),
        eq(founderPassportNonces.userId, userId),
        isNull(founderPassportNonces.usedAt),
        gt(founderPassportNonces.expiresAt, now),
      ),
    )
    .returning({ createdAt: founderPassportNonces.createdAt, expiresAt: founderPassportNonces.expiresAt });
  const row = rows[0];
  if (!row) return { ok: false };
  return { ok: true, issuedAt: row.createdAt, expiresAt: row.expiresAt };
}
