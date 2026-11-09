/**
 * Off-chain partner referral graph for the public website.
 * Paid Growth lines remain L1=70 / L2=30 (MAX depth 2). This module does not
 * change protocol economics; it only stores who invited whom at registration.
 */

export const MAX_PARTNER_REFERRAL_DEPTH = 2;
export const REFERRAL_COOKIE = "people_partner_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const REFERRAL_COOKIE_WINDOW_MS = REFERRAL_COOKIE_MAX_AGE * 1000;
export const REFERRAL_QUERY = "ref";
export const REFERRAL_CODE_RE = /^[a-z0-9]{6,16}$/;
export const KOL_CODE_RE = REFERRAL_CODE_RE;

export type ParsedReferralCookie = {
  code: string;
  setAt: Date | null;
};

/**
 * Normalizes a referral or KOL code (`6–16` lowercase alphanumeric characters).
 * Also accepts a timestamped `people_partner_ref` cookie value (`"<code>.<setAtEpochSeconds>"`)
 * and returns the normalized code portion so all callers work seamlessly.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const dotIdx = trimmed.indexOf(".");
  const codePart = dotIdx === -1 ? trimmed : trimmed.slice(0, dotIdx);
  if (dotIdx !== -1) {
    const tsPart = trimmed.slice(dotIdx + 1);
    if (!/^\d{9,13}$/.test(tsPart)) return null;
  }
  return REFERRAL_CODE_RE.test(codePart) ? codePart : null;
}

export function normalizeKolCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase();
  return KOL_CODE_RE.test(code) ? code : null;
}

/**
 * Serializes a referral code with its landing timestamp (`<code>.<setAtEpochSeconds>`)
 * for the `people_partner_ref` cookie so the 30-day attach window is measured from
 * when the cookie was set rather than when the account row was created.
 */
export function serializeReferralCookie(code: string, setAtMs = Date.now()): string | null {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const sec = Math.max(1, Math.floor(setAtMs / 1000));
  return `${normalized}.${sec}`;
}

/**
 * Parses a `people_partner_ref` cookie value (`"abcdef12"` or `"abcdef12.1762200000"`).
 */
export function parseReferralCookie(raw: string | null | undefined): ParsedReferralCookie | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx === -1) {
    return REFERRAL_CODE_RE.test(trimmed) ? { code: trimmed, setAt: null } : null;
  }
  const code = trimmed.slice(0, dotIdx);
  const tsPart = trimmed.slice(dotIdx + 1);
  if (!REFERRAL_CODE_RE.test(code) || !/^\d{9,13}$/.test(tsPart)) {
    return null;
  }
  const num = Number(tsPart);
  const ms = tsPart.length <= 10 ? num * 1000 : num;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return { code, setAt: new Date(ms) };
}

/** First-wins: an existing cookie is never overwritten. */
export function resolveStoredReferralCode(
  existingCookie: string | undefined,
  queryValue: string | null | undefined,
): string | null {
  const fromCookie = normalizeReferralCode(existingCookie);
  if (fromCookie) return fromCookie;
  return normalizeReferralCode(queryValue);
}

/**
 * First-wins cookie value resolver that preserves or stamps the landing timestamp (`setAt`)
 * in `people_partner_ref` (`"<code>.<setAtEpochSeconds>"`). If an existing cookie is expired
 * (> 30 days old), a fresh `queryValue` may start a new 30-day window.
 */
export function resolveStoredReferralCookie(
  existingCookie: string | undefined,
  queryValue: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  const parsedExisting = parseReferralCookie(existingCookie);
  if (parsedExisting) {
    if (!parsedExisting.setAt) {
      return serializeReferralCookie(parsedExisting.code, nowMs);
    }
    if (withinReferralCookieWindow(parsedExisting.setAt, nowMs)) {
      return serializeReferralCookie(parsedExisting.code, parsedExisting.setAt.getTime());
    }
  }
  const fromQuery = normalizeReferralCode(queryValue);
  if (!fromQuery) return null;
  return serializeReferralCookie(fromQuery, nowMs);
}

export function referralCodeFromUserId(userId: string): string {
  const compact = userId.replace(/-/g, "").toLowerCase();
  return compact.slice(0, 10).padEnd(8, "0");
}

export type PartnerNode = {
  userId: string;
  referralCode: string;
  referredByUserId: string | null;
};

/**
 * Depth of `userId` in the parent chain. Root (no parent) = 0.
 * A new partner attaching to a parent at depth D becomes depth D+1.
 * Depth greater than MAX_PARTNER_REFERRAL_DEPTH (2) is rejected (no L3+).
 */
export function derivedDepth(nodes: Map<string, PartnerNode>, userId: string): number {
  const seen = new Set<string>();
  let depth = 0;
  let current: string | null = userId;
  while (current) {
    if (seen.has(current)) return Number.POSITIVE_INFINITY;
    seen.add(current);
    const node = nodes.get(current);
    if (!node?.referredByUserId) break;
    depth += 1;
    current = node.referredByUserId;
    if (depth > MAX_PARTNER_REFERRAL_DEPTH + 2) return Number.POSITIVE_INFINITY;
  }
  return depth;
}

/**
 * True when `userId` appears in `startUserId`'s parent chain (i.e. `userId` is an ancestor
 * of `startUserId`). Used to reject referral attachments that would create a cycle.
 */
export function isAncestorOf(
  nodes: Map<string, PartnerNode>,
  startUserId: string,
  userId: string,
): boolean {
  const seen = new Set<string>();
  let current = nodes.get(startUserId)?.referredByUserId ?? null;
  while (current) {
    if (current === userId) return true;
    if (seen.has(current)) return false; // already-cyclic chain: stop walking
    seen.add(current);
    current = nodes.get(current)?.referredByUserId ?? null;
  }
  return false;
}

/**
 * Fallback registration window (24h from `partner.createdAt`) when a cookie does not
 * carry a landing timestamp (`setAt`). When `cookieSetAt` is known, the 30-day cookie
 * window (`withinReferralCookieWindow`) is used instead.
 */
export const REFERRAL_REGISTRATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinReferralCookieWindow(
  cookieSetAt: Date | number | null | undefined,
  now = Date.now(),
): boolean {
  if (cookieSetAt === null || cookieSetAt === undefined) return false;
  const setAtMs = cookieSetAt instanceof Date ? cookieSetAt.getTime() : Number(cookieSetAt);
  if (!Number.isFinite(setAtMs) || setAtMs <= 0) return false;
  return now - setAtMs >= 0 && now - setAtMs <= REFERRAL_COOKIE_WINDOW_MS;
}

export function withinReferralRegistrationWindow(
  createdAt: Date,
  now = Date.now(),
  cookieSetAt?: Date | number | null,
): boolean {
  if (cookieSetAt !== undefined && cookieSetAt !== null) {
    return withinReferralCookieWindow(cookieSetAt, now);
  }
  const created = createdAt.getTime();
  if (!Number.isFinite(created)) return false;
  return now - created >= 0 && now - created <= REFERRAL_REGISTRATION_WINDOW_MS;
}

export type AttachReferralInput = {
  inviteeUserId: string;
  inviteeAlreadyHasParent: boolean;
  referrer: PartnerNode | null;
  nodes: Map<string, PartnerNode>;
};

export type AttachReferralResult =
  | { ok: true; parentUserId: string }
  | {
      ok: false;
      reason:
        | "missing_referrer"
        | "self"
        | "already_bound"
        | "depth_exceeded"
        | "cycle";
    };

export function evaluateReferralAttach(input: AttachReferralInput): AttachReferralResult {
  if (input.inviteeAlreadyHasParent) {
    return { ok: false, reason: "already_bound" };
  }
  if (!input.referrer) {
    return { ok: false, reason: "missing_referrer" };
  }
  if (input.referrer.userId === input.inviteeUserId) {
    return { ok: false, reason: "self" };
  }
  // Attaching would point the invitee at a descendant of theirs, closing a loop.
  if (isAncestorOf(input.nodes, input.referrer.userId, input.inviteeUserId)) {
    return { ok: false, reason: "cycle" };
  }
  const parentDepth = derivedDepth(input.nodes, input.referrer.userId);
  if (!Number.isFinite(parentDepth)) {
    return { ok: false, reason: "cycle" };
  }
  if (parentDepth + 1 > MAX_PARTNER_REFERRAL_DEPTH) {
    return { ok: false, reason: "depth_exceeded" };
  }
  return { ok: true, parentUserId: input.referrer.userId };
}

export function listL1L2(
  viewerUserId: string,
  nodes: PartnerNode[],
): { l1: PartnerNode[]; l2: PartnerNode[] } {
  const l1 = nodes.filter((n) => n.referredByUserId === viewerUserId);
  const l1Ids = new Set(l1.map((n) => n.userId));
  const l2 = nodes.filter((n) => n.referredByUserId && l1Ids.has(n.referredByUserId));
  return { l1, l2 };
}

export function partnerSharePath(code: string): string {
  return `/?ref=${encodeURIComponent(code)}`;
}
