/**
 * Integration tests for the /transparency data layer against an in-memory Postgres
 * (PGlite) carrying the real bootstrap DDL.
 *
 * What matters here is not that the queries run, but that they refuse to inflate:
 * unverified and bot-flagged accounts must not count as people, invites or countries;
 * public lists must never carry a full wallet address; and a name/avatar must stay out
 * of the response until that founder opted in.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/referral-db-loader.mjs", import.meta.url);

let db, schema, tr;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/referral-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  tr = await import("../src/lib/founders/transparency.ts");
});

let seq = 0;
const walletFor = (n) => `0x${n.toString(16).padStart(40, "0")}`;

async function mkFounder({
  invitedBy = null,
  verified = true,
  bot = false,
  country = "GE",
  name = null,
  registeredAt = new Date(),
  optIn = false,
} = {}) {
  seq += 1;
  const id = `tf${seq}`;
  await db.insert(schema.users).values({ id, email: `${id}@x.test`, name });
  await db.insert(schema.founders).values({
    userId: id,
    founderNumber: seq,
    countryCode: country,
    entryMultiplier: 1,
    totalPoints: 0,
    walletAddress: walletFor(seq),
    verificationLevel: 1,
    invitedByUserId: invitedBy,
    isBot: bot,
    verifiedAt: verified ? new Date() : null,
    registeredAt,
    publicProfileOptIn: optIn,
  });
  return { id, number: seq };
}

/* ── pure helpers ─────────────────────────────────────────────────────────── */

test("shortenWallet shortens a real address and leaves anything else untouched", () => {
  const full = "0x1234567890abcdef1234567890abcdef12345678";
  assert.equal(tr.shortenWallet(full), `${full.slice(0, 6)}…${full.slice(-4)}`);
  assert.equal(tr.shortenWallet(`  ${full}  `), `${full.slice(0, 6)}…${full.slice(-4)}`);
  assert.equal(tr.shortenWallet("not-an-address"), "not-an-address");
  assert.equal(tr.shortenWallet("0x1234"), "0x1234");
});

test("parseReportMonth accepts YYYY-MM only, and never runs past the month end", () => {
  const range = tr.parseReportMonth("2026-10");
  assert.equal(range.key, "2026-10");
  assert.equal(range.start.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(tr.parseReportMonth("2026-12").end.toISOString(), "2027-01-01T00:00:00.000Z");
  for (const bad of ["2026-13", "2026-00", "1999-01", "abc", "2026", "2026-1", "", null]) {
    assert.equal(tr.parseReportMonth(bad), null, `expected ${bad} to be rejected`);
  }
});

/* ── counters ─────────────────────────────────────────────────────────────── */

test("counters count verified humans only, and count countries per person", async () => {
  const before = await tr.getCommunityCounters();
  await mkFounder({ country: "GE" });
  await mkFounder({ country: "GE" });
  await mkFounder({ country: "DE" });
  await mkFounder({ country: "DE", verified: false });
  await mkFounder({ country: "FR", bot: true });
  const after = await tr.getCommunityCounters();

  assert.equal(after.verifiedPeople - before.verifiedPeople, 3);
  assert.equal(after.countries - before.countries, 2);
});

/* ── ambassadors ──────────────────────────────────────────────────────────── */

test("leaderboard ranks by verified invitees and keeps bots and unverified invitees out", async () => {
  const inviter = await mkFounder({ name: "Not Shown Yet" });
  await mkFounder({ invitedBy: inviter.id });
  await mkFounder({ invitedBy: inviter.id });
  await mkFounder({ invitedBy: inviter.id, verified: false });
  await mkFounder({ invitedBy: inviter.id, bot: true });

  const other = await mkFounder();
  await mkFounder({ invitedBy: other.id });

  const rows = await tr.getTopAmbassadors();
  const mine = rows.find((row) => row.founderNumber === inviter.number);
  assert.ok(mine, "the inviter with two verified invitees is listed");
  assert.equal(mine.verifiedInvitees, 2, "only the verified, non-bot invitees count");
  assert.equal(rows[0].verifiedInvitees >= rows[1].verifiedInvitees, true, "sorted descending");

  // Without the opt-in the name is null, even though the account has one.
  assert.equal(mine.name, null);
  assert.equal(mine.avatar, null);
});

test("no public list ever carries a full wallet address", async () => {
  const inviter = await mkFounder();
  await mkFounder({ invitedBy: inviter.id });
  const rows = await tr.getTopAmbassadors();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.doesNotMatch(row.walletShort, /^0x[0-9a-f]{40}$/i);
    assert.match(row.walletShort, /^0x[0-9a-f]{4}…[0-9a-f]{4}$/i);
  }
});

test("opting in publishes the name, opting back out withdraws it", async () => {
  const inviter = await mkFounder({ name: "Opted In" });
  await mkFounder({ invitedBy: inviter.id });

  assert.equal(await tr.setPublicProfileOptIn(inviter.id, true), true);
  const shown = (await tr.getTopAmbassadors()).find((r) => r.founderNumber === inviter.number);
  assert.equal(shown.name, "Opted In");

  assert.equal(await tr.setPublicProfileOptIn(inviter.id, false), false);
  const hidden = (await tr.getTopAmbassadors()).find((r) => r.founderNumber === inviter.number);
  assert.equal(hidden.name, null);
});

test("opt-out is the default for a founder who never touched the switch", async () => {
  const inviter = await mkFounder({ name: "Never Asked" });
  await mkFounder({ invitedBy: inviter.id });
  const row = (await tr.getTopAmbassadors()).find((r) => r.name === "Never Asked");
  assert.equal(row, undefined);
});

/* ── lookup ───────────────────────────────────────────────────────────────── */

test("lookup finds a founder by number and by wallet, and hides an unopted name", async () => {
  const { id, number } = await mkFounder({ country: "PT", name: "Private Person" });

  const byNumber = await tr.lookupFounder(String(number));
  assert.equal(byNumber.founderNumber, number);
  assert.equal(byNumber.countryCode, "PT");
  assert.equal(byNumber.verified, true);
  assert.equal(byNumber.optedIn, false);
  assert.equal(byNumber.name, null);
  assert.equal(byNumber.walletShort, `${walletFor(number).slice(0, 6)}…${walletFor(number).slice(-4)}`);

  const byWallet = await tr.lookupFounder(walletFor(number).toUpperCase().replace("0X", "0x"));
  assert.equal(byWallet.founderNumber, number);

  await tr.setPublicProfileOptIn(id, true);
  assert.equal((await tr.lookupFounder(String(number))).name, "Private Person");
});

test("lookup rejects anything that is not a number or a 0x address", async () => {
  for (const bad of ["", "abc", "0x1234", "12 34", "-3", "0x" + "z".repeat(40)]) {
    assert.equal(await tr.lookupFounder(bad), null, `expected ${bad} to be rejected`);
  }
  assert.equal(await tr.lookupFounder("999999999"), null, "unknown number");
});

test("setPublicProfileOptIn returns null when the caller has no founder row", async () => {
  assert.equal(await tr.setPublicProfileOptIn("tf-nobody", true), null);
});

/* ── monthly report ───────────────────────────────────────────────────────── */

test("monthly report reads growth, countries and launches from stored rows", async () => {
  const inMonth = new Date("2026-03-15T12:00:00.000Z");
  const outside = new Date("2026-04-02T12:00:00.000Z");
  for (let i = 0; i < 3; i += 1) {
    await mkFounder({ country: "GE", registeredAt: inMonth });
  }
  await mkFounder({ country: "DE", registeredAt: inMonth });
  await mkFounder({ country: "GE", registeredAt: inMonth, verified: false });
  await mkFounder({ country: "GE", registeredAt: outside });

  await db.insert(schema.discoverProjects).values({
    id: "proj-march",
    title: "March launch",
    idea: "i",
    audience: "a",
    whyToken: "w",
    tokenAssetId: "t",
    tokenLink: "l",
    status: "active",
    createdAt: new Date("2026-03-10T00:00:00.000Z"),
  });
  await db.insert(schema.discoverProjects).values({
    id: "proj-archived",
    title: "Archived launch",
    idea: "i",
    audience: "a",
    whyToken: "w",
    tokenAssetId: "t",
    tokenLink: "l",
    status: "archived",
    createdAt: new Date("2026-03-11T00:00:00.000Z"),
  });

  const report = await tr.getMonthlyReport("2026-03");
  assert.equal(report.month, "2026-03");
  assert.equal(report.newVerifiedPeople, 4);
  assert.deepEqual(report.topCountries, [
    { countryCode: "GE", count: 3 },
    { countryCode: "DE", count: 1 },
  ]);
  assert.deepEqual(report.launches, [{ id: "proj-march", title: "March launch" }]);

  assert.equal(await tr.getMonthlyReport("2026-13"), null);
  const empty = await tr.getMonthlyReport("2001-01");
  assert.equal(empty.newVerifiedPeople, 0);
  assert.deepEqual(empty.launches, []);
});
