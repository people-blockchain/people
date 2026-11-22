import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDbReady, isDatabaseConfigured } from "@/db";
import {
  founderPhoneRegistry,
  founderTelegramPendingClaims,
  founderTelegramUsers,
  founders,
  telegramBotState,
} from "@/db/schema";
import {
  FOUNDING_TG_CLAIM_PARAM,
  FOUNDING_TG_CLAIM_TOKEN_RE,
} from "@/lib/founding/contract";
import { SITE_URL } from "@/lib/site";
import { hashPhoneNumber } from "./phone-hash";
import type { FounderProfile } from "./service";
import { VERIFICATION_LEVEL_TELEGRAM_PHONE } from "./verification";

export const DEFAULT_CLAIM_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
export const COLD_START_CHAT_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type ColdStartChatSession = {
  locale: string | null;
  ref: string | null;
  expiresAtMs: number;
};

type MemoryPendingClaim = {
  id: string;
  tokenHash: string;
  phoneHash: string;
  telegramUserId: string;
  chatId: string;
  locale: string | null;
  referredByCode: string | null;
  provisionalRefCode: string;
  expiresAt: Date;
  claimedAt: Date | null;
  claimedByUserId: string | null;
  createdAt: Date;
};

const memoryColdStartChats = new Map<string, ColdStartChatSession>();
const memoryClaimsByTokenHash = new Map<string, MemoryPendingClaim>();
const memoryTokenHashByPhone = new Map<string, string>();
const memoryTokenHashByTgUser = new Map<string, string>();

export function isMissingTableOrDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e.code ?? e.cause?.code ?? "";
  const msg = `${e.message ?? ""} ${e.cause?.message ?? ""}`;
  return (
    code === "42P01" ||
    code === "42703" ||
    /relation .* does not exist/i.test(msg) ||
    /undefined_table/i.test(msg) ||
    /DATABASE_URL is not set/i.test(msg)
  );
}

/** SHA-256 hex digest of the raw one-time claim token. Raw token is never stored at rest. */
export function hashTelegramClaimToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

/** Generates a 32-byte base64url token (43 chars) and its SHA-256 hex digest. */
export function generateTelegramClaimToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashTelegramClaimToken(token) };
}

/** Deterministic 10-char lowercase alphanumeric referral code for a pending Telegram claim. */
export function provisionalRefCodeFromPhoneHash(phoneHash: string): string {
  const clean = phoneHash.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `f1k${clean.slice(0, 7).padEnd(7, "0")}`;
}

export function buildPendingClaimUrl(rawToken: string, baseOrigin: string = SITE_URL): string {
  const base = baseOrigin.replace(/\/+$/, "");
  return `${base}/founders?${FOUNDING_TG_CLAIM_PARAM}=${encodeURIComponent(rawToken)}`;
}

export function buildPendingReferralUrl(provisionalRefCode: string, baseOrigin: string = SITE_URL): string {
  const base = baseOrigin.replace(/\/+$/, "");
  return `${base}/founders?ref=${encodeURIComponent(provisionalRefCode)}`;
}

function coldStartChatStateKey(chatId: string): string {
  return `f1000_chat:${chatId}`;
}

export async function setColdStartChatSession(
  chatId: string,
  session: ColdStartChatSession,
): Promise<void> {
  memoryColdStartChats.set(chatId, session);
  if (!isDatabaseConfigured()) return;
  try {
    const db = await getDbReady();
    const key = coldStartChatStateKey(chatId);
    const value = JSON.stringify(session);
    await db
      .insert(telegramBotState)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: telegramBotState.key,
        set: { value, updatedAt: new Date() },
      });
  } catch (error) {
    if (!isMissingTableOrDbError(error)) throw error;
  }
}

export async function getColdStartChatSession(
  chatId: string,
): Promise<ColdStartChatSession | null> {
  if (isDatabaseConfigured()) {
    try {
      const db = await getDbReady();
      const rows = await db
        .select({ value: telegramBotState.value })
        .from(telegramBotState)
        .where(eq(telegramBotState.key, coldStartChatStateKey(chatId)))
        .limit(1);
      if (rows[0]?.value) {
        const parsed = JSON.parse(rows[0].value) as ColdStartChatSession;
        if (parsed && typeof parsed.expiresAtMs === "number") {
          return parsed;
        }
      }
    } catch (error) {
      if (!isMissingTableOrDbError(error)) throw error;
    }
  }
  return memoryColdStartChats.get(chatId) ?? null;
}

export async function clearColdStartChatSession(chatId: string): Promise<void> {
  memoryColdStartChats.delete(chatId);
  if (!isDatabaseConfigured()) return;
  try {
    const db = await getDbReady();
    await db
      .delete(telegramBotState)
      .where(eq(telegramBotState.key, coldStartChatStateKey(chatId)));
  } catch (error) {
    if (!isMissingTableOrDbError(error)) throw error;
  }
}

export type CreatePendingTelegramClaimInput = {
  phoneE164: string;
  telegramUserId: string;
  chatId: string;
  locale?: string | null;
  referredByCode?: string | null;
  ttlMs?: number;
  now?: Date;
};

export type CreatePendingTelegramClaimResult =
  | {
      ok: true;
      token: string;
      tokenHash: string;
      phoneHash: string;
      provisionalRefCode: string;
      claimUrl: string;
      referralUrl: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      error: "invalid_phone" | "phone_taken" | "telegram_taken";
    };

function storeMemoryPendingClaim(
  input: {
    phoneHash: string;
    telegramUserId: string;
    chatId: string;
    locale: string | null;
    referredByCode: string | null;
    provisionalRefCode: string;
    expiresAt: Date;
    now: Date;
  },
): CreatePendingTelegramClaimResult {
  const existingPhoneHashToken = memoryTokenHashByPhone.get(input.phoneHash);
  if (existingPhoneHashToken) {
    const existing = memoryClaimsByTokenHash.get(existingPhoneHashToken);
    if (existing && existing.telegramUserId !== input.telegramUserId) {
      return { ok: false, error: "phone_taken" };
    }
    if (existing && existing.claimedAt) {
      return { ok: false, error: "phone_taken" };
    }
  }
  const existingTgToken = memoryTokenHashByTgUser.get(input.telegramUserId);
  if (existingTgToken) {
    const existing = memoryClaimsByTokenHash.get(existingTgToken);
    if (existing && existing.phoneHash !== input.phoneHash) {
      return { ok: false, error: "telegram_taken" };
    }
    if (existing && existing.claimedAt) {
      return { ok: false, error: "telegram_taken" };
    }
  }

  // Remove old rotated token if same (phoneHash, telegramUserId) re-requests
  if (existingPhoneHashToken) memoryClaimsByTokenHash.delete(existingPhoneHashToken);
  if (existingTgToken) memoryClaimsByTokenHash.delete(existingTgToken);

  const { token, tokenHash } = generateTelegramClaimToken();
  const row: MemoryPendingClaim = {
    id: crypto.randomUUID(),
    tokenHash,
    phoneHash: input.phoneHash,
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    locale: input.locale,
    referredByCode: input.referredByCode,
    provisionalRefCode: input.provisionalRefCode,
    expiresAt: input.expiresAt,
    claimedAt: null,
    claimedByUserId: null,
    createdAt: input.now,
  };
  memoryClaimsByTokenHash.set(tokenHash, row);
  memoryTokenHashByPhone.set(input.phoneHash, tokenHash);
  memoryTokenHashByTgUser.set(input.telegramUserId, tokenHash);

  return {
    ok: true,
    token,
    tokenHash,
    phoneHash: input.phoneHash,
    provisionalRefCode: input.provisionalRefCode,
    claimUrl: buildPendingClaimUrl(token),
    referralUrl: buildPendingReferralUrl(input.provisionalRefCode),
    expiresAt: input.expiresAt,
  };
}

export async function createPendingTelegramClaim(
  input: CreatePendingTelegramClaimInput,
): Promise<CreatePendingTelegramClaimResult> {
  let phoneHash: string;
  try {
    phoneHash = hashPhoneNumber(input.phoneE164);
  } catch {
    return { ok: false, error: "invalid_phone" };
  }

  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_CLAIM_TOKEN_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const provisionalRefCode = provisionalRefCodeFromPhoneHash(phoneHash);
  const locale = input.locale?.trim().toLowerCase() || null;
  const referredByCode = input.referredByCode?.trim() || null;
  const tgUserId = input.telegramUserId.trim();

  if (!isDatabaseConfigured()) {
    return storeMemoryPendingClaim({
      phoneHash,
      telegramUserId: tgUserId,
      chatId: input.chatId,
      locale,
      referredByCode,
      provisionalRefCode,
      expiresAt,
      now,
    });
  }

  try {
    const db = await getDbReady();

    // 1. Check permanent registries first (already bound to a wallet founder)
    const phoneInRegistry = await db
      .select({ userId: founderPhoneRegistry.userId })
      .from(founderPhoneRegistry)
      .where(eq(founderPhoneRegistry.phoneHash, phoneHash))
      .limit(1);
    if (phoneInRegistry[0]) {
      return { ok: false, error: "phone_taken" };
    }

    const tgInRegistry = await db
      .select({ userId: founderTelegramUsers.userId })
      .from(founderTelegramUsers)
      .where(eq(founderTelegramUsers.telegramUserId, tgUserId))
      .limit(1);
    if (tgInRegistry[0]) {
      return { ok: false, error: "telegram_taken" };
    }

    // 2. Check pending claim table for conflicts with another phone or Telegram account
    const existingByPhone = await db
      .select()
      .from(founderTelegramPendingClaims)
      .where(eq(founderTelegramPendingClaims.phoneHash, phoneHash))
      .limit(1);
    if (existingByPhone[0]) {
      if (existingByPhone[0].claimedAt || existingByPhone[0].telegramUserId !== tgUserId) {
        return { ok: false, error: "phone_taken" };
      }
    }

    const existingByTg = await db
      .select()
      .from(founderTelegramPendingClaims)
      .where(eq(founderTelegramPendingClaims.telegramUserId, tgUserId))
      .limit(1);
    if (existingByTg[0]) {
      if (existingByTg[0].claimedAt || existingByTg[0].phoneHash !== phoneHash) {
        return { ok: false, error: "telegram_taken" };
      }
    }

    const { token, tokenHash } = generateTelegramClaimToken();

    if (existingByPhone[0]) {
      // Same human re-requesting a fresh claim token before binding a wallet
      await db
        .update(founderTelegramPendingClaims)
        .set({
          tokenHash,
          chatId: input.chatId,
          locale,
          referredByCode: referredByCode ?? existingByPhone[0].referredByCode,
          expiresAt,
        })
        .where(eq(founderTelegramPendingClaims.id, existingByPhone[0].id));
    } else {
      await db.insert(founderTelegramPendingClaims).values({
        id: crypto.randomUUID(),
        tokenHash,
        phoneHash,
        telegramUserId: tgUserId,
        chatId: input.chatId,
        locale,
        referredByCode,
        provisionalRefCode,
        expiresAt,
      });
    }

    return {
      ok: true,
      token,
      tokenHash,
      phoneHash,
      provisionalRefCode,
      claimUrl: buildPendingClaimUrl(token),
      referralUrl: buildPendingReferralUrl(provisionalRefCode),
      expiresAt,
    };
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      return storeMemoryPendingClaim({
        phoneHash,
        telegramUserId: tgUserId,
        chatId: input.chatId,
        locale,
        referredByCode,
        provisionalRefCode,
        expiresAt,
        now,
      });
    }
    throw error;
  }
}

export type InspectPendingClaimResult =
  | {
      ok: true;
      status: "pending";
      provisionalRefCode: string;
      referralUrl: string;
      expiresAt: string;
    }
  | {
      ok: false;
      error: "invalid_token" | "expired_token" | "already_claimed";
    };

export async function inspectPendingTelegramClaim(
  rawToken: string,
  now: Date = new Date(),
): Promise<InspectPendingClaimResult> {
  const token = rawToken.trim();
  if (!FOUNDING_TG_CLAIM_TOKEN_RE.test(token)) {
    return { ok: false, error: "invalid_token" };
  }
  const tokenHash = hashTelegramClaimToken(token);

  const checkRow = (row: {
    provisionalRefCode: string;
    expiresAt: Date;
    claimedAt: Date | null;
  }): InspectPendingClaimResult => {
    if (row.claimedAt) return { ok: false, error: "already_claimed" };
    if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "expired_token" };
    return {
      ok: true,
      status: "pending",
      provisionalRefCode: row.provisionalRefCode,
      referralUrl: buildPendingReferralUrl(row.provisionalRefCode),
      expiresAt: row.expiresAt.toISOString(),
    };
  };

  if (isDatabaseConfigured()) {
    try {
      const db = await getDbReady();
      const rows = await db
        .select()
        .from(founderTelegramPendingClaims)
        .where(eq(founderTelegramPendingClaims.tokenHash, tokenHash))
        .limit(1);
      if (rows[0]) return checkRow(rows[0]);
    } catch (error) {
      if (!isMissingTableOrDbError(error)) throw error;
    }
  }

  const mem = memoryClaimsByTokenHash.get(tokenHash);
  if (!mem) return { ok: false, error: "invalid_token" };
  return checkRow(mem);
}

export type RedeemPendingTelegramClaimInput = {
  token: string;
  userId: string;
  countryCode?: string;
  deviceId?: string;
  ip?: string;
  now?: Date;
};

export type RedeemPendingTelegramClaimResult =
  | {
      ok: true;
      status: "sealed";
      verificationLevel: number;
      provisionalRefCode: string;
      founder: FounderProfile | null;
    }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "expired_token"
        | "already_claimed"
        | "phone_taken"
        | "telegram_taken"
        | "unavailable";
    };

export async function redeemPendingTelegramClaim(
  input: RedeemPendingTelegramClaimInput,
): Promise<RedeemPendingTelegramClaimResult> {
  const token = input.token.trim();
  if (!FOUNDING_TG_CLAIM_TOKEN_RE.test(token)) {
    return { ok: false, error: "invalid_token" };
  }
  const tokenHash = hashTelegramClaimToken(token);
  const now = input.now ?? new Date();

  if (!isDatabaseConfigured()) {
    const mem = memoryClaimsByTokenHash.get(tokenHash);
    if (!mem) return { ok: false, error: "invalid_token" };
    if (mem.claimedAt) return { ok: false, error: "already_claimed" };
    if (mem.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "expired_token" };
    mem.claimedAt = now;
    mem.claimedByUserId = input.userId;
    return {
      ok: true,
      status: "sealed",
      verificationLevel: VERIFICATION_LEVEL_TELEGRAM_PHONE,
      provisionalRefCode: mem.provisionalRefCode,
      founder: null,
    };
  }

  try {
    const { getFounderByUserId, registerFounder } = await import("./service");
    const db = await getDbReady();
    const rows = await db
      .select()
      .from(founderTelegramPendingClaims)
      .where(eq(founderTelegramPendingClaims.tokenHash, tokenHash))
      .limit(1);
    const pending = rows[0];
    if (!pending) {
      const mem = memoryClaimsByTokenHash.get(tokenHash);
      if (!mem) return { ok: false, error: "invalid_token" };
      if (mem.claimedAt) return { ok: false, error: "already_claimed" };
      if (mem.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "expired_token" };
      mem.claimedAt = now;
      mem.claimedByUserId = input.userId;
      return {
        ok: true,
        status: "sealed",
        verificationLevel: VERIFICATION_LEVEL_TELEGRAM_PHONE,
        provisionalRefCode: mem.provisionalRefCode,
        founder: await getFounderByUserId(input.userId).catch(() => null),
      };
    }

    if (pending.claimedAt) {
      return { ok: false, error: "already_claimed" };
    }
    if (pending.expiresAt.getTime() <= now.getTime()) {
      return { ok: false, error: "expired_token" };
    }

    // Ensure the signed-in user has a founder row (auto-register if needed and eligible)
    let founder = await getFounderByUserId(input.userId);
    if (!founder) {
      const reg = await registerFounder(input.userId, input.countryCode || "GE", {
        deviceId: input.deviceId || "founding1000-tg-claim-device",
        ip: input.ip || "",
      });
      if (reg.ok) {
        founder = reg.profile;
      }
    }

    const txResult = await db.transaction(async (tx) => {
      // Re-read pending claim inside transaction to guarantee single use
      const fresh = await tx
        .select()
        .from(founderTelegramPendingClaims)
        .where(eq(founderTelegramPendingClaims.id, pending.id))
        .limit(1);
      if (!fresh[0] || fresh[0].claimedAt) {
        return { ok: false as const, error: "already_claimed" as const };
      }
      if (fresh[0].expiresAt.getTime() <= now.getTime()) {
        return { ok: false as const, error: "expired_token" as const };
      }

      // Enforce 1 phone = 1 human in founderPhoneRegistry
      const phoneClaim = await tx
        .insert(founderPhoneRegistry)
        .values({ phoneHash: pending.phoneHash, userId: input.userId })
        .onConflictDoNothing()
        .returning({ userId: founderPhoneRegistry.userId });
      if (phoneClaim.length === 0) {
        const owner = await tx
          .select({ userId: founderPhoneRegistry.userId })
          .from(founderPhoneRegistry)
          .where(eq(founderPhoneRegistry.phoneHash, pending.phoneHash))
          .limit(1);
        if (owner[0] && owner[0].userId !== input.userId) {
          return { ok: false as const, error: "phone_taken" as const };
        }
      }

      // Enforce 1 Telegram account = 1 human in founderTelegramUsers
      const tgClaim = await tx
        .insert(founderTelegramUsers)
        .values({ telegramUserId: pending.telegramUserId, userId: input.userId })
        .onConflictDoNothing()
        .returning({ userId: founderTelegramUsers.userId });
      if (tgClaim.length === 0) {
        const owner = await tx
          .select({ userId: founderTelegramUsers.userId })
          .from(founderTelegramUsers)
          .where(eq(founderTelegramUsers.telegramUserId, pending.telegramUserId))
          .limit(1);
        if (owner[0] && owner[0].userId !== input.userId) {
          return { ok: false as const, error: "telegram_taken" as const };
        }
      }

      // Consume the single-use pending claim
      await tx
        .update(founderTelegramPendingClaims)
        .set({ claimedAt: now, claimedByUserId: input.userId })
        .where(eq(founderTelegramPendingClaims.id, pending.id));

      // Upgrade founder record to at least level 1 (Telegram phone verified)
      const currentFounder = await tx
        .select({ verificationLevel: founders.verificationLevel })
        .from(founders)
        .where(eq(founders.userId, input.userId))
        .limit(1);
      const nextLevel = Math.max(
        currentFounder[0]?.verificationLevel ?? 0,
        VERIFICATION_LEVEL_TELEGRAM_PHONE,
      );
      await tx
        .update(founders)
        .set({
          verificationLevel: nextLevel,
          phoneHash: pending.phoneHash,
          verifiedAt: now,
        })
        .where(eq(founders.userId, input.userId));

      return { ok: true as const, verificationLevel: nextLevel };
    });

    if (!txResult.ok) {
      return txResult;
    }

    const updatedFounder = await getFounderByUserId(input.userId);
    return {
      ok: true,
      status: "sealed",
      verificationLevel: txResult.verificationLevel,
      provisionalRefCode: pending.provisionalRefCode,
      founder: updatedFounder ?? founder,
    };
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      const mem = memoryClaimsByTokenHash.get(tokenHash);
      if (!mem) return { ok: false, error: "invalid_token" };
      if (mem.claimedAt) return { ok: false, error: "already_claimed" };
      if (mem.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "expired_token" };
      mem.claimedAt = now;
      mem.claimedByUserId = input.userId;
      return {
        ok: true,
        status: "sealed",
        verificationLevel: VERIFICATION_LEVEL_TELEGRAM_PHONE,
        provisionalRefCode: mem.provisionalRefCode,
        founder: null,
      };
    }
    throw error;
  }
}

/** @internal test helper to reset in-memory state between unit tests */
export function resetTelegramColdStartMemoryForTests(): void {
  memoryColdStartChats.clear();
  memoryClaimsByTokenHash.clear();
  memoryTokenHashByPhone.clear();
  memoryTokenHashByTgUser.clear();
}
