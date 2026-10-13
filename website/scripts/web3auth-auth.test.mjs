import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/web3auth-auth-db-loader.mjs", import.meta.url);

let db, schema, bindWeb3AuthProfile;

before(async () => {
  ({ getDbReady: globalThis.__getDb } = await import("./fixtures/web3auth-auth-pglite-db.mjs"));
  db = await globalThis.__getDb();
  schema = await import("../src/db/schema.ts");
  ({ bindWeb3AuthProfile } = await import("../src/lib/web3auth-auth.ts"));
});

let seq = 0;
function profile(overrides = {}) {
  seq += 1;
  return {
    email: `user${seq}@example.com`,
    name: `User ${seq}`,
    sub: `sub-${seq}`,
    verifier: "web3auth",
    verifierId: `verifier-id-${seq}`,
    aggregateVerifier: "w3a-google",
    emailVerified: true,
    ...overrides,
  };
}

async function accountsFor(userId) {
  return db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
}

test("new verifier+verifierId creates a user and binds an accounts row", async () => {
  const p = profile();
  const result = await bindWeb3AuthProfile(p);
  assert.ok(result?.id);
  assert.equal(result.email, p.email);

  const rows = await accountsFor(result.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, p.verifier);
  assert.equal(rows[0].providerAccountId, p.verifierId);

  const userRow = await db.query.users.findFirst({ where: eq(schema.users.id, result.id) });
  assert.equal(userRow?.email, p.email);
});

test("repeat login with the same verifier+verifierId reuses the user even if the upstream email changed", async () => {
  const p = profile();
  const first = await bindWeb3AuthProfile(p);

  const second = await bindWeb3AuthProfile({ ...p, email: "new-email@example.com" });
  assert.equal(second.id, first.id, "must resolve to the same user id");
  // The stored row is not silently rewritten from the token on every login.
  assert.equal(second.email, p.email);

  const rows = await accountsFor(first.id);
  assert.equal(rows.length, 1, "no duplicate accounts row is created for repeat logins");
});

test("first Web3Auth login with an email matching a non-Web3Auth-bound user backfills the binding", async () => {
  // Simulate a pre-existing user created by another provider (e.g. Google/Resend), or by
  // the old email-only Web3Auth code path that never wrote an accounts row.
  const legacyUserId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: legacyUserId,
    email: "legacy@example.com",
    name: "Legacy User",
    emailVerified: new Date(),
  });

  const p = profile({ email: "legacy@example.com" });
  const result = await bindWeb3AuthProfile(p);

  assert.equal(result.id, legacyUserId, "backfills onto the existing user rather than creating a new one");
  const rows = await accountsFor(legacyUserId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, p.verifier);
  assert.equal(rows[0].providerAccountId, p.verifierId);
});

test("a second, unrelated verifierId sharing an already-bound user's email is refused, not merged", async () => {
  const first = profile();
  const bound = await bindWeb3AuthProfile(first);

  // Different identity (different verifierId), but somehow reports the same email.
  const impostor = profile({ email: first.email });
  const result = await bindWeb3AuthProfile(impostor);

  assert.equal(result, null, "must refuse rather than silently take over the existing account");

  const rows = await accountsFor(bound.id);
  assert.equal(rows.length, 1, "the original binding is untouched");
  assert.equal(rows[0].providerAccountId, first.verifierId);

  const impostorAccount = await db.query.accounts.findFirst({
    where: eq(schema.accounts.providerAccountId, impostor.verifierId),
  });
  assert.equal(impostorAccount, undefined, "the impostor identity is never bound to anything");
});

test("wallet-sessions #1: a missing verifier/verifierId is refused, never falls back to binding by email", async () => {
  const p = profile({ verifier: null, verifierId: null });
  const result = await bindWeb3AuthProfile(p);
  assert.equal(result, null);

  const userRow = await db.query.users.findFirst({ where: eq(schema.users.email, p.email) });
  assert.equal(userRow, undefined, "no user is created for a token with no stable identity");
});

test("wallet-sessions #1 / recon R2: a disallowed verifier is refused even for a brand-new identity/email", async () => {
  const p = profile({ verifier: "discord", aggregateVerifier: "w3a-discord" });
  const result = await bindWeb3AuthProfile(p);
  assert.equal(result, null);

  const userRow = await db.query.users.findFirst({ where: eq(schema.users.email, p.email) });
  assert.equal(userRow, undefined);
});

test("wallet-sessions #1: a disallowed verifier is refused even when it matches an existing allowed-verifier email", async () => {
  const allowed = profile();
  const bound = await bindWeb3AuthProfile(allowed);
  assert.ok(bound?.id);

  const disallowed = profile({ email: allowed.email, verifier: "discord", aggregateVerifier: "w3a-discord" });
  const result = await bindWeb3AuthProfile(disallowed);
  assert.equal(result, null, "a disallowed verifier must never attach to an existing account, even by matching email");

  const rows = await accountsFor(bound.id);
  assert.equal(rows.length, 1, "no new accounts row was added for the disallowed verifier");
});

test("wallet-sessions #1: an allowed verifier (google) is accepted for a brand-new identity", async () => {
  const p = profile({ verifier: "google-oauth2", aggregateVerifier: "w3a-google" });
  const result = await bindWeb3AuthProfile(p);
  assert.ok(result?.id);
  const rows = await accountsFor(result.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider, "google-oauth2");
});

test("api-cron M1: an unverified email never backfills onto an existing user", async () => {
  const legacyUserId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: legacyUserId,
    email: "unverified-target@example.com",
    name: "Target",
    emailVerified: new Date(),
  });

  const p = profile({ email: "unverified-target@example.com", emailVerified: false });
  const result = await bindWeb3AuthProfile(p);
  assert.equal(result, null, "an email-fallback bind must require a verified email claim");

  const rows = await accountsFor(legacyUserId);
  assert.equal(rows.length, 0, "no binding is created for an unverified email");
});

test("an already-bound identity signs in even when the token reports an unverified email", async () => {
  // The stable verifier+verifierId pair (step 1) must not depend on the email claim at all.
  // emailVerified only gates the email-backfill path (step 2) and the new-user path (step 3).
  const p = profile({ verifier: "google-oauth2", aggregateVerifier: "w3a-google" });
  const first = await bindWeb3AuthProfile(p);
  assert.ok(first?.id);

  const again = await bindWeb3AuthProfile({ ...p, emailVerified: false, email: "changed@example.com" });
  assert.equal(again?.id, first.id, "the bound identity is reused regardless of the email claim");
  assert.equal(again.email, p.email, "the stored email is not rewritten from the token");
  assert.equal((await accountsFor(first.id)).length, 1);
});

test("api-cron M1: a DISCOVER_ADMIN_EMAILS address is never bound through Web3Auth", async () => {
  const previous = process.env.DISCOVER_ADMIN_EMAILS;
  process.env.DISCOVER_ADMIN_EMAILS = "someone@gmail.com";
  try {
    const adminUserId = crypto.randomUUID();
    await db.insert(schema.users).values({
      id: adminUserId,
      email: "someone@gmail.com",
      name: "Admin",
      emailVerified: new Date(),
    });

    // Even with a *verified* email claim, the admin account must not be reachable via Web3Auth
    // email fallback — admins are re-attached by userId or by signing in through Google.
    const p = profile({ email: "someone@gmail.com" });
    const result = await bindWeb3AuthProfile(p);
    assert.equal(result, null);

    const rows = await accountsFor(adminUserId);
    assert.equal(rows.length, 0, "the admin account gains no Web3Auth binding");
  } finally {
    if (previous === undefined) delete process.env.DISCOVER_ADMIN_EMAILS;
    else process.env.DISCOVER_ADMIN_EMAILS = previous;
  }
});
