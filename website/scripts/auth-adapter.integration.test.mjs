import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { PARTNER_SCHEMA_STATEMENTS } from "../src/db/bootstrap-sql.mjs";
import { accounts, sessions, users, verificationTokens } from "../src/db/schema.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("auth.ts must not import next/headers (session cookies would be dropped)", () => {
  const src = readFileSync(join(root, "src/auth.ts"), "utf8");
  assert.doesNotMatch(src, /from ["']next\/headers["']/);
  assert.match(src, /wrapAuthAdapter/);
  assert.match(readFileSync(join(root, "src/lib/partner/auth-adapter.ts"), "utf8"), /pickAccount/);
});

test("login page does not bounce a signed-in visitor away mid Web3Auth resume", () => {
  // A mobile sign-in redirect lands on /login carrying b64Params/sessionId; a returning
  // (already signed-in) founder must not be server-redirected before the client consumes
  // that result and navigates itself back to where the attempt started (e.g. /founders).
  const page = readFileSync(join(root, "src/app/login/page.tsx"), "utf8");
  const guard = readFileSync(join(root, "src/app/login/SignedInRedirect.tsx"), "utf8");
  assert.match(page, /searchParams=\{params\}/);
  assert.match(guard, /hasWeb3AuthRedirectResultInParams/);
});

test("login page surfaces Auth.js error query and does not point error at /", () => {
  const page = readFileSync(join(root, "src/app/login/page.tsx"), "utf8");
  const form = readFileSync(join(root, "src/app/login/LoginForm.tsx"), "utf8");
  const config = readFileSync(join(root, "src/auth.config.ts"), "utf8");
  assert.match(page, /errorCode=\{params\.error\}/);
  assert.match(form, /authErrorMessage/);
  assert.match(form, /UnifiedWalletAuthPanel/);
  assert.match(readFileSync(join(root, "src/components/wallet/WalletCloudSignIn.tsx"), "utf8"), /next-auth\/react/);
  assert.match(config, /error:\s*"\/login"/);
  assert.doesNotMatch(config, /error:\s*"\/"/);
});

test("drizzle adapter createUser/linkAccount/verificationToken work on bootstrap schema", async () => {
  const client = new PGlite();
  try {
    for (const statement of PARTNER_SCHEMA_STATEMENTS) {
      await client.exec(statement);
    }
    const db = drizzle(client);
    const adapter = DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    });

    const created = await adapter.createUser({
      id: "user-from-authjs",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: new Date("2026-01-02T00:00:00.000Z"),
      image: null,
    });
    assert.ok(created?.id, "createUser must return an id");
    assert.equal(created.email, "ada@example.com");

    const byEmail = await adapter.getUserByEmail("ada@example.com");
    assert.equal(byEmail?.id, created.id);

    await adapter.linkAccount({
      userId: created.id,
      type: "email",
      provider: "resend",
      providerAccountId: "ada@example.com",
    });

    await adapter.linkAccount({
      userId: created.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "google-sub-1",
      refresh_token: "rt",
      access_token: "at",
      expires_at: 1_700_000_000,
      expires_in: 3599,
      refresh_token_expires_in: 604800,
      token_type: "bearer",
      scope: "openid email profile",
      id_token: "header.payload.sig",
      session_state: null,
    });

    const linked = await adapter.getUserByAccount({
      provider: "google",
      providerAccountId: "google-sub-1",
    });
    assert.equal(linked?.id, created.id);

    const stored = await adapter.createVerificationToken({
      identifier: "ada@example.com",
      token: "hashed-token",
      expires: new Date(Date.now() + 60_000),
    });
    assert.equal(stored?.token, "hashed-token");

    const used = await adapter.useVerificationToken({
      identifier: "ada@example.com",
      token: "hashed-token",
    });
    assert.equal(used?.token, "hashed-token");

    const reused = await adapter.useVerificationToken({
      identifier: "ada@example.com",
      token: "hashed-token",
    });
    assert.equal(reused, null);
  } finally {
    await client.close();
  }
});
