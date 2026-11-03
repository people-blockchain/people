import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PARTNER_REFERRAL_DEPTH,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_WINDOW_MS,
  evaluateReferralAttach,
  listL1L2,
  normalizeKolCode,
  normalizeReferralCode,
  parseReferralCookie,
  referralCodeFromUserId,
  resolveStoredReferralCode,
  resolveStoredReferralCookie,
  serializeReferralCookie,
  withinReferralCookieWindow,
  withinReferralRegistrationWindow,
  type PartnerNode,
} from "./referral.ts";
import { isLoginPath, isPartnerPath, loginRedirectUrl, partnerHomeAfterLogin } from "./guards.ts";

function node(userId: string, parent: string | null = null): PartnerNode {
  return { userId, referralCode: referralCodeFromUserId(userId), referredByUserId: parent };
}

test("referral cookie is first-wins and codes are normalized", () => {
  assert.equal(REFERRAL_COOKIE, "people_partner_ref");
  assert.equal(normalizeReferralCode("AbCdef12"), "abcdef12");
  assert.equal(normalizeReferralCode("bad code"), null);
  assert.equal(normalizeReferralCode("not-an-address"), null);
  assert.equal(resolveStoredReferralCode("already1", "newer000"), "already1");
  assert.equal(resolveStoredReferralCode(undefined, "newer000"), "newer000");
});

test("people_partner_ref cookie serializes setAt timestamp, preserves first-touch for 30d, and measures window from cookie setAt", () => {
  const t0 = 1_762_200_000_000;
  const serialized = serializeReferralCookie("33063C3605", t0);
  assert.equal(serialized, "33063c3605.1762200000");
  // normalizeReferralCode transparently accepts both plain and timestamped cookie values
  assert.equal(normalizeReferralCode(serialized), "33063c3605");

  const parsed = parseReferralCookie(serialized);
  assert.ok(parsed);
  assert.equal(parsed.code, "33063c3605");
  assert.equal(parsed.setAt?.getTime(), t0);

  // First-touch wins within the 30-day window
  const t5d = t0 + 5 * 24 * 60 * 60 * 1000;
  assert.equal(resolveStoredReferralCookie(serialized ?? undefined, "othercode1", t5d), serialized);

  // Window is measured from cookie setAt, even if account was created > 24h earlier
  const accountCreatedAt = new Date(t0);
  const attachAtDay10 = t0 + 10 * 24 * 60 * 60 * 1000;
  assert.equal(withinReferralCookieWindow(parsed.setAt, attachAtDay10), true);
  assert.equal(withinReferralRegistrationWindow(accountCreatedAt, attachAtDay10, parsed.setAt), true);

  // After 30 days, cookie window expires and a new ?ref= can start a fresh window
  const after31d = t0 + REFERRAL_COOKIE_WINDOW_MS + 60_000;
  assert.equal(withinReferralCookieWindow(parsed.setAt, after31d), false);
  assert.equal(
    resolveStoredReferralCookie(serialized ?? undefined, "newercode1", after31d),
    serializeReferralCookie("newercode1", after31d),
  );
});

test("KOL code validation accepts 6-16 lowercase alphanumeric codes matching the unified ?ref= format", () => {
  assert.equal(normalizeKolCode("AliceKol1"), "alicekol1");
  assert.equal(normalizeKolCode("ab"), null);
  assert.equal(normalizeKolCode("bad-hyphen"), null);
});

test("attach binds L1 and L2 and rejects depth 3 and self", () => {
  assert.equal(MAX_PARTNER_REFERRAL_DEPTH, 2);
  const root = node("11111111-1111-4111-8111-111111111111");
  const l1 = node("22222222-2222-4222-8222-222222222222", root.userId);
  const l2 = node("33333333-3333-4333-8333-333333333333", l1.userId);
  const nodes = new Map([root, l1, l2].map((n) => [n.userId, n]));

  const bindL1 = evaluateReferralAttach({
    inviteeUserId: "aaaa",
    inviteeAlreadyHasParent: false,
    referrer: root,
    nodes,
  });
  assert.deepEqual(bindL1, { ok: true, parentUserId: root.userId });

  const bindL2 = evaluateReferralAttach({
    inviteeUserId: "bbbb",
    inviteeAlreadyHasParent: false,
    referrer: l1,
    nodes,
  });
  assert.deepEqual(bindL2, { ok: true, parentUserId: l1.userId });

  const bindL3 = evaluateReferralAttach({
    inviteeUserId: "cccc",
    inviteeAlreadyHasParent: false,
    referrer: l2,
    nodes,
  });
  assert.equal(bindL3.ok, false);
  if (!bindL3.ok) assert.equal(bindL3.reason, "depth_exceeded");

  const self = evaluateReferralAttach({
    inviteeUserId: root.userId,
    inviteeAlreadyHasParent: false,
    referrer: root,
    nodes,
  });
  assert.equal(self.ok, false);

  const already = evaluateReferralAttach({
    inviteeUserId: l1.userId,
    inviteeAlreadyHasParent: true,
    referrer: root,
    nodes,
  });
  assert.equal(already.ok, false);
});

test("attach rejects an attachment that would close a referral cycle", () => {
  const a = node("a");
  const b = node("b", a.userId);
  const nodes = new Map([a, b].map((n) => [n.userId, n]));
  // b already points at a; attaching a under b would make a → b → a.
  const cycle = evaluateReferralAttach({
    inviteeUserId: a.userId,
    inviteeAlreadyHasParent: false,
    referrer: b,
    nodes,
  });
  assert.equal(cycle.ok, false);
  if (!cycle.ok) assert.equal(cycle.reason, "cycle");
});

test("cabinet lists only L1 and L2 of the viewer", () => {
  const a = node("a");
  const b = node("b", "a");
  const c = node("c", "b");
  const stranger = node("z", "y");
  const { l1, l2 } = listL1L2("a", [a, b, c, stranger]);
  assert.deepEqual(
    l1.map((n) => n.userId),
    ["b"],
  );
  assert.deepEqual(
    l2.map((n) => n.userId),
    ["c"],
  );
});

test("auth guards protect /partner and send visitors to /login", () => {
  assert.equal(isPartnerPath("/partner"), true);
  assert.equal(isPartnerPath("/partner/wallet"), true);
  assert.equal(isPartnerPath("/login"), false);
  assert.equal(isLoginPath("/login/check-email"), true);
  assert.equal(loginRedirectUrl("https://www.peopleblockchain.network", "/partner"), "/login?callbackUrl=%2Fpartner");
  assert.equal(partnerHomeAfterLogin("/how-it-works"), "/how-it-works");
  assert.equal(partnerHomeAfterLogin("/partner"), "/partner");
});
