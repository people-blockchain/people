import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUMAN_PASSPORT_PROGRESS_KEY,
  HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS,
  HUMAN_PASSPORT_STEPS,
  classifyHumanPassportResponse,
  clearHumanPassportProgress,
  hasPendingPassportVisit,
  maskAddress,
  passportScoredWallet,
  readHumanPassportProgress,
  resolveHumanPassportStep,
  writeHumanPassportProgress,
} from "../src/lib/founders/human-passport-flow.ts";
import { VERIFICATION_LEVEL_STRONG } from "../src/lib/founders/verification.ts";

const NOW = 1_700_000_000_000;

/** Minimal in-memory Storage; `throwOn` simulates private mode blocking a method. */
function storage({ throwOn } = {}) {
  const map = new Map();
  const guard = (name) => {
    if (throwOn === name) throw new Error("storage blocked");
  };
  return {
    map,
    getItem: (k) => {
      guard("getItem");
      return map.has(k) ? map.get(k) : null;
    },
    setItem: (k, v) => {
      guard("setItem");
      map.set(k, String(v));
    },
    removeItem: (k) => {
      guard("removeItem");
      map.delete(k);
    },
  };
}

test("four steps are declared", () => {
  assert.equal(HUMAN_PASSPORT_STEPS, 4);
});

test("resolveHumanPassportStep: signed out or no founder → step 1", () => {
  assert.equal(resolveHumanPassportStep({ signedIn: false, hasFounder: false, verificationLevel: 0, checking: false }), 1);
  assert.equal(resolveHumanPassportStep({ signedIn: true, hasFounder: false, verificationLevel: 0, checking: false }), 1);
  assert.equal(resolveHumanPassportStep({ signedIn: false, hasFounder: true, verificationLevel: 0, checking: false }), 1);
  // A check cannot be in flight while there is nothing to check.
  assert.equal(resolveHumanPassportStep({ signedIn: false, hasFounder: false, verificationLevel: 0, checking: true }), 1);
});

test("resolveHumanPassportStep: registered founder is at step 2, 3 while checking", () => {
  assert.equal(resolveHumanPassportStep({ signedIn: true, hasFounder: true, verificationLevel: 0, checking: false }), 2);
  assert.equal(resolveHumanPassportStep({ signedIn: true, hasFounder: true, verificationLevel: 1, checking: false }), 2);
  assert.equal(resolveHumanPassportStep({ signedIn: true, hasFounder: true, verificationLevel: 1, checking: true }), 3);
});

test("resolveHumanPassportStep: level 2 is step 4 and outranks everything else", () => {
  assert.equal(resolveHumanPassportStep({ signedIn: true, hasFounder: true, verificationLevel: 2, checking: false }), 4);
  assert.equal(
    resolveHumanPassportStep({ signedIn: true, hasFounder: true, verificationLevel: VERIFICATION_LEVEL_STRONG, checking: true }),
    4,
  );
  // A verified founder must not flash back to step 1 while /me is refreshing.
  assert.equal(resolveHumanPassportStep({ signedIn: false, hasFounder: false, verificationLevel: 2, checking: false }), 4);
});

test("classifyHumanPassportResponse: any 2xx is verified", () => {
  assert.deepEqual(classifyHumanPassportResponse(200, { ok: true, level: 2 }), { kind: "verified" });
  assert.deepEqual(classifyHumanPassportResponse(204, {}), { kind: "verified" });
});

test("classifyHumanPassportResponse: score_too_low carries formatted score, threshold and wallet kind", () => {
  assert.deepEqual(
    classifyHumanPassportResponse(403, { error: "score_too_low", score: 17.25, threshold: 20, walletKind: "passport" }),
    { kind: "too_low", score: "17.3", threshold: "20.0", walletKind: "passport" },
  );
  // Numeric strings are accepted, an unknown wallet kind falls back to the founder wallet.
  assert.deepEqual(
    classifyHumanPassportResponse(403, { error: "score_too_low", score: "5", threshold: "20", walletKind: "primary" }),
    { kind: "too_low", score: "5.0", threshold: "20.0", walletKind: "primary" },
  );
  assert.deepEqual(classifyHumanPassportResponse(403, { error: "score_too_low" }), {
    kind: "too_low",
    score: "?",
    threshold: "?",
    walletKind: "primary",
  });
  assert.deepEqual(classifyHumanPassportResponse(403, { error: "score_too_low", score: "abc", threshold: null }), {
    kind: "too_low",
    score: "?",
    threshold: "?",
    walletKind: "primary",
  });
});

test("classifyHumanPassportResponse: server error codes pass through with the right retryability", () => {
  const cases = [
    ["not_configured", 503, false],
    ["not_registered", 403, false],
    ["invalid_credential", 400, false],
    ["wallet_not_linked", 409, false],
    ["wallet_mismatch", 403, false],
    ["sign_in_required", 401, false],
    ["verification_failed", 422, true],
    ["timeout", 0, true],
    ["network", 0, true],
  ];
  for (const [code, status, retryable] of cases) {
    assert.deepEqual(classifyHumanPassportResponse(status, { error: code }), { kind: "failed", code, retryable }, code);
  }
});

test("classifyHumanPassportResponse: unknown or missing error bodies fall back by status", () => {
  // 401 without a body still names the session problem.
  assert.deepEqual(classifyHumanPassportResponse(401, {}), { kind: "failed", code: "sign_in_required", retryable: false });
  assert.deepEqual(classifyHumanPassportResponse(503, {}), { kind: "failed", code: "not_configured", retryable: false });
  // Anything else is a retryable check failure, never a silent dead end.
  assert.deepEqual(classifyHumanPassportResponse(500, {}), { kind: "failed", code: "verification_failed", retryable: true });
  assert.deepEqual(classifyHumanPassportResponse(403, { error: "surprise" }), {
    kind: "failed",
    code: "verification_failed",
    retryable: true,
  });
  assert.deepEqual(classifyHumanPassportResponse(0, { error: 42 }), {
    kind: "failed",
    code: "verification_failed",
    retryable: true,
  });
});

test("progress round-trips through storage", () => {
  const store = storage();
  writeHumanPassportProgress(store, { step: 3, at: NOW, wallet: "0xabc" });
  assert.deepEqual(readHumanPassportProgress(store, NOW), { step: 3, at: NOW, wallet: "0xabc" });
  assert.ok(store.map.has(HUMAN_PASSPORT_PROGRESS_KEY));
  clearHumanPassportProgress(store);
  assert.equal(readHumanPassportProgress(store, NOW), null);
});

test("progress expires after the max age and ignores future timestamps", () => {
  const store = storage();
  writeHumanPassportProgress(store, { step: 2, at: NOW, wallet: null });
  assert.equal(readHumanPassportProgress(store, NOW + HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS)?.step, 2);
  assert.equal(readHumanPassportProgress(store, NOW + HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS + 1), null);
  assert.equal(readHumanPassportProgress(store, NOW - 1), null);
});

test("progress rejects corrupt JSON and unexpected shapes", () => {
  const store = storage();
  store.map.set(HUMAN_PASSPORT_PROGRESS_KEY, "{not json");
  assert.equal(readHumanPassportProgress(store, NOW), null);

  for (const raw of [
    JSON.stringify({ step: 9, at: NOW }),
    JSON.stringify({ step: 2, at: "yesterday" }),
    JSON.stringify({ at: NOW }),
    JSON.stringify({ step: 2, at: NaN }),
    JSON.stringify("nope"),
    JSON.stringify(null),
  ]) {
    store.map.set(HUMAN_PASSPORT_PROGRESS_KEY, raw);
    assert.equal(readHumanPassportProgress(store, NOW), null, raw);
  }
});

test("blocked storage degrades to no-ops instead of throwing", () => {
  for (const method of ["getItem", "setItem", "removeItem"]) {
    const store = storage({ throwOn: method });
    assert.equal(readHumanPassportProgress(store, NOW), null);
    assert.doesNotThrow(() => writeHumanPassportProgress(store, { step: 2, at: NOW, wallet: null }));
    assert.doesNotThrow(() => clearHumanPassportProgress(store));
  }
});

test("hasPendingPassportVisit is true only for a fresh step 2/3", () => {
  const step2 = { step: 2, at: NOW, wallet: null };
  const step3 = { step: 3, at: NOW, wallet: "0xabc" };
  assert.equal(hasPendingPassportVisit(step2, NOW), true);
  assert.equal(hasPendingPassportVisit(step3, NOW), true);
  assert.equal(hasPendingPassportVisit({ step: 1, at: NOW, wallet: null }, NOW), false);
  assert.equal(hasPendingPassportVisit({ step: 4, at: NOW, wallet: null }, NOW), false);
  assert.equal(hasPendingPassportVisit(null, NOW), false);
  assert.equal(hasPendingPassportVisit(step2, NOW + HUMAN_PASSPORT_PROGRESS_MAX_AGE_MS + 1), false);
});

test("passportScoredWallet: the linked Passport wallet wins, checksummed", () => {
  const passport = "0x2222222222222222222222222222222222222222";
  const primary = "0x1111111111111111111111111111111111111111";
  assert.deepEqual(passportScoredWallet(passport, primary), { kind: "passport", address: passport });
  assert.deepEqual(passportScoredWallet(null, primary), { kind: "primary", address: primary });
  // A set Passport wallet wins even when it repeats the founder wallet — same rule as the server.
  assert.deepEqual(passportScoredWallet(primary, primary), { kind: "passport", address: primary });
  // An unusable Passport wallet falls back to the founder wallet rather than scoring nothing.
  assert.deepEqual(passportScoredWallet("not-an-address", primary), { kind: "primary", address: primary });
  assert.deepEqual(passportScoredWallet("   ", primary), { kind: "primary", address: primary });
});

test("passportScoredWallet: null when neither wallet is usable", () => {
  assert.equal(passportScoredWallet(null, null), null);
  assert.equal(passportScoredWallet(undefined, undefined), null);
  assert.equal(passportScoredWallet("0xnope", "also-nope"), null);
});

test("maskAddress shortens and never mangles short input", () => {
  assert.equal(maskAddress("0x1111111111111111111111111111111111111111"), "0x1111…1111");
  assert.equal(maskAddress(" 0x1111111111111111111111111111111111111111 "), "0x1111…1111");
  assert.equal(maskAddress("0x123"), "0x123");
  assert.equal(maskAddress(""), "");
  assert.equal(maskAddress(null), "");
  assert.equal(maskAddress(undefined), "");
});
