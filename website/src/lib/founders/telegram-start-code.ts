import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderTelegramStartCodes } from "@/db/schema";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export async function createFounderTelegramStartCode(
  userId: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<string> {
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);
  const db = await getDbReady();
  await db.insert(founderTelegramStartCodes).values({ code, userId, expiresAt });
  return code;
}

export async function resolveFounderTelegramStartCode(code: string): Promise<string | null> {
  const db = await getDbReady();
  const now = new Date();
  const row = await db
    .select({ userId: founderTelegramStartCodes.userId })
    .from(founderTelegramStartCodes)
    .where(
      and(
        eq(founderTelegramStartCodes.code, code),
        gt(founderTelegramStartCodes.expiresAt, now),
        isNull(founderTelegramStartCodes.usedAt),
      ),
    )
    .limit(1);
  return row[0]?.userId ?? null;
}

export async function markFounderTelegramStartCodeUsed(code: string): Promise<void> {
  const db = await getDbReady();
  await db
    .update(founderTelegramStartCodes)
    .set({ usedAt: new Date() })
    .where(eq(founderTelegramStartCodes.code, code));
}
