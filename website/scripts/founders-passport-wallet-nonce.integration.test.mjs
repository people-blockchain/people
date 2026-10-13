import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, nonceLib, svc;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  nonceLib = await import("../src/lib/founders/passport-wallet-nonce.ts");
  svc = await import("../src/lib/founders/service.ts");
});

let seq = 0;
async function mkFounder(walletAddress) {
  seq += 1;
  const id = `pw-u${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  await db.insert(schema.founders).values({
    userId: id,
    founderNumber: seq,
    countryCode: "US",
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: walletAddress ?? `0x${seq.toString(16).padStart(40, "0")}`,
    verificationLevel: 0,
  });
  return id;
}

test("a nonce can be consumed exactly once by its owner", async () => {
  const alice = await mkFounder();
  const { nonce } = await nonceLib.createFounderPassportNonce(alice);

  const first = await nonceLib.consumeFounderPassportNonce(nonce, alice);
  assert.equal(first.ok, true);

  const second = await nonceLib.consumeFounderPassportNonce(nonce, alice);
  assert.deepEqual(second, { ok: false });
});

test("a nonce cannot be consumed by a different user than it was issued to", async () => {
  const alice = await mkFounder();
  const bob = await mkFounder();
  const { nonce } = await nonceLib.createFounderPassportNonce(alice);

  const stolen = await nonceLib.consumeFounderPassportNonce(nonce, bob);
  assert.deepEqual(stolen, { ok: false });

  // Still usable by its real owner afterwards.
  const real = await nonceLib.consumeFounderPassportNonce(nonce, alice);
  assert.equal(real.ok, true);
});

test("an expired nonce is rejected", async () => {
  const alice = await mkFounder();
  const { nonce } = await nonceLib.createFounderPassportNonce(alice);
  // Backdate the expiry as if the 10-minute window had already passed.
  await db
    .update(schema.founderPassportNonces)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(schema.founderPassportNonces.code, nonce));

  const result = await nonceLib.consumeFounderPassportNonce(nonce, alice);
  assert.deepEqual(result, { ok: false });
});

test("an unknown nonce is rejected", async () => {
  const alice = await mkFounder();
  const result = await nonceLib.consumeFounderPassportNonce("never-issued", alice);
  assert.deepEqual(result, { ok: false });
});

test("findFounderByWalletOrPassportWallet matches a founder's primary wallet", async () => {
  const alice = await mkFounder("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const owner = await svc.findFounderByWalletOrPassportWallet("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.deepEqual(owner, { userId: alice });
});

test("findFounderByWalletOrPassportWallet matches another founder's linked passport wallet", async () => {
  const alice = await mkFounder();
  const bob = await mkFounder();
  await svc.setFounderPassportWallet(alice, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

  const owner = await svc.findFounderByWalletOrPassportWallet("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.deepEqual(owner, { userId: alice });
  // Bob is unaffected.
  const bobRow = await db.select().from(schema.founders).where(eq(schema.founders.userId, bob));
  assert.equal(bobRow[0].passportWallet, null);
});

test("the unique index rejects two founders sharing the same passportWallet", async () => {
  const alice = await mkFounder();
  const bob = await mkFounder();
  await svc.setFounderPassportWallet(alice, "0xcccccccccccccccccccccccccccccccccccccccc");
  await assert.rejects(() => svc.setFounderPassportWallet(bob, "0xcccccccccccccccccccccccccccccccccccccccc"));
});

test("clearFounderPassportWallet unlinks without touching other founders", async () => {
  const alice = await mkFounder();
  const bob = await mkFounder();
  await svc.setFounderPassportWallet(alice, "0xdddddddddddddddddddddddddddddddddddddddd");
  await svc.setFounderPassportWallet(bob, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

  await svc.clearFounderPassportWallet(alice);

  const [aliceProfile, bobProfile] = await Promise.all([
    svc.getFounderByUserId(alice),
    svc.getFounderByUserId(bob),
  ]);
  assert.equal(aliceProfile.passportWallet, null);
  assert.equal(bobProfile.passportWallet, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");
});
