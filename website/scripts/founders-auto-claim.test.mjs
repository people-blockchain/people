import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAutoClaim, isIdempotentClaimSuccess } from "../src/lib/founders/auto-claim.ts";
import { detectCountryFromHints, regionFromLocaleTag } from "../src/lib/founders/country-detect.ts";

const base = {
  signedIn: true,
  verifiedHuman: true,
  hasFounder: false,
  countryReady: true,
  attempted: false,
  failed: false,
};

test("logged-in visitor without a number claims once", () => {
  // First observation: fire the claim.
  assert.equal(decideAutoClaim(base), "claim");
  // The same visitor observed again (the effect re-runs): do not fire a second time.
  assert.equal(decideAutoClaim({ ...base, attempted: true }), "done");
});

test("an existing founder is never claimed again", () => {
  assert.equal(decideAutoClaim({ ...base, hasFounder: true }), "done");
  // Even mid-flight / after an error, an existing number wins.
  assert.equal(decideAutoClaim({ ...base, hasFounder: true, attempted: true, failed: true }), "done");
});

test("a failed claim surfaces as an error state", () => {
  assert.equal(decideAutoClaim({ ...base, attempted: true, failed: true }), "error");
  // Retry clears the failure and claims again.
  assert.equal(decideAutoClaim({ ...base, attempted: false, failed: false }), "claim");
});

test("signed-out and not-ready sessions never claim", () => {
  assert.equal(decideAutoClaim({ ...base, signedIn: false }), "idle");
  assert.equal(decideAutoClaim({ ...base, verifiedHuman: false }), "waiting");
  assert.equal(decideAutoClaim({ ...base, countryReady: false }), "waiting");
});

test("already_registered is an idempotent success, other codes are not", () => {
  assert.equal(isIdempotentClaimSuccess("already_registered"), true);
  assert.equal(isIdempotentClaimSuccess("cap_reached"), false);
  assert.equal(isIdempotentClaimSuccess("poh_required"), false);
  assert.equal(isIdempotentClaimSuccess(null), false);
});

test("country detection prefers the locale region, then the timezone", () => {
  assert.equal(regionFromLocaleTag("pt-BR"), "BR");
  assert.equal(regionFromLocaleTag("zh-Hans-CN"), "CN");
  assert.equal(regionFromLocaleTag("en"), null);

  assert.equal(detectCountryFromHints({ languages: ["ru-RU"], timeZone: "Europe/Berlin" }), "RU");
  assert.equal(detectCountryFromHints({ languages: ["en"], timeZone: "Asia/Tbilisi" }), "GE");
  // Unknown hints fall back to the existing default.
  assert.equal(detectCountryFromHints({ languages: ["en"], timeZone: null }), "GE");
  assert.equal(detectCountryFromHints({ languages: [], timeZone: null, fallback: "US" }), "US");
});
