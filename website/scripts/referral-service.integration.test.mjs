import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";
import * as chainVerifyFixture from "./fixtures/referral-chain-verify-fixture.mjs";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, svc, ref;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  svc = await import("../src/lib/founders/referral-service.ts");
  ref = await import("../src/lib/founders/referral.ts");
});

let seq = 0;
async function mkUser({ invitedBy = null, verified = true, level = 1, bot = false } = {}) {
  seq += 1;
  const id = `u${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  await db.insert(schema.founders).values({
    userId: id,
    founderNumber: seq,
    countryCode: "GE",
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
    verificationLevel: level,
    invitedByUserId: invitedBy,
    isBot: bot,
    verifiedAt: verified ? new Date() : null,
  });
  return id;
}

async function walletAddressOf(userId) {
  const [row] = await db
    .select({ walletAddress: schema.founders.walletAddress })
    .from(schema.founders)
    .where(eq(schema.founders.userId, userId));
  return row.walletAddress;
}

let keySeq = 0;
async function act(userId, action = "swap", at = new Date()) {
  keySeq += 1;
  await db.insert(schema.founderPointsLedger).values({
    userId,
    actionType: action,
    basePoints: 50,
    entryMultiplier: 1,
    awardedPoints: 50,
    dayKey: at.toISOString().slice(0, 10),
    idempotencyKey: `k-${keySeq}-${userId}`,
    createdAt: at,
  });
}

async function credits(userId) {
  return db
    .select()
    .from(schema.founderReferralCredits)
    .where(eq(schema.founderReferralCredits.beneficiaryUserId, userId));
}

test("registration alone (no action) earns the inviter 0", async () => {
  const a = await mkUser();
  const b = await mkUser({ invitedBy: a });
  assert.equal((await svc.evaluateReferralActivation(b)).status, "not_active");
  assert.equal((await credits(a)).length, 0);
});

test("unverified invitee with an action earns 0; like/follow does not count", async () => {
  const a = await mkUser();
  const b = await mkUser({ invitedBy: a, verified: false, level: 2 }); // level bump ≠ real verification
  await act(b);
  assert.equal((await svc.evaluateReferralActivation(b)).status, "not_active");
  const c = await mkUser({ invitedBy: a });
  await act(c, "discover_reaction");
  assert.equal((await svc.evaluateReferralActivation(c)).status, "not_active");
  assert.equal((await credits(a)).length, 0);
});

test("active invitee: L1 100 to inviter, L2 30 to inviter's inviter, idempotent", async () => {
  const top = await mkUser();
  const mid = await mkUser({ invitedBy: top });
  const leaf = await mkUser({ invitedBy: mid });
  await act(leaf);
  const first = await svc.evaluateReferralActivation(leaf);
  assert.deepEqual(first, { status: "activated", points: 100 });
  assert.equal((await svc.evaluateReferralActivation(leaf)).status, "already_active");
  const midCredits = await credits(mid);
  const topCredits = await credits(top);
  assert.deepEqual(midCredits.map((c) => [c.level, c.points]), [[1, 100]]);
  assert.deepEqual(topCredits.map((c) => [c.level, c.points]), [[2, 30]]);
  // The invitee is not charged for L2: mid keeps the full 100.
  const status = await svc.getReferralStatus(mid);
  assert.equal(status.l1Points, 100);
  assert.equal(status.activeCount, 1);
  assert.equal(status.pool.spentPpl, 130);
});

test("inactive vs active listing in status", async () => {
  const a = await mkUser();
  const on = await mkUser({ invitedBy: a });
  await mkUser({ invitedBy: a });
  await act(on);
  await svc.evaluateReferralActivation(on);
  const s = await svc.getReferralStatus(a);
  assert.equal(s.activeCount, 1);
  assert.equal(s.inactiveCount, 1);
});

test("50 active invitees cap; ambassador approval lifts it", async () => {
  const a = await mkUser();
  for (let i = 0; i < 50; i += 1) {
    const inv = await mkUser({ invitedBy: a });
    await act(inv);
    // new UTC day buckets are not simulated: clear today's credits so the daily cap does not interfere
    await db.update(schema.founderReferralCredits).set({ dayKey: `2020-01-${String((i % 28) + 1).padStart(2, "0")}` });
    const r = await svc.evaluateReferralActivation(inv);
    assert.equal(r.status, "activated", `invitee ${i}`);
  }
  const extra = await mkUser({ invitedBy: a });
  await act(extra);
  assert.deepEqual(await svc.evaluateReferralActivation(extra), { status: "capped", reason: "invitee_cap" });
  assert.equal(await svc.setReferralAmbassador(a, 50, "admin"), false, "must exceed 50");
  assert.equal(await svc.setReferralAmbassador(a, 100, "admin"), true);
  assert.equal((await svc.evaluateReferralActivation(extra)).status, "activated");
});

test("daily cap equals the main program cap (1000) and defers the invitee", async () => {
  const a = await mkUser();
  const kids = [];
  for (let i = 0; i < 11; i += 1) {
    const k = await mkUser({ invitedBy: a });
    await act(k);
    kids.push(k);
  }
  const results = [];
  for (const k of kids) results.push((await svc.evaluateReferralActivation(k)).status);
  assert.equal(results.filter((s) => s === "activated").length, 10);
  assert.equal(results.at(-1), "capped");
  assert.equal((await svc.getReferralStatus(a)).todayPoints, 1000);
});

test("season 1 pool exhaustion stops payouts (no minting beyond 6M PPL)", async () => {
  await db
    .insert(schema.founderReferralPool)
    .values({ season: 1, spentPoints: ref.seasonPoolPoints() - 160 })
    .onConflictDoUpdate({
      target: schema.founderReferralPool.season,
      set: { spentPoints: ref.seasonPoolPoints() - 160 },
    });
  const top = await mkUser();
  const mid = await mkUser({ invitedBy: top });
  const k1 = await mkUser({ invitedBy: mid });
  await act(k1);
  assert.deepEqual(await svc.evaluateReferralActivation(k1), { status: "activated", points: 100 }); // + L2 30 to top
  const k2 = await mkUser({ invitedBy: mid });
  await act(k2);
  assert.deepEqual(await svc.evaluateReferralActivation(k2), { status: "activated", points: 30 }, "truncated");
  const k3 = await mkUser({ invitedBy: mid });
  await act(k3);
  assert.deepEqual(await svc.evaluateReferralActivation(k3), { status: "capped", reason: "pool_empty" });
  const [pool] = await db.select().from(schema.founderReferralPool);
  assert.equal(pool.spentPoints, ref.seasonPoolPoints());
  assert.equal((await svc.getReferralStatus(mid)).pool.remainingPpl, 0);
});

test("extra points: 7-day stay only; L2 follows", async () => {
  await db.update(schema.founderReferralPool).set({ spentPoints: 0 });
  const top = await mkUser();
  const mid = await mkUser({ invitedBy: top });
  const leaf = await mkUser({ invitedBy: mid });
  const t0 = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await act(leaf, "swap", t0);
  await svc.evaluateReferralActivation(leaf);
  await db
    .update(schema.founderReferralActivations)
    .set({ activatedAt: t0 })
    .where(eq(schema.founderReferralActivations.inviteeUserId, leaf));
  await db.update(schema.founderReferralCredits).set({ dayKey: "2020-02-01" });
  await act(leaf, "swap"); // a real action now, ≥7 days after activation
  await svc.maybeAwardStaySevenDays(leaf);
  await svc.maybeAwardStaySevenDays(leaf); // idempotent: no second credit for the same kind
  const kinds = (await credits(mid)).map((c) => `${c.kind}:${c.points}`).sort();
  assert.deepEqual(kinds, ["active:100", "stay_7d:10"]);
  const l2 = (await credits(top)).map((c) => `${c.kind}:${c.points}`).sort();
  assert.deepEqual(l2, ["active:30", "stay_7d:3"]);
  const orphan = await mkUser({ invitedBy: mid });
  assert.equal((await svc.awardReferralExtra(orphan, "stay_7d", orphan)).reason, "not_active");
});

test("vesting claims: 10% claimable immediately, rest per week, no double claim", async () => {
  const a = await mkUser();
  const k = await mkUser({ invitedBy: a });
  await act(k);
  await svc.evaluateReferralActivation(k);
  const s = await svc.getReferralStatus(a);
  assert.equal(s.vesting.totalPpl, 100);
  assert.equal(s.vesting.claimablePpl, 10);
  const c1 = await svc.claimReferralVested(a);
  assert.deepEqual(c1, { ok: true, claims: [{ asset: "ppl", amount: "10000000" }] });
  assert.deepEqual(await svc.claimReferralVested(a), { ok: false, error: "nothing_to_claim" });
  const later = new Date(Date.now() + 26 * 7 * 24 * 60 * 60 * 1000 + 60_000);
  const s26 = await svc.getReferralStatus(a, later);
  assert.equal(s26.vesting.vestedPpl, 55);
  assert.equal(s26.vesting.claimablePpl, 45);
  const end = new Date(Date.now() + 53 * 7 * 24 * 60 * 60 * 1000);
  const c2 = await svc.claimReferralVested(a, end);
  assert.deepEqual(c2, { ok: true, claims: [{ asset: "ppl", amount: "90000000" }] });
});

test("bot clawback removes credits, refunds the pool and frees the cap slot", async () => {
  const a = await mkUser();
  const k = await mkUser({ invitedBy: a });
  await act(k);
  const [before] = await db.select().from(schema.founderReferralPool);
  await svc.evaluateReferralActivation(k);
  await svc.clawBackReferralForBot(k);
  const [after] = await db.select().from(schema.founderReferralPool);
  assert.equal(after.spentPoints, before.spentPoints);
  assert.equal((await credits(a)).length, 0);
});

test("issuer option: off by default, opt-in accounting with 2 levels and vesting", async () => {
  const token = "0x" + "ab".repeat(20);
  const issuer = await mkUser();
  const issuerWallet = await walletAddressOf(issuer);
  chainVerifyFixture.allow(token, issuerWallet);
  // default: no row stored
  const off = await svc.registerIssuerReferralProgram({
    tokenAddress: token,
    issuerUserId: issuer,
    issuerWalletAddress: issuerWallet,
    totalSupplyBaseUnits: "1000000",
  });
  assert.deepEqual(off, { ok: true, config: { enabled: false, allocationBps: 0, l1Bps: 0 } });
  assert.equal((await db.select().from(schema.founderIssuerReferralPrograms)).length, 0);
  const noProg = await svc.recordIssuerPurchase({
    tokenAddress: token,
    buyerUserId: issuer,
    purchaseAmount: BigInt(1000),
    purchaseKey: "tx1",
  });
  assert.deepEqual(noProg, { ok: false, error: "no_program" });

  const on = await svc.registerIssuerReferralProgram({
    tokenAddress: token,
    issuerUserId: issuer,
    issuerWalletAddress: issuerWallet,
    totalSupplyBaseUnits: "1000000",
    enabled: true,
  });
  assert.equal(on.ok, true);
  const [prog] = await db.select().from(schema.founderIssuerReferralPrograms);
  assert.equal(prog.allocationAmount, "50000", "5% of supply reserved");

  const top = await mkUser();
  const mid = await mkUser({ invitedBy: top });
  const buyer = await mkUser({ invitedBy: mid });
  const early = await svc.recordIssuerPurchase({
    tokenAddress: token,
    buyerUserId: buyer,
    purchaseAmount: BigInt(1000),
    purchaseKey: "tx0",
  });
  assert.deepEqual(early, { ok: false, error: "buyer_not_active" });
  await act(buyer);
  await svc.evaluateReferralActivation(buyer);
  const ok = await svc.recordIssuerPurchase({
    tokenAddress: token,
    buyerUserId: buyer,
    purchaseAmount: BigInt(10_000),
    purchaseKey: "tx1",
  });
  assert.deepEqual(ok, {
    ok: true,
    credited: [
      { level: 1, amount: "500" },
      { level: 2, amount: "150" },
    ],
  });
  assert.deepEqual(
    await svc.recordIssuerPurchase({ tokenAddress: token, buyerUserId: buyer, purchaseAmount: BigInt(10_000), purchaseKey: "tx1" }),
    { ok: false, error: "duplicate" },
  );
  const s = await svc.getReferralStatus(mid);
  assert.equal(s.issuerAssets[0].total, "500");
  assert.equal(s.issuerAssets[0].claimable, "50", "10% liquid");
});

test("issuer program is a one-time registration per token", async () => {
  const token = "0x" + "cd".repeat(20);
  const issuer = await mkUser();
  const issuerWallet = await walletAddressOf(issuer);
  chainVerifyFixture.allow(token, issuerWallet);
  const args = {
    tokenAddress: token,
    issuerUserId: issuer,
    issuerWalletAddress: issuerWallet,
    totalSupplyBaseUnits: "1000",
    enabled: true,
  };
  assert.equal((await svc.registerIssuerReferralProgram(args)).ok, true);
  assert.deepEqual(await svc.registerIssuerReferralProgram(args), { ok: false, error: "exists" });
});

test("RA-WEB-N1: only the token's on-chain creator may register as issuer", async () => {
  const token = "0x" + "ef".repeat(20);
  const realCreator = await mkUser();
  const realCreatorWallet = await walletAddressOf(realCreator);
  chainVerifyFixture.allow(token, realCreatorWallet);

  const attacker = await mkUser();
  const attackerWallet = await walletAddressOf(attacker);
  assert.notEqual(attackerWallet, realCreatorWallet);

  const hijacked = await svc.registerIssuerReferralProgram({
    tokenAddress: token,
    issuerUserId: attacker,
    issuerWalletAddress: attackerWallet,
    totalSupplyBaseUnits: "1000",
    enabled: true,
  });
  assert.deepEqual(hijacked, { ok: false, error: "not_token_creator" });
  assert.equal(
    (
      await db
        .select()
        .from(schema.founderIssuerReferralPrograms)
        .where(eq(schema.founderIssuerReferralPrograms.tokenAddress, token))
    ).length,
    0,
  );

  const legit = await svc.registerIssuerReferralProgram({
    tokenAddress: token,
    issuerUserId: realCreator,
    issuerWalletAddress: realCreatorWallet,
    totalSupplyBaseUnits: "1000",
    enabled: true,
  });
  assert.equal(legit.ok, true);
});
