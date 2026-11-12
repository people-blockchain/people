// Regression coverage for the shared-browser session-merge bug: a valid JWT for user A must be
// discarded when the OAuth/magic-link identity being signed in is a different email. It must not
// call linkAccount onto A, and the resulting session must belong to B (the identity signed in).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./fixtures/web3auth-auth-db-loader.mjs", import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const { getDbReady } = await import("./fixtures/web3auth-auth-pglite-db.mjs");
const db = await getDbReady();
const schema = await import("../src/db/schema.ts");
const { DrizzleAdapter } = await import("@auth/drizzle-adapter");
const { and, eq } = await import("drizzle-orm");
const { OAuthAccountNotLinked } = await import("@auth/core/errors");
const { encode, decode } = await import("@auth/core/jwt");
const { handleLoginOrRegister } = await import(
  new URL("../node_modules/@auth/core/lib/actions/callback/handle-login.js", import.meta.url).href
);
const {
  recordIncomingSignInFromCallback,
  runWithIncomingSignInContext,
  wrapSessionIdentityAdapter,
} = await import("../src/lib/auth-session-identity.ts");
const { blocksDangerousAccountLink } = await import("../src/lib/wallet-link-guard.ts");
const { applyAuthJwtCallback } = await import("../src/lib/auth-jwt-callback.ts");

const SECRET = "session-identity-test-secret";
const COOKIE_NAME = "authjs.session-token";
const jwt = { secret: SECRET, maxAge: 60 * 60, encode, decode };

const linkCalls = [];
const baseAdapter = DrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
  verificationTokensTable: schema.verificationTokens,
});
const trackingAdapter = {
  ...baseAdapter,
  async linkAccount(account) {
    linkCalls.push({ ...account });
    return baseAdapter.linkAccount(account);
  },
};
const adapter = wrapSessionIdentityAdapter(trackingAdapter);

const googleProvider = {
  id: "google",
  type: "oidc",
  allowDangerousEmailAccountLinking: true,
  account: () => ({}),
};

function authOptions(provider = googleProvider) {
  return {
    adapter,
    jwt,
    events: {},
    session: {
      strategy: "jwt",
      maxAge: 60 * 60,
      generateSessionToken: () => crypto.randomUUID(),
    },
    cookies: { sessionToken: { name: COOKIE_NAME } },
    provider,
  };
}

let seq = 0;
async function makeUser({ withVault = false } = {}) {
  seq += 1;
  const id = crypto.randomUUID();
  const email = `identity${seq}@example.com`;
  await db.insert(schema.users).values({ id, email, name: "User", emailVerified: new Date() });
  if (withVault) {
    await db.insert(schema.userWalletVaults).values({
      userId: id,
      address: `0x${seq.toString(16).padStart(40, "0")}`,
      publicKey: `0x${"ab".repeat(33)}`,
      encryptedPrivateKey: "ciphertext",
      vaultVersion: 2,
    });
  }
  return { id, email };
}

async function sessionTokenFor(user) {
  return encode({
    token: { sub: user.id, email: user.email, authTime: Date.now() - 60_000 },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 60 * 60,
  });
}

function oauthUser(email) {
  return {
    id: crypto.randomUUID(),
    name: "Incoming",
    email,
    emailVerified: null,
    image: null,
  };
}

function googleAccount(providerAccountId) {
  return { provider: "google", type: "oidc", providerAccountId };
}

/** Mirrors the callback route: record the profile in `signIn`, then let Auth.js merge/resolve. */
function signInWithRecordedIdentity({ user, account, profile }, fn) {
  return runWithIncomingSignInContext(async () => {
    recordIncomingSignInFromCallback({ user, account, profile });
    return fn();
  });
}

async function accountsFor(providerAccountId) {
  return db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.provider, "google"),
        eq(schema.accounts.providerAccountId, providerAccountId),
      ),
    );
}

async function userRow(id) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row;
}

test("existing session A + Google email B: never links onto A; session and profile become B", async () => {
  const userA = await makeUser();
  const userB = await makeUser();
  const sessionToken = await sessionTokenFor(userA);

  const result = await signInWithRecordedIdentity(
    {
      user: { id: userA.id, email: userA.email },
      account: googleAccount("google-b-existing"),
      profile: { email: userB.email, email_verified: true },
    },
    () =>
      handleLoginOrRegister(
        sessionToken,
        oauthUser(userB.email),
        googleAccount("google-b-existing"),
        authOptions(),
      ),
  );

  assert.equal(result.user.id, userB.id, "Auth.js must resolve the incoming identity B");
  assert.equal(result.isNewUser, false);

  const linked = await accountsFor("google-b-existing");
  assert.equal(linked.length, 1);
  assert.equal(linked[0].userId, userB.id, "the Google account must belong to B, not A");
  assert.equal(
    linkCalls.some((call) => call.userId === userA.id && call.providerAccountId === "google-b-existing"),
    false,
    "linkAccount must never receive the stale session user A",
  );

  // The partner Profile section reads users.email for session.user.id, so this is the email the
  // cabinet would render. It must be B's, not A's.
  assert.equal((await userRow(userB.id)).email, userB.email);
  assert.equal((await userRow(userA.id)).email, userA.email);

  // The JWT issued for this login points at B, replacing A's cookie.
  const nextToken = applyAuthJwtCallback(
    { sub: userA.id },
    { user: result.user, account: googleAccount("google-b-existing"), trigger: "signIn" },
  );
  assert.equal(nextToken.sub, userB.id);
});

test("existing session A + a brand-new Google email B: creates B instead of linking onto A", async () => {
  const userA = await makeUser();
  const sessionToken = await sessionTokenFor(userA);
  const newEmail = `brand-new-${crypto.randomUUID()}@example.com`;

  const result = await signInWithRecordedIdentity(
    {
      user: { id: userA.id, email: userA.email },
      account: googleAccount("google-b-new"),
      profile: { email: newEmail, email_verified: true },
    },
    () =>
      handleLoginOrRegister(
        sessionToken,
        oauthUser(newEmail),
        googleAccount("google-b-new"),
        authOptions(),
      ),
  );

  assert.notEqual(result.user.id, userA.id);
  assert.equal(result.isNewUser, true);
  assert.equal(result.user.email, newEmail);

  const linked = await accountsFor("google-b-new");
  assert.equal(linked[0].userId, result.user.id);
  assert.equal((await userRow(result.user.id)).email, newEmail);
  assert.equal((await userRow(userA.id)).email, userA.email);
});

test("same verified email: a new Google link to an existing user with no vault is still allowed", async () => {
  const userA = await makeUser();
  const sessionToken = await sessionTokenFor(userA);

  const result = await signInWithRecordedIdentity(
    {
      user: { id: userA.id, email: userA.email },
      account: googleAccount("google-a-same-email"),
      profile: { email: userA.email, email_verified: true },
    },
    () =>
      handleLoginOrRegister(
        sessionToken,
        oauthUser(userA.email),
        googleAccount("google-a-same-email"),
        authOptions(),
      ),
  );

  assert.equal(result.user.id, userA.id);
  const linked = await accountsFor("google-a-same-email");
  assert.equal(linked.length, 1);
  assert.equal(linked[0].userId, userA.id);
});

test("incoming Google account already linked to another user: OAuthAccountNotLinked, never merged", async () => {
  const userA = await makeUser();
  const userC = await makeUser();
  await db.insert(schema.accounts).values({
    userId: userC.id,
    type: "oidc",
    provider: "google",
    providerAccountId: "google-c-linked",
  });
  const sessionToken = await sessionTokenFor(userA);

  await assert.rejects(
    () =>
      signInWithRecordedIdentity(
        {
          user: { id: userA.id, email: userA.email },
          account: googleAccount("google-c-linked"),
          profile: { email: userC.email, email_verified: true },
        },
        () =>
          handleLoginOrRegister(
            sessionToken,
            oauthUser(userC.email),
            googleAccount("google-c-linked"),
            authOptions(),
          ),
      ),
    (error) => error instanceof OAuthAccountNotLinked,
  );

  // No extra link was written for the stale session user.
  assert.equal(
    linkCalls.some((call) => call.userId === userA.id && call.providerAccountId === "google-c-linked"),
    false,
  );
});

test("magic link email B on a session for A replaces the session user with B", async () => {
  const userA = await makeUser();
  const userB = await makeUser();
  const sessionToken = await sessionTokenFor(userA);
  const emailAccount = {
    provider: "resend",
    type: "email",
    providerAccountId: userB.email,
  };

  const result = await signInWithRecordedIdentity(
    {
      user: { id: userB.id, email: userB.email },
      account: emailAccount,
      profile: undefined,
    },
    () =>
      handleLoginOrRegister(
        sessionToken,
        { id: userB.id, email: userB.email, emailVerified: new Date() },
        emailAccount,
        authOptions({ id: "resend", type: "email" }),
      ),
  );

  assert.equal(result.user.id, userB.id);
  const nextToken = applyAuthJwtCallback(
    { sub: userA.id },
    { user: result.user, account: emailAccount, trigger: "signIn" },
  );
  assert.equal(nextToken.sub, userB.id);
});

test("existing vault guard still blocks a new same-email OAuth link", async () => {
  const withVault = await makeUser({ withVault: true });
  const noVault = await makeUser();

  assert.equal(
    await blocksDangerousAccountLink({
      provider: "google",
      providerAccountId: "google-into-vault",
      email: withVault.email,
    }),
    true,
  );
  assert.equal(
    await blocksDangerousAccountLink({
      provider: "google",
      providerAccountId: "google-into-no-vault",
      email: noVault.email,
    }),
    false,
  );
});

test("jwt callback moves authTime only on a real sign-in/sign-up", () => {
  const now = Date.now();
  const old = now - 60 * 60 * 1000;

  const signInToken = { sub: "user-b", authTime: old };
  applyAuthJwtCallback(signInToken, { user: { id: "user-b" }, trigger: "signIn", nowMs: now });
  assert.equal(signInToken.authTime, now);

  const signUpToken = { sub: "user-b", authTime: old };
  applyAuthJwtCallback(signUpToken, { user: { id: "user-b" }, trigger: "signUp", nowMs: now });
  assert.equal(signUpToken.authTime, now);

  const updateToken = { sub: "user-a", authTime: old };
  applyAuthJwtCallback(updateToken, {
    user: { id: "user-a" },
    trigger: "update",
    session: { authTime: now },
    nowMs: now,
  });
  assert.equal(updateToken.authTime, old);

  const readToken = { sub: "user-a", authTime: old };
  applyAuthJwtCallback(readToken, { nowMs: now });
  assert.equal(readToken.authTime, old);
});

test("server-side wiring: auth route has request context, adapter + signIn callback are wrapped", () => {
  const route = read("src/app/api/auth/[...nextauth]/route.ts");
  assert.match(route, /runWithIncomingSignInContext\(\(\) => handlers\.GET\(request\)\)/);
  assert.match(route, /runWithIncomingSignInContext\(\(\) => handlers\.POST\(request\)\)/);

  const auth = read("src/auth.ts");
  assert.match(auth, /wrapSessionIdentityAdapter\(/);
  assert.match(auth, /recordIncomingSignInFromCallback\(params\)/);

  // The client-side signOut is UX only; it must not replace server-side enforcement.
  const panel = read("src/components/wallet/SessionSignInPanel.tsx");
  assert.match(panel, /signOut\(\{ redirect: false \}\)/);
});
