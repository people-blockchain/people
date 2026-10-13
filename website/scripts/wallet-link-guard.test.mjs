// recon.md R2 / wallet-sessions.md #1: a *new* OAuth provider link must not silently attach to
// an account that already owns a cloud wallet (Google's allowDangerousEmailAccountLinking risk).
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./fixtures/web3auth-auth-db-loader.mjs", import.meta.url);

let db, schema, blocksDangerousAccountLink;

const { getDbReady } = await import("./fixtures/web3auth-auth-pglite-db.mjs");
db = await getDbReady();
schema = await import("../src/db/schema.ts");
({ blocksDangerousAccountLink } = await import("../src/lib/wallet-link-guard.ts"));

let seq = 0;
async function makeUser({ withVault = false } = {}) {
  seq += 1;
  const id = crypto.randomUUID();
  const email = `linkguard${seq}@example.com`;
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

test("brand-new account (no existing user): link is allowed", async () => {
  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: "new-google-id",
    email: `brand-new-${crypto.randomUUID()}@example.com`,
  });
  assert.equal(blocked, false);
});

test("existing account with no wallet: a new OAuth link is allowed (no behavior change)", async () => {
  const user = await makeUser({ withVault: false });
  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: "new-google-id-2",
    email: user.email,
  });
  assert.equal(blocked, false);
});

test("existing account that already owns a cloud wallet: a NEW provider link is blocked", async () => {
  const user = await makeUser({ withVault: true });
  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: "attacker-controlled-google-id",
    email: user.email,
  });
  assert.equal(blocked, true);
});

test("re-login with an already-linked provider+providerAccountId is never blocked, even with a wallet", async () => {
  const user = await makeUser({ withVault: true });
  await db.insert(schema.accounts).values({
    userId: user.id,
    type: "oauth",
    provider: "google",
    providerAccountId: "already-linked-google-id",
  });
  const blocked = await blocksDangerousAccountLink({
    provider: "google",
    providerAccountId: "already-linked-google-id",
    email: user.email,
  });
  assert.equal(blocked, false, "normal re-login must not be blocked");
});
