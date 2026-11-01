import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, quest;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  quest = await import("../src/lib/founders/quest/service.ts");
  ({ questSocialIdempotencyKey } = await import("../src/lib/founders/quest/config.ts"));
});

let questSocialIdempotencyKey;

let seq = 0;
async function mkFounder(verificationLevel = 1) {
  seq += 1;
  const id = `q-u${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test` });
  await db.insert(schema.partners).values({
    userId: id,
    referralCode: `rc-${id}`,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
  });
  await db.insert(schema.founders).values({
    userId: id,
    founderNumber: 10_000 + seq,
    countryCode: "US",
    entryMultiplier: 1,
    totalPoints: 0,
    questPoints: 0,
    walletAddress: `0x${seq.toString(16).padStart(40, "0")}`,
    verificationLevel,
  });
  return id;
}

test("quest points accrue once without duplicates", async () => {
  const userId = await mkFounder();
  const key = questSocialIdempotencyKey("telegram", userId);
  const first = await quest.awardQuestPoints(userId, "telegram_join", 300, key);
  const second = await quest.awardQuestPoints(userId, "telegram_join", 300, key);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error, "duplicate");
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row[0]?.questPoints, 300);
});

test("quest cap 5000 is enforced on the server", async () => {
  const userId = await mkFounder();
  const big = await quest.awardQuestPoints(userId, "verify", 4800, questSocialIdempotencyKey("verify", userId));
  assert.equal(big.ok, true);
  const over = await quest.awardQuestPoints(userId, "founder_card", 500, questSocialIdempotencyKey("founder_card", userId));
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.error, "cap_reached");
});

test("telegram unsubscribe deducts points idempotently", async () => {
  const userId = await mkFounder();
  await quest.awardQuestPoints(userId, "telegram_join", 300, questSocialIdempotencyKey("telegram", userId));
  const revoke1 = await quest.revokeTelegramJoinQuest(userId);
  const revoke2 = await quest.revokeTelegramJoinQuest(userId);
  assert.equal(revoke1.ok, true);
  assert.equal(revoke2.ok, false);
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  assert.equal(row[0]?.questPoints, 0);
});

test("secret word expires after 48h and allows one attempt per day", async () => {
  const userId = await mkFounder();
  const now = new Date("2026-11-01T12:00:00.000Z");
  const { createQuestSecretWord, submitSecretWordQuest } = quest;
  const { id } = await createQuestSecretWord({
    platform: "youtube",
    word: "orbit",
    validFrom: new Date(now.getTime() - 60_000),
    validTo: new Date(now.getTime() + 48 * 60 * 60 * 1000),
  });
  assert.ok(id);
  const ok = await submitSecretWordQuest(userId, "youtube", "orbit", now);
  assert.equal(ok.ok, true);
  const dup = await submitSecretWordQuest(userId, "youtube", "orbit", now);
  assert.equal(dup.ok, false);
  const expired = await submitSecretWordQuest(userId, "youtube", "orbit", new Date(now.getTime() + 49 * 60 * 60 * 1000));
  assert.equal(expired.ok, false);
});

test("oEmbed check requires author and personal code", async () => {
  const { verifyXReplyViaOembed } = await import("../src/lib/founders/quest/x-oembed.ts");
  const ok = await verifyXReplyViaOembed({
    replyUrl: "https://x.com/alice/status/123",
    linkedHandle: "alice",
    personalCode: "PPL-AB12",
    fetchOEmbed: async () => ({
      author_url: "https://twitter.com/alice",
      html: "<p>hello PPL-AB12</p>",
    }),
  });
  assert.equal(ok.ok, true);
  const bad = await verifyXReplyViaOembed({
    replyUrl: "https://x.com/alice/status/123",
    linkedHandle: "alice",
    personalCode: "PPL-AB12",
    fetchOEmbed: async () => ({ author_url: "https://twitter.com/bob", html: "nope" }),
  });
  assert.equal(bad.ok, false);
});

test("quest check wallet returns complete only when verified founder", async () => {
  const unverified = await mkFounder(0);
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, unverified)).limit(1);
  const wallet = row[0].walletAddress;
  assert.equal(await quest.isWalletQuestComplete(wallet), false);
  await db.update(schema.founders).set({ verificationLevel: 1 }).where(eq(schema.founders.userId, unverified));
  assert.equal(await quest.isWalletQuestComplete(wallet), true);
});

test("quest check API shape", async () => {
  const { GET } = await import("../src/app/api/founders/quest/check/route.ts");
  const userId = await mkFounder(1);
  const row = await db.select().from(schema.founders).where(eq(schema.founders.userId, userId)).limit(1);
  const wallet = row[0].walletAddress;
  const res = await GET(new Request(`http://localhost/api/founders/quest/check?wallet=${wallet}`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.result, 1);
  const bad = await GET(new Request("http://localhost/api/founders/quest/check?wallet=0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"));
  assert.equal((await bad.json()).result, 0);
});
