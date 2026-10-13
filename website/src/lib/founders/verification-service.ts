import { eq } from "drizzle-orm";
import { getDbReady } from "@/db";
import { founderPhoneRegistry, founderTelegramUsers, founders } from "@/db/schema";
import { hashPhoneNumber } from "./phone-hash.ts";
import {
  VERIFICATION_LEVEL_STRONG,
  VERIFICATION_LEVEL_TELEGRAM_PHONE,
  type FounderVerificationLevel,
} from "./verification.ts";
import { readFoundersHumanPassportConfig } from "./human-passport-config.ts";
import { readFoundersWorldIdConfig } from "./world-id-config.ts";

export type TelegramPhoneVerificationError =
  | "phone_taken"
  | "telegram_taken"
  | "invalid_phone"
  | "already_verified";

export async function applyTelegramPhoneVerification(
  userId: string,
  phoneE164: string,
  telegramUserId: string,
): Promise<{ ok: true } | { ok: false; error: TelegramPhoneVerificationError }> {
  const db = await getDbReady();
  const existingFounder = await db
    .select({ verificationLevel: founders.verificationLevel })
    .from(founders)
    .where(eq(founders.userId, userId))
    .limit(1);
  if (
    existingFounder[0] &&
    existingFounder[0].verificationLevel >= VERIFICATION_LEVEL_TELEGRAM_PHONE
  ) {
    return { ok: false, error: "already_verified" };
  }

  let phoneHash: string;
  try {
    phoneHash = hashPhoneNumber(phoneE164);
  } catch {
    return { ok: false, error: "invalid_phone" };
  }

  const phoneTaken = await db
    .select({ userId: founderPhoneRegistry.userId })
    .from(founderPhoneRegistry)
    .where(eq(founderPhoneRegistry.phoneHash, phoneHash))
    .limit(1);
  if (phoneTaken[0] && phoneTaken[0].userId !== userId) {
    return { ok: false, error: "phone_taken" };
  }

  const tgTaken = await db
    .select({ userId: founderTelegramUsers.userId })
    .from(founderTelegramUsers)
    .where(eq(founderTelegramUsers.telegramUserId, telegramUserId))
    .limit(1);
  if (tgTaken[0] && tgTaken[0].userId !== userId) {
    return { ok: false, error: "telegram_taken" };
  }

  // The registry rows are the uniqueness gate, so the level upgrade only happens in the
  // transaction that actually won both inserts. A parallel submission of the same phone or
  // Telegram account blocks on the unique key, sees an empty insert, and is rejected — the
  // read-then-check above is only a fast path and cannot be relied on by itself.
  return db.transaction(async (tx) => {
    const phoneClaim = await tx
      .insert(founderPhoneRegistry)
      .values({ phoneHash, userId })
      .onConflictDoNothing()
      .returning({ userId: founderPhoneRegistry.userId });
    if (phoneClaim.length === 0) {
      const owner = await tx
        .select({ userId: founderPhoneRegistry.userId })
        .from(founderPhoneRegistry)
        .where(eq(founderPhoneRegistry.phoneHash, phoneHash))
        .limit(1);
      if (owner[0] && owner[0].userId !== userId) {
        return { ok: false as const, error: "phone_taken" as const };
      }
    }

    const tgClaim = await tx
      .insert(founderTelegramUsers)
      .values({ telegramUserId, userId })
      .onConflictDoNothing()
      .returning({ userId: founderTelegramUsers.userId });
    if (tgClaim.length === 0) {
      const owner = await tx
        .select({ userId: founderTelegramUsers.userId })
        .from(founderTelegramUsers)
        .where(eq(founderTelegramUsers.telegramUserId, telegramUserId))
        .limit(1);
      if (owner[0] && owner[0].userId !== userId) {
        return { ok: false as const, error: "telegram_taken" as const };
      }
    }

    await tx
      .update(founders)
      .set({
        verificationLevel: VERIFICATION_LEVEL_TELEGRAM_PHONE,
        phoneHash,
        verifiedAt: new Date(),
      })
      .where(eq(founders.userId, userId));
    return { ok: true as const };
  });
}

export async function applyStrongVerification(userId: string): Promise<void> {
  const db = await getDbReady();
  await db
    .update(founders)
    .set({ verificationLevel: VERIFICATION_LEVEL_STRONG, verifiedAt: new Date() })
    .where(eq(founders.userId, userId));
}

export async function getFounderVerificationLevel(userId: string): Promise<FounderVerificationLevel> {
  const db = await getDbReady();
  const row = await db.select().from(founders).where(eq(founders.userId, userId)).limit(1);
  return (row[0]?.verificationLevel ?? 0) as FounderVerificationLevel;
}

/** World ID 4.0 (app id, rp id, signing key). */
export function worldIdConfigured(): boolean {
  return readFoundersWorldIdConfig() !== null;
}

export function humanPassportConfigured(): boolean {
  return readFoundersHumanPassportConfig() !== null;
}
