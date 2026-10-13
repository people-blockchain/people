import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyHumanPassportForUser } from "../src/lib/founders/human-passport-verify.ts";
import { VERIFICATION_LEVEL_STRONG } from "../src/lib/founders/verification.ts";

const OWN = "0x1111111111111111111111111111111111111111";
const FOREIGN = "0x2222222222222222222222222222222222222222";
const CONFIG = { apiKey: "test-key", scorerId: "42", minScore: 20 };

/** In-memory `founders` table + Passport API mock (every address scores 50). */
function harness(founders) {
  const db = new Map(Object.entries(founders));
  const fetchCalls = [];
  const deps = {
    readConfig: () => CONFIG,
    loadFounder: async (userId) => {
      const row = db.get(userId);
      return row ? { ...row } : null;
    },
    applyStrongVerification: async (userId) => {
      db.get(userId).verificationLevel = VERIFICATION_LEVEL_STRONG;
    },
    fetch: async (url) => {
      fetchCalls.push(String(url));
      const address = String(url).split("/score/")[1];
      return new Response(
        JSON.stringify({ address, score: "50", passing_score: true, threshold: "20" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  };
  return { db, deps, fetchCalls };
}

test("foreign high-score address → wallet_mismatch, level unchanged, score not requested", async () => {
  const { db, deps, fetchCalls } = harness({ u1: { walletAddress: OWN, verificationLevel: 0 } });
  const result = await verifyHumanPassportForUser("u1", FOREIGN, deps);
  assert.deepEqual(result, { ok: false, error: "wallet_mismatch" });
  assert.equal(db.get("u1").verificationLevel, 0);
  assert.equal(fetchCalls.length, 0);
});

test("own high-score address → ok, level 2, scored address is the linked wallet", async () => {
  const { db, deps, fetchCalls } = harness({ u1: { walletAddress: OWN, verificationLevel: 0 } });
  // Stored lowercase, client sends checksum/uppercase: compared in checksum form.
  const result = await verifyHumanPassportForUser("u1", OWN.toUpperCase().replace("0X", "0x"), deps);
  assert.deepEqual(result, { ok: true });
  assert.equal(db.get("u1").verificationLevel, VERIFICATION_LEVEL_STRONG);
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].toLowerCase().endsWith(`/score/${OWN}`));
});

test("no credential → server uses founders.walletAddress", async () => {
  const { db, deps, fetchCalls } = harness({ u1: { walletAddress: OWN, verificationLevel: 0 } });
  const result = await verifyHumanPassportForUser("u1", undefined, deps);
  assert.deepEqual(result, { ok: true });
  assert.equal(db.get("u1").verificationLevel, VERIFICATION_LEVEL_STRONG);
  assert.ok(fetchCalls[0].toLowerCase().endsWith(`/score/${OWN}`));
});

test("no linked wallet → wallet_not_linked, level unchanged, score not requested", async () => {
  const { db, deps, fetchCalls } = harness({ u1: { walletAddress: null, verificationLevel: 0 } });
  const result = await verifyHumanPassportForUser("u1", FOREIGN, deps);
  assert.deepEqual(result, { ok: false, error: "wallet_not_linked" });
  assert.equal(db.get("u1").verificationLevel, 0);
  assert.equal(fetchCalls.length, 0);
});

test("Passport response for a different address is rejected", async () => {
  const { db, deps } = harness({ u1: { walletAddress: OWN, verificationLevel: 0 } });
  deps.fetch = async () =>
    new Response(JSON.stringify({ address: FOREIGN, score: "50", passing_score: true }), { status: 200 });
  const result = await verifyHumanPassportForUser("u1", undefined, deps);
  assert.deepEqual(result, { ok: false, error: "verification_failed" });
  assert.equal(db.get("u1").verificationLevel, 0);
});

test("unregistered user → not_registered", async () => {
  const { deps } = harness({});
  const result = await verifyHumanPassportForUser("nobody", OWN, deps);
  assert.deepEqual(result, { ok: false, error: "not_registered" });
});
