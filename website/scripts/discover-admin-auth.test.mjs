// api-cron.md M1: admins are identified by userId, with the legacy email list kept only as a
// Google-only migration fallback. These tests (a) pin the pure decision table, and (b) prove
// an existing admin account still signs in through Google, magic link and a previously-bound
// Web3Auth identity — the change must not lock the real owner out.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";
import { eq } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

register("./fixtures/web3auth-auth-db-loader.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_EMAIL = "test@example.com";

/** Unique address per test: `user.email` is unique and each test seeds its own fixture. */
function adminEmail() {
  return `admin-${crypto.randomUUID()}@example.com`;
}

let db, schema, bindWeb3AuthProfile, blocksDangerousAccountLink, isDiscoverAdminIdentity;
const previous = { emails: process.env.DISCOVER_ADMIN_EMAILS, ids: process.env.DISCOVER_ADMIN_USER_IDS };

before(async () => {
  const { getDbReady } = await import("./fixtures/web3auth-auth-pglite-db.mjs");
  db = await getDbReady();
  schema = await import("../src/db/schema.ts");
  ({ bindWeb3AuthProfile } = await import("../src/lib/web3auth-auth.ts"));
  ({ blocksDangerousAccountLink } = await import("../src/lib/wallet-link-guard.ts"));
  ({ isDiscoverAdminIdentity } = await import("../src/lib/discover/admin-config.ts"));
});

after(() => {
  if (previous.emails === undefined) delete process.env.DISCOVER_ADMIN_EMAILS;
  else process.env.DISCOVER_ADMIN_EMAILS = previous.emails;
  if (previous.ids === undefined) delete process.env.DISCOVER_ADMIN_USER_IDS;
  else process.env.DISCOVER_ADMIN_USER_IDS = previous.ids;
});

function withEnv(emails, ids) {
  if (emails === undefined) delete process.env.DISCOVER_ADMIN_EMAILS;
  else process.env.DISCOVER_ADMIN_EMAILS = emails;
  if (ids === undefined) delete process.env.DISCOVER_ADMIN_USER_IDS;
  else process.env.DISCOVER_ADMIN_USER_IDS = ids;
}

async function makeUser(email) {
  const id = crypto.randomUUID();
  await db.insert(schema.users).values({ id, email, name: "Admin", emailVerified: new Date() });
  return { id, email };
}

test("discover admin decision table", () => {
  withEnv(ADMIN_EMAIL, undefined);
  // userId list is empty → Google session matches by legacy email.
  assert.equal(
    isDiscoverAdminIdentity({ userId: "u1", email: ADMIN_EMAIL, provider: "google" }),
    true,
  );
  // Legacy email fallback is Google-only; magic link / Web3Auth sessions do not inherit admin.
  assert.equal(
    isDiscoverAdminIdentity({ userId: "u1", email: ADMIN_EMAIL, provider: "resend" }),
    false,
  );
  assert.equal(
    isDiscoverAdminIdentity({ userId: "u1", email: ADMIN_EMAIL, provider: "web3auth" }),
    false,
  );
  // userId list wins regardless of provider.
  withEnv(undefined, "admin-user-id");
  assert.equal(
    isDiscoverAdminIdentity({ userId: "admin-user-id", email: "nobody@example.com", provider: "resend" }),
    true,
  );
  assert.equal(isDiscoverAdminIdentity({ userId: "someone-else", email: null, provider: null }), false);
  // Opt-in only: no lists ⇒ nobody is admin.
  withEnv(undefined, undefined);
  assert.equal(isDiscoverAdminIdentity({ userId: "admin-user-id", email: ADMIN_EMAIL, provider: "google" }), false);
});

test("existing admin account: Google re-login is not blocked", async () => {
  const email = adminEmail();
  withEnv(email, undefined);
  const user = await makeUser(email);
  await db.insert(schema.accounts).values({
    userId: user.id,
    type: "oauth",
    provider: "google",
    providerAccountId: `google-sub-${crypto.randomUUID()}`,
  });
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.userId, user.id) });

  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: account.providerAccountId,
    email,
  });
  assert.equal(blocked, false, "the admin's own Google login must keep working");
});

test("existing admin account (magic link, no vault): first Google link is not blocked", async () => {
  const email = adminEmail();
  withEnv(email, undefined);
  await makeUser(email);

  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: `google-sub-${crypto.randomUUID()}`,
    email,
  });
  assert.equal(blocked, false);
});

test("existing admin account: magic link resolves the same user", async () => {
  const email = adminEmail();
  withEnv(email, undefined);
  const user = await makeUser(email);

  const adapter = DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  });
  const byEmail = await adapter.getUserByEmail(email);
  assert.equal(byEmail?.id, user.id, "magic link must not create a duplicate account");
});

test("existing admin account: an already-bound Web3Auth identity still signs in", async () => {
  const email = adminEmail();
  withEnv(email, undefined);
  const user = await makeUser(email);
  await db.insert(schema.accounts).values({
    userId: user.id,
    type: "oidc",
    provider: "google-oauth2",
    providerAccountId: "w3a-verifier-id-admin",
  });

  const result = await bindWeb3AuthProfile({
    email,
    name: "Admin",
    sub: "sub-admin",
    verifier: "google-oauth2",
    verifierId: "w3a-verifier-id-admin",
    aggregateVerifier: "w3a-google",
    emailVerified: true,
  });
  assert.equal(result?.id, user.id, "a pre-existing Web3Auth binding is unaffected by the email guard");
});

test("auth.config wires provider through jwt/session and still verifies Google emails", () => {
  const config = readFileSync(join(root, "src/auth.config.ts"), "utf8");
  assert.match(config, /account\?\.provider/, "jwt callback must record the sign-in provider");
  assert.match(config, /session\.provider = token\.provider/);
  assert.match(config, /profile\.email_verified !== true/, "Google profile must still reject unverified emails");
  const dts = readFileSync(join(root, "src/types/next-auth.d.ts"), "utf8");
  assert.match(dts, /provider\?: string/);
});
