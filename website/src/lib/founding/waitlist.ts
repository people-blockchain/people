import { createHash } from "node:crypto";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { founderEmailWaitlist } from "@/db/schema";
import { isMissingTableOrDbError } from "@/lib/founders/telegram-cold-start";
import { telegramColdStartLink } from "./contract";

const EMAIL_MAX_LEN = 254;
const LOCAL_MAX_LEN = 64;
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const memoryWaitlistHashes = new Set<string>();

export function normalizeAndValidateWaitlistEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > EMAIL_MAX_LEN) return null;
  if (/[\r\n\0<>()]/.test(trimmed)) return null;
  const parts = trimmed.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > LOCAL_MAX_LEN || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return null;
  }
  if (!domain || domain.length < 4 || domain.includes("..") || !domain.includes(".")) {
    return null;
  }
  const tld = domain.split(".").pop() ?? "";
  if (tld.length < 2) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

export function hashWaitlistEmail(normalizedEmail: string): string {
  const salt = process.env.FOUNDERS_PHONE_HASH_SALT?.trim() || "founders-waitlist-salt";
  return createHash("sha256").update(`${salt}:waitlist:${normalizedEmail}`).digest("hex");
}

export type SubmitWaitlistInput = {
  email: unknown;
  locale?: string | null;
  path?: string | null;
  ref?: string | null;
  ip?: string | null;
};

export type SubmitWaitlistResult =
  | {
      ok: true;
      status: "registered";
      botUrl: string;
      degraded?: boolean;
    }
  | {
      ok: false;
      error: "invalid_email";
    };

/**
 * Validates, deduplicates, and stores a waitlist email without leaking whether the address
 * already existed in the database. Degrades gracefully if the table is not yet migrated.
 */
export async function submitFoundingWaitlistEmail(
  input: SubmitWaitlistInput,
): Promise<SubmitWaitlistResult> {
  const normalized = normalizeAndValidateWaitlistEmail(input.email);
  if (!normalized) {
    return { ok: false, error: "invalid_email" };
  }

  const emailHash = hashWaitlistEmail(normalized);
  const locale = typeof input.locale === "string" ? input.locale.trim().toLowerCase().slice(0, 8) : null;
  const sourcePath = typeof input.path === "string" ? input.path.trim().slice(0, 256) : null;
  const refCode = typeof input.ref === "string" ? input.ref.trim().slice(0, 32) : null;
  const ipHash =
    typeof input.ip === "string" && input.ip.trim()
      ? createHash("sha256").update(`waitlist-ip:${input.ip.trim()}`).digest("hex").slice(0, 32)
      : null;

  const botUrl = telegramColdStartLink(locale, refCode);
  memoryWaitlistHashes.add(emailHash);

  if (!isDatabaseConfigured()) {
    return { ok: true, status: "registered", botUrl };
  }

  try {
    const db = await getDbReady();
    await db
      .insert(founderEmailWaitlist)
      .values({
        id: crypto.randomUUID(),
        emailHash,
        emailNormalized: normalized,
        locale,
        sourcePath,
        refCode,
        ipHash,
      })
      .onConflictDoUpdate({
        target: founderEmailWaitlist.emailHash,
        set: { updatedAt: new Date() },
      });
    return { ok: true, status: "registered", botUrl };
  } catch (error) {
    if (isMissingTableOrDbError(error)) {
      return { ok: true, status: "registered", botUrl, degraded: true };
    }
    throw error;
  }
}

/** @internal test helper */
export function hasMemoryWaitlistEmailForTests(email: string): boolean {
  const norm = normalizeAndValidateWaitlistEmail(email);
  if (!norm) return false;
  return memoryWaitlistHashes.has(hashWaitlistEmail(norm));
}
