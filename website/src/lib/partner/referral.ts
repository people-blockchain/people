/**
 * Off-chain partner referral graph for the public website.
 * Paid Growth lines remain L1=70 / L2=30 (MAX depth 2). This module does not
 * change protocol economics; it only stores who invited whom at registration.
 */

export const MAX_PARTNER_REFERRAL_DEPTH = 2;
export const REFERRAL_COOKIE = "people_partner_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const REFERRAL_QUERY = "ref";
export const REFERRAL_CODE_RE = /^[a-z0-9]{6,16}$/;

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = raw.trim().toLowerCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
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
 * Depth greater than MAX_PARTNER_REFERRAL_DEPTH is rejected (no L3+).
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
 * Attribution binds only near sign-up ("when you first sign in"). A stale referral cookie
 * must not attach a referrer to an account created long ago.
 */
export const REFERRAL_REGISTRATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinReferralRegistrationWindow(createdAt: Date, now = Date.now()): boolean {
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
