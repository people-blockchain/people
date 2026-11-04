import assert from "node:assert/strict";
import { before, test } from "node:test";
import { register } from "node:module";
import { eq } from "drizzle-orm";
import { PARTNER_CABINET_EN } from "./cabinet-copy.ts";
import { serializeReferralCookie } from "./referral.ts";

register("../../../scripts/fixtures/referral-db-loader.mjs", import.meta.url);

let db: Awaited<ReturnType<typeof import("../../../scripts/fixtures/referral-pglite-db.mjs")["getDbReady"]>>;
let schema: typeof import("@/db/schema");
let service: typeof import("./service.ts");

before(async () => {
  const pglite = await import("../../../scripts/fixtures/referral-pglite-db.mjs");
  globalThis.__getDb = pglite.getDbReady;
  db = await pglite.getDbReady();
  schema = await import("@/db/schema");
  service = await import("./service.ts");
});

let seq = 0;
async function createUser(emailPrefix = "user"): Promise<string> {
  seq += 1;
  const id = crypto.randomUUID();
  await db.insert(schema.users).values({
    id,
    email: `${emailPrefix}${seq}@example.com`,
  });
  return id;
}

test("PARTNER_CABINET_EN copy is strictly English-only (zero Cyrillic characters)", () => {
  for (const [key, value] of Object.entries(PARTNER_CABINET_EN)) {
    assert.equal(typeof value, "string", key);
    assert.doesNotMatch(value, /[\u0400-\u04FF]/, `Cyrillic found in PARTNER_CABINET_EN.${key}`);
  }
});

test("attachReferralIfEligible attaches from people_partner_ref cookie setAt window even when account was created >24h ago", async () => {
  const inviterId = await createUser("inviter");
  const inviteeId = await createUser("invitee");
  const inviter = await service.ensurePartner(inviterId);
  await service.ensurePartner(inviteeId);

  const t0 = Date.now() - 5 * 24 * 60 * 60 * 1000;
  // Simulate an account created 5 days ago on /buy before visiting /partner
  await db
    .update(schema.partners)
    .set({ createdAt: new Date(t0) })
    .where(eq(schema.partners.userId, inviteeId));

  // Without cookie setAt (legacy untimestamped cookie), >24h account is rejected
  const stalePlain = await service.attachReferralIfEligible(inviteeId, inviter.referralCode);
  assert.deepEqual(stalePlain, { attached: false, reason: "outside_registration_window" });

  // With people_partner_ref cookie carrying setAt within the 30-day window, attach succeeds
  const cookieVal = serializeReferralCookie(inviter.referralCode, t0);
  const attached = await service.attachReferralIfEligible(inviteeId, cookieVal);
  assert.equal(attached.attached, true);
  if (attached.attached) {
    assert.equal(attached.parentUserId, inviterId);
  }
});

test("claimKolCode, depth 2 enforcement, buyer wallet binding, and loadCabinet metrics", async () => {
  const rootId = await createUser("root");
  const l1Id = await createUser("l1");
  const l2Id = await createUser("l2");
  const l3Id = await createUser("l3");

  await service.ensurePartner(rootId);
  const claim = await service.claimKolCode(rootId, "AliceKol1");
  assert.deepEqual(claim, { ok: true, kolCode: "alicekol1" });

  // Attach L1 via custom KOL code in unified ?ref= cookie
  const attachL1 = await service.attachReferralIfEligible(
    l1Id,
    serializeReferralCookie("alicekol1", Date.now()),
  );
  assert.equal(attachL1.attached, true);

  const l1Partner = await service.ensurePartner(l1Id);
  const attachL2 = await service.attachReferralIfEligible(
    l2Id,
    serializeReferralCookie(l1Partner.referralCode, Date.now()),
  );
  assert.equal(attachL2.attached, true);

  // Depth 3 from root is rejected (MAX_PARTNER_REFERRAL_DEPTH = 2)
  const l2Partner = await service.ensurePartner(l2Id);
  const attachL3 = await service.attachReferralIfEligible(
    l3Id,
    serializeReferralCookie(l2Partner.referralCode, Date.now()),
  );
  assert.deepEqual(attachL3, { attached: false, reason: "depth_exceeded" });

  // Bind buyer wallet for L1 and record a confirmed purchase + commission
  const buyerWallet = "0x9999999999999999999999999999999999999999";
  const bound = await service.bindBuyerWalletForReferral({
    buyerWallet,
    userId: l1Id,
  });
  assert.equal(bound.ok, true);

  const purchaseId = "purchase-test-1";
  const now = new Date();
  await db.insert(schema.salePurchases).values({
    id: purchaseId,
    chainId: 8453,
    contractAddress: "0x84388772788b7a383dc2a0bdcd655d15a8279dc8",
    txHash: "0x" + "ab".repeat(32),
    logIndex: 0,
    blockNumber: 100,
    blockHash: "0x" + "cd".repeat(32),
    blockTimestamp: now,
    eventKind: "buy",
    buyerAddress: buyerWallet,
    beneficiaryAddress: buyerWallet,
    tokenAddress: "0x000000000000000000000000000000000000d13c",
    usdMicro: "30000000000", // $30,000 -> unlocks Tier 2 (9% USDC + 3% PPL)
    pplMicro: "3000000000000",
    buyerUserId: l1Id,
    referrerUserId: rootId,
    kolCode: "alicekol1",
    attributionMethod: "buyer_binding",
    status: "confirmed",
  });

  await db.insert(schema.referralCommissionLedgers).values({
    id: "comm-test-1",
    purchaseId,
    beneficiaryUserId: rootId,
    buyerUserId: l1Id,
    buyerAddress: buyerWallet,
    program: "kol",
    level: 1,
    usdcRateBps: 900,
    pplRateBps: 300,
    usdPurchaseMicro: "30000000000",
    pplPurchaseMicro: "3000000000000",
    grossUsdcMicro: "2700000000",
    grossPplMicro: "90000000000",
    clawedBackUsdcMicro: "0",
    clawedBackPplMicro: "0",
    netUsdcMicro: "2700000000",
    netPplMicro: "90000000000",
    usdcSettlementNetwork: "base",
    pplSettlementNetwork: "people_mainnet",
    isPplLocked: false,
    status: "pending",
    holdUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    idempotencyKey: "kol:8453:test:0",
  });

  const cabinet = await service.loadCabinet(rootId);
  assert.equal(cabinet.kolCode, "alicekol1");
  assert.equal(cabinet.metrics.signUps, 1);
  assert.equal(cabinet.metrics.buyers, 1);
  assert.equal(cabinet.metrics.volumeUsdMicro, "30000000000");
  assert.equal(cabinet.metrics.earnedUsdc.pendingMicro, "2700000000");
  assert.equal(cabinet.metrics.earnedPpl.pendingMicro, "90000000000");
  assert.equal(cabinet.tier.currentTier, 2);
  assert.equal(cabinet.tier.usdcRateBps, 900);
  assert.equal(cabinet.l1.length, 1);
  assert.equal(cabinet.l2.length, 1);
});
