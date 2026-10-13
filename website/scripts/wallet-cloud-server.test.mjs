// Regression tests for the cloud wallet vault's master secret and the wrap key's reauth window.
// recon.md R1 / audit M02-2: PEOPLE_WALLET_VAULT_SECRET is now mandatory at runtime — a leaked
// AUTH_SECRET (which signs every session cookie) must never also derive the AES key for every
// wallet vault, so there is no fallback to it for the *current* secret. Without the dedicated
// secret, the vault routes 503 `not_configured` (fail closed) instead of silently using
// AUTH_SECRET. AUTH_SECRET remains available only to migrate legacy vaultVersion:1 rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Redirect "@/db" to an in-memory Postgres before any test module pulls in wallet-cloud-server.ts,
// which imports "@/db" at module scope.
register("./fixtures/wallet-vault-db-loader.mjs", import.meta.url);

const {
  getUserWrapKeyHex,
  isAuthTimeFresh,
  isWalletVaultConfigured,
  loadUserWalletVault,
  walletVaultMasterSecret,
  WALLET_VAULT_REAUTH_WINDOW_MS,
} = await import("../src/lib/wallet-cloud-server.ts");
const { deriveUserWrapKeyHex, encryptPrivateKeyForVault } = await import("../src/lib/wallet-cloud-crypto.ts");
const { getDbReady } = await import("./fixtures/wallet-vault-pglite-db.mjs");
const schema = await import("../src/db/schema.ts");

async function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("walletVaultMasterSecret throws (fails closed) when the dedicated secret is unset, even with AUTH_SECRET present", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: undefined, AUTH_SECRET: "a".repeat(64), NODE_ENV: "production" }, () => {
    assert.throws(() => walletVaultMasterSecret());
  });
});

test("walletVaultMasterSecret prefers the dedicated secret over AUTH_SECRET (audit M02-2)", async () => {
  await withEnv(
    { PEOPLE_WALLET_VAULT_SECRET: "d".repeat(32), AUTH_SECRET: "a".repeat(64) },
    () => {
      assert.equal(walletVaultMasterSecret(), "d".repeat(32));
    },
  );
});

test("walletVaultMasterSecret still uses a short dedicated secret (rows may already be encrypted with it)", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: "too-short", AUTH_SECRET: undefined }, () => {
    assert.equal(walletVaultMasterSecret(), "too-short");
  });
});

test("walletVaultMasterSecret accepts a dedicated secret of >= 32 bytes", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: "b".repeat(32), AUTH_SECRET: undefined }, () => {
    assert.equal(walletVaultMasterSecret(), "b".repeat(32));
  });
});

test("isWalletVaultConfigured is false with AUTH_SECRET only (no dedicated secret: fail closed, not a silent fallback)", async () => {
  await withEnv(
    { PEOPLE_WALLET_VAULT_SECRET: undefined, AUTH_SECRET: "a".repeat(64), DATABASE_URL: "postgres://x/y" },
    () => {
      assert.equal(isWalletVaultConfigured(), false);
    },
  );
});

test("isWalletVaultConfigured is false with no master secret at all", async () => {
  await withEnv(
    { PEOPLE_WALLET_VAULT_SECRET: undefined, AUTH_SECRET: undefined, DATABASE_URL: "postgres://x/y" },
    () => {
      assert.equal(isWalletVaultConfigured(), false);
    },
  );
});

test("isWalletVaultConfigured is true once the dedicated secret and DB are set", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: "c".repeat(32), DATABASE_URL: "postgres://x/y" }, () => {
    assert.equal(isWalletVaultConfigured(), true);
  });
});

test("production config with AUTH_SECRET but no dedicated secret now 503s not_configured (intended fail-closed behavior)", async () => {
  await withEnv(
    { PEOPLE_WALLET_VAULT_SECRET: undefined, AUTH_SECRET: "a".repeat(64), DATABASE_URL: "postgres://x/y" },
    () => {
      // GET /api/wallet/vault, GET /api/wallet/vault/wrap-key and PUT /api/wallet/vault answer
      // `503 {error:"not_configured"}` whenever isWalletVaultConfigured() is false. This is now
      // intended: PEOPLE_WALLET_VAULT_SECRET must be set in production before deploy, or wallet
      // routes fail closed instead of silently deriving wrap keys from AUTH_SECRET (recon.md R1).
      assert.equal(isWalletVaultConfigured(), false);
    },
  );
});

test("isAuthTimeFresh: missing authTime is never fresh (forces reauth on old sessions)", () => {
  assert.equal(isAuthTimeFresh(undefined), false);
  assert.equal(isAuthTimeFresh(null), false);
});

test("isAuthTimeFresh: within the reauth window is fresh, just past it is not", () => {
  const now = 1_700_000_000_000;
  assert.equal(isAuthTimeFresh(now - WALLET_VAULT_REAUTH_WINDOW_MS, now), true);
  assert.equal(isAuthTimeFresh(now - WALLET_VAULT_REAUTH_WINDOW_MS - 1, now), false);
});

test("loadUserWalletVault migrates a legacy vaultVersion:1 row to the dedicated secret", async () => {
  await withEnv(
    { AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too", PEOPLE_WALLET_VAULT_SECRET: "y".repeat(32) },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-migration-user";
      await db.insert(schema.users).values({ id: userId });

      const legacyWrapKeyHex = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const privateKey = "ab".repeat(32);
      const legacyEncrypted = await encryptPrivateKeyForVault(privateKey, legacyWrapKeyHex);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: `0x${"11".repeat(20)}`,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey: legacyEncrypted,
        vaultVersion: 1,
      });

      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 2);
      assert.notEqual(migrated.encryptedPrivateKey, legacyEncrypted);

      const { decryptPrivateKeyFromVault } = await import("../src/lib/wallet-cloud-crypto.ts");
      const newWrapKeyHex = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      const plain = await decryptPrivateKeyFromVault(migrated.encryptedPrivateKey, newWrapKeyHex);
      assert.equal(plain, privateKey);

      // Re-loading is idempotent: already-migrated rows are returned as-is.
      const again = await loadUserWalletVault(userId);
      assert.equal(again.vaultVersion, 2);
      assert.equal(again.encryptedPrivateKey, migrated.encryptedPrivateKey);
    },
  );
});

test("a legacy vault is left at version 1 while the AUTH_SECRET fallback is in use", async () => {
  await withEnv(
    { AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too", PEOPLE_WALLET_VAULT_SECRET: undefined },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-fallback-user";
      await db.insert(schema.users).values({ id: userId });

      const legacyWrapKeyHex = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const privateKey = "cd".repeat(32);
      const legacyEncrypted = await encryptPrivateKeyForVault(privateKey, legacyWrapKeyHex);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: `0x${"33".repeat(20)}`,
        publicKey: `0x${"44".repeat(33)}`,
        encryptedPrivateKey: legacyEncrypted,
        vaultVersion: 1,
      });

      // Re-encrypting would use AUTH_SECRET again and only stamp vaultVersion 2, so once
      // PEOPLE_WALLET_VAULT_SECRET is set the row would decrypt to nothing. Leave it at 1.
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 1);
      assert.equal(loaded.encryptedPrivateKey, legacyEncrypted);
    },
  );
});

test("getUserWrapKeyHex fails closed (does not throw unhandled) when the vault secret is unset", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: undefined, AUTH_SECRET: undefined }, async () => {
    const db = await getDbReady();
    const userId = "wallet-unconfigured-user";
    await db.insert(schema.users).values({ id: userId });
    await assert.rejects(() => getUserWrapKeyHex(userId), /wallet_vault_not_configured/);
  });
});

test("getUserWrapKeyHex still migrates and returns a wrap key once the dedicated secret is set", async () => {
  await withEnv(
    { AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too", PEOPLE_WALLET_VAULT_SECRET: "z".repeat(32) },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-wrapkey-migration-user";
      await db.insert(schema.users).values({ id: userId });

      const legacyWrapKeyHex = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const privateKey = "ef".repeat(32);
      const legacyEncrypted = await encryptPrivateKeyForVault(privateKey, legacyWrapKeyHex);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: `0x${"55".repeat(20)}`,
        publicKey: `0x${"66".repeat(33)}`,
        encryptedPrivateKey: legacyEncrypted,
        vaultVersion: 1,
      });

      const wrapKeyHex = await getUserWrapKeyHex(userId);
      const expected = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(wrapKeyHex, expected);

      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 2);
    },
  );
});
