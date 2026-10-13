import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, svc;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  svc = await import("../src/lib/founders/service.ts");
});

let seq = 0;
async function mkUserWithWallet() {
  seq += 1;
  const id = `reg-u${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  await db.insert(schema.partners).values({
    userId: id,
    referralCode: `code-${id}`,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
  });
  return id;
}

test("registration never inherits the inviter's verification level (M15-2)", async () => {
  const inviterId = await mkUserWithWallet();
  await db.insert(schema.founders).values({
    userId: inviterId,
    founderNumber: 9001,
    countryCode: "GE",
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: `0x${"1".repeat(40)}`,
    verificationLevel: 2,
    verifiedAt: new Date(),
  });

  const inviteeId = await mkUserWithWallet();
  const result = await svc.registerFounder(inviteeId, "GE", {
    deviceId: "d".repeat(20),
    ip: "203.0.113.5",
    invitedByUserId: inviterId,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.profile.verificationLevel, 0);
    // MAX(founderNumber)+1 = 9002, read through the query builder (see registerFounder). The
    // count is asserted, not just "registration succeeded": the raw `execute` this replaced
    // returned no rows on the test driver and threw instead, so `ok` alone would still catch
    // the old bug — the number pins the allocation semantics too.
    assert.equal(result.profile.founderNumber, 9002);
  }
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, inviteeId)).limit(1);
  assert.equal(row[0]?.verificationLevel, 0);
  assert.equal(row[0]?.invitedByUserId, inviterId);
});

test("a founder cannot be registered as their own inviter", async () => {
  const userId = await mkUserWithWallet();
  const result = await svc.registerFounder(userId, "GE", {
    deviceId: "e".repeat(20),
    ip: "203.0.113.6",
    invitedByUserId: userId,
  });
  assert.equal(result.ok, true);
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row[0]?.invitedByUserId, null);
});
