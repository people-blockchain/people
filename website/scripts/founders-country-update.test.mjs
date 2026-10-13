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
async function mkFounder(countryCode) {
  seq += 1;
  const id = `u${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  await db.insert(schema.founders).values({
    userId: id,
    founderNumber: seq,
    countryCode,
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
    verificationLevel: 1,
  });
  return id;
}

test("updateFounderCountry only ever touches the caller's own record", async () => {
  const alice = await mkFounder("GE");
  const bob = await mkFounder("GE");

  const result = await svc.updateFounderCountry(alice, "de");
  assert.equal(result.ok, true);
  assert.equal(result.profile.countryCode, "DE");

  const [aliceRow] = await db.select().from(schema.founders).where(eq(schema.founders.userId, alice));
  const [bobRow] = await db.select().from(schema.founders).where(eq(schema.founders.userId, bob));
  assert.equal(aliceRow.countryCode, "DE");
  // Bob's record is untouched: there is no way to pass a target user id through this function.
  assert.equal(bobRow.countryCode, "GE");
});

test("updateFounderCountry rejects an invalid country and leaves the record untouched", async () => {
  const carol = await mkFounder("US");
  const result = await svc.updateFounderCountry(carol, "XX");
  assert.deepEqual(result, { ok: false, error: "invalid_country" });
  const [row] = await db.select().from(schema.founders).where(eq(schema.founders.userId, carol));
  assert.equal(row.countryCode, "US");
});

test("updateFounderCountry refuses a user with no founder record", async () => {
  await db.insert(schema.users).values({ id: "no-founder", email: "no-founder@x.test" });
  const result = await svc.updateFounderCountry("no-founder", "US");
  assert.deepEqual(result, { ok: false, error: "not_registered" });
});

test("the public country breakdown is live: it reflects a country change immediately", async () => {
  const dave = await mkFounder("FR");
  const before = await svc.getFounderPublicStats();
  const frBefore = before.countries.find((c) => c.countryCode === "FR")?.founderCount ?? 0;

  await svc.updateFounderCountry(dave, "JP");

  const after = await svc.getFounderPublicStats();
  const frAfter = after.countries.find((c) => c.countryCode === "FR")?.founderCount ?? 0;
  const jpAfter = after.countries.find((c) => c.countryCode === "JP")?.founderCount ?? 0;
  assert.equal(frAfter, frBefore - 1);
  assert.ok(jpAfter >= 1);

  // Every registered founder is accounted for in the breakdown.
  const totalFromCountries = after.countries.reduce((sum, c) => sum + c.founderCount, 0);
  assert.equal(totalFromCountries, after.verifiedCount);
});
