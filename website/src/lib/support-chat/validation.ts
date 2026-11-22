import { timingSafeEqual } from "node:crypto";

export const SUPPORT_MAX_MESSAGE_LEN = 2000;
export const SUPPORT_THREAD_STATUSES = ["open", "escalated", "closed"] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];
export const SUPPORT_SENDER_ROLES = ["user", "bot", "agent"] as const;
export type SupportSenderRole = (typeof SUPPORT_SENDER_ROLES)[number];
export type SupportReplyRole = Exclude<SupportSenderRole, "user">;

export type MessageValidation =
  | { ok: true; text: string }
  | { ok: false; error: "message_required" | "message_too_long" };

/** Trims and checks a chat message: non-empty, at most 2000 characters. */
export function validateSupportMessage(input: unknown): MessageValidation {
  if (typeof input !== "string") return { ok: false, error: "message_required" };
  const text = input.trim();
  if (!text) return { ok: false, error: "message_required" };
  if (text.length > SUPPORT_MAX_MESSAGE_LEN) return { ok: false, error: "message_too_long" };
  return { ok: true, text };
}

export function isSupportThreadStatus(value: unknown): value is SupportThreadStatus {
  return typeof value === "string" && (SUPPORT_THREAD_STATUSES as readonly string[]).includes(value);
}

export type AdminReplyValidation =
  | {
      ok: true;
      threadId: string;
      text: string;
      senderRole: SupportReplyRole;
      senderName: string | null;
      status: SupportThreadStatus | undefined;
    }
  | { ok: false; error: string };

/** Validates the body of POST /api/support/admin. */
export function validateAdminReply(body: unknown): AdminReplyValidation {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const threadId = typeof o.threadId === "string" ? o.threadId.trim() : "";
  if (!threadId) return { ok: false, error: "invalid_thread_id" };
  const message = validateSupportMessage(o.message);
  if (!message.ok) return { ok: false, error: message.error };
  if (o.senderRole !== "bot" && o.senderRole !== "agent") {
    return { ok: false, error: "invalid_sender_role" };
  }
  let status: SupportThreadStatus | undefined;
  if (o.status !== undefined && o.status !== null) {
    if (!isSupportThreadStatus(o.status)) return { ok: false, error: "invalid_status" };
    status = o.status;
  }
  const senderName =
    typeof o.senderName === "string" && o.senderName.trim() ? o.senderName.trim().slice(0, 60) : null;
  return { ok: true, threadId, text: message.text, senderRole: o.senderRole, senderName, status };
}

/** Constant-time comparison of a presented token against the configured one. */
export function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when `Authorization: Bearer <token>` matches SUPPORT_BOT_TOKEN (unset token never matches). */
export function hasValidSupportBotToken(authorization: string | null, expected: string | undefined): boolean {
  const secret = expected?.trim();
  if (!secret || !authorization) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!m) return false;
  return tokensMatch(m[1].trim(), secret);
}
