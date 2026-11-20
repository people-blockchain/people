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
  currentVaultVersion,
  expectedSecretSlotForVaultVersion,
  getUserWrapKeyHex,
  hashVaultRowId,
  isAuthTimeFresh,
  isVaultRotationActive,
  isWalletVaultConfigured,
  legacyVaultCasWhere,
  loadUserWalletVault,
  migrateAllWalletVaults,
  unwrapMasterSecretForVaultVersion,
  vaultCasWhere,
  walletVaultMasterSecret,
  WALLET_VAULT_REAUTH_WINDOW_MS,
} = await import("../src/lib/wallet-cloud-server.ts");
const { decryptPrivateKeyFromVault, deriveUserWrapKeyHex, encryptPrivateKeyForVault } = await import(
  "../src/lib/wallet-cloud-crypto.ts"
);
const { keyFromPrivate } = await import("../src/lib/people-sign.ts");
const { evmAddressFromPublicKey, legacyAddressFromPublicKey } = await import("../src/lib/wallet-address-scheme.ts");
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
        address: keyFromPrivate(privateKey).address,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey: legacyEncrypted,
        vaultVersion: 1,
      });

      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 2);
      assert.notEqual(migrated.encryptedPrivateKey, legacyEncrypted);

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
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "z".repeat(32),
      // getUserWrapKeyHex refuses unless a database URL is configured, same as the route.
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-wrapkey-migration-user";
      await db.insert(schema.users).values({ id: userId });

      const legacyWrapKeyHex = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const privateKey = "ef".repeat(32);
      const legacyEncrypted = await encryptPrivateKeyForVault(privateKey, legacyWrapKeyHex);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: keyFromPrivate(privateKey).address,
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

test("legacy migration leaves the row untouched when the decrypted key address does not match", async () => {
  await withEnv(
    { AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too", PEOPLE_WALLET_VAULT_SECRET: "m".repeat(32) },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-address-mismatch-user";
      await db.insert(schema.users).values({ id: userId });
      const privateKey = "cd".repeat(32);
      const legacyWrapKeyHex = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const legacyEncrypted = await encryptPrivateKeyForVault(privateKey, legacyWrapKeyHex);
      const storedAddress = keyFromPrivate("11".repeat(32)).address;
      assert.notEqual(storedAddress.toLowerCase(), keyFromPrivate(privateKey).address.toLowerCase());
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: storedAddress,
        publicKey: `0x${"77".repeat(33)}`,
        encryptedPrivateKey: legacyEncrypted,
        vaultVersion: 1,
      });

      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => {
        warnings.push(args);
      };
      try {
        const loaded = await loadUserWalletVault(userId);
        assert.equal(loaded.vaultVersion, 1);
        assert.equal(loaded.encryptedPrivateKey, legacyEncrypted);
        assert.equal(loaded.address, storedAddress);
      } finally {
        console.warn = original;
      }
      const text = JSON.stringify(warnings);
      assert.match(text, /legacy_address_mismatch/);
      assert.equal(text.includes(storedAddress), false);
      assert.equal(text.includes(privateKey), false);
      assert.equal(text.includes(userId), false);
      assert.equal(text.includes(legacyEncrypted), false);
    },
  );
});

test("legacy migration compare-and-swap does not overwrite a version 2 row", async () => {
  await withEnv({ PEOPLE_WALLET_VAULT_SECRET: "n".repeat(32) }, async () => {
    const db = await getDbReady();
    const userId = "wallet-cas-user";
    await db.insert(schema.users).values({ id: userId });
    const ciphertext = "ciphertext-must-stay";
    await db.insert(schema.userWalletVaults).values({
      userId,
      address: `0x${"99".repeat(20)}`,
      publicKey: `0x${"88".repeat(33)}`,
      encryptedPrivateKey: ciphertext,
      vaultVersion: 2,
    });
    const updated = await db
      .update(schema.userWalletVaults)
      .set({ encryptedPrivateKey: "overwritten", vaultVersion: 2 })
      .where(legacyVaultCasWhere(userId))
      .returning();
    assert.equal(updated.length, 0);
    const { eq } = await import("drizzle-orm");
    const current = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, userId));
    assert.equal(current.length, 1);
    assert.equal(current[0].encryptedPrivateKey, ciphertext);
    assert.equal(current[0].vaultVersion, 2);
  });
});

async function insertVault({ userId, secret, vaultVersion, privateKey = "ab".repeat(32), storedAddress }) {
  const db = await getDbReady();
  await db.insert(schema.users).values({ id: userId });
  const wrapKeyHex = await deriveUserWrapKeyHex(secret, userId);
  const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);
  const address = storedAddress ?? keyFromPrivate(privateKey).address;
  await db.insert(schema.userWalletVaults).values({
    userId,
    address,
    publicKey: `0x${"22".repeat(33)}`,
    encryptedPrivateKey,
    vaultVersion,
  });
  return { encryptedPrivateKey, privateKey, address };
}

test("rotation env unset: current version stays 2 and a v2 row is not rewritten", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "c".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      PEOPLE_WALLET_VAULT_SECRET_NEXT: undefined,
    },
    async () => {
      assert.equal(isVaultRotationActive(), false);
      assert.equal(currentVaultVersion(), 2);
      const userId = "wallet-v2-noop-user";
      const inserted = await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 2,
        privateKey: "a1".repeat(32),
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 2);
      assert.equal(loaded.encryptedPrivateKey, inserted.encryptedPrivateKey);
    },
  );
});

test("v1 migrates straight to v3 when PREVIOUS is set", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "P".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: undefined,
    },
    async () => {
      assert.equal(currentVaultVersion(), 3);
      const userId = "wallet-v1-to-v3-user";
      const privateKey = "a2".repeat(32);
      await insertVault({
        userId,
        secret: process.env.AUTH_SECRET,
        vaultVersion: 1,
        privateKey,
      });
      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 3);
      const currentWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(await decryptPrivateKeyFromVault(migrated.encryptedPrivateKey, currentWrap), privateKey);
      const previousWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_PREVIOUS, userId);
      await assert.rejects(() => decryptPrivateKeyFromVault(migrated.encryptedPrivateKey, previousWrap));
    },
  );
});

test("v2 migrates to v3 with the previous secret", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: undefined,
    },
    async () => {
      const userId = "wallet-v2-to-v3-user";
      const privateKey = "22".repeat(32);
      const inserted = await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET_PREVIOUS,
        vaultVersion: 2,
        privateKey,
      });
      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 3);
      assert.notEqual(migrated.encryptedPrivateKey, inserted.encryptedPrivateKey);
      const currentWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(await decryptPrivateKeyFromVault(migrated.encryptedPrivateKey, currentWrap), privateKey);
    },
  );
});

test("already-v3 rows are left untouched during rotation", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "O".repeat(32),
    },
    async () => {
      const userId = "wallet-already-v3-user";
      const inserted = await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 3,
        privateKey: "33".repeat(32),
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
      assert.equal(loaded.encryptedPrivateKey, inserted.encryptedPrivateKey);
    },
  );
});

test("wrong previous secret does not write and does not destroy ciphertext", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "wrong-previous-secret-32bytes-x",
    },
    async () => {
      const userId = "wallet-wrong-previous-user";
      const realPrevious = "real-previous-secret-32bytes-ok";
      const privateKey = "44".repeat(32);
      const inserted = await insertVault({
        userId,
        secret: realPrevious,
        vaultVersion: 2,
        privateKey,
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 2);
      assert.equal(loaded.encryptedPrivateKey, inserted.encryptedPrivateKey);
      const realWrap = await deriveUserWrapKeyHex(realPrevious, userId);
      assert.equal(await decryptPrivateKeyFromVault(loaded.encryptedPrivateKey, realWrap), privateKey);
    },
  );
});

test("concurrent v2→v3 compare-and-swap leaves a single intact v3 row", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "O".repeat(32),
    },
    async () => {
      const userId = "wallet-concurrent-cas-user";
      const privateKey = "55".repeat(32);
      await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET_PREVIOUS,
        vaultVersion: 2,
        privateKey,
      });
      const [a, b] = await Promise.all([loadUserWalletVault(userId), loadUserWalletVault(userId)]);
      assert.equal(a.vaultVersion, 3);
      assert.equal(b.vaultVersion, 3);
      const db = await getDbReady();
      const { eq } = await import("drizzle-orm");
      const current = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, userId));
      assert.equal(current.length, 1);
      assert.equal(current[0].vaultVersion, 3);
      const currentWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(await decryptPrivateKeyFromVault(current[0].encryptedPrivateKey, currentWrap), privateKey);
    },
  );
});

test("NEXT mode unwraps v2 with PEOPLE_WALLET_VAULT_SECRET and re-wraps to v3", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
    },
    async () => {
      assert.equal(walletVaultMasterSecret(), "N".repeat(32));
      assert.equal(currentVaultVersion(), 3);
      const userId = "wallet-next-mode-user";
      const privateKey = "66".repeat(32);
      await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 2,
        privateKey,
      });
      const migrated = await loadUserWalletVault(userId);
      assert.equal(migrated.vaultVersion, 3);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(await decryptPrivateKeyFromVault(migrated.encryptedPrivateKey, nextWrap), privateKey);
    },
  );
});

test("v2→v3 compare-and-swap does not overwrite a version 3 row", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "O".repeat(32),
    },
    async () => {
      const db = await getDbReady();
      const userId = "wallet-v3-cas-user";
      await db.insert(schema.users).values({ id: userId });
      const ciphertext = "v3-ciphertext-must-stay";
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: `0x${"aa".repeat(20)}`,
        publicKey: `0x${"bb".repeat(33)}`,
        encryptedPrivateKey: ciphertext,
        vaultVersion: 3,
      });
      const updated = await db
        .update(schema.userWalletVaults)
        .set({ encryptedPrivateKey: "overwritten", vaultVersion: 3 })
        .where(vaultCasWhere(userId, 2))
        .returning();
      assert.equal(updated.length, 0);
      const { eq } = await import("drizzle-orm");
      const current = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, userId));
      assert.equal(current[0].encryptedPrivateKey, ciphertext);
      assert.equal(current[0].vaultVersion, 3);
    },
  );
});

test("bulk migrate dry-run reports counts and writes nothing; live migrate moves v2 to v3", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: "O".repeat(32),
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const db = await getDbReady();
      const { eq } = await import("drizzle-orm");
      await db.delete(schema.userWalletVaults);
      const userId = "wallet-bulk-migrate-user";
      const privateKey = "77".repeat(32);
      const inserted = await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET_PREVIOUS,
        vaultVersion: 2,
        privateKey,
      });
      const dry = await migrateAllWalletVaults({ dryRun: true });
      assert.equal(dry.dryRun, true);
      assert.equal(dry.currentVersion, 3);
      assert.equal(dry.rotationActive, true);
      assert.equal(dry.migrated, 0);
      assert.equal(dry.counts.total, 1);
      assert.equal(dry.counts[2], 1);
      assert.equal(dry.counts[3], 0);
      const raw = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, userId));
      assert.equal(raw[0].vaultVersion, 2);
      assert.equal(raw[0].encryptedPrivateKey, inserted.encryptedPrivateKey);

      const live = await migrateAllWalletVaults({ dryRun: false });
      assert.equal(live.dryRun, false);
      assert.equal(live.migrated, 1);
      assert.equal(live.failed, 0);
      assert.deepEqual(live.failures, []);
      assert.equal(live.skipped, 0);
      assert.equal(live.counts.total, 1);
      assert.equal(live.counts[3], 1);
      assert.equal(live.counts[2], 0);
      const row = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, userId));
      assert.equal(row[0].vaultVersion, 3);
      const currentWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(await decryptPrivateKeyFromVault(row[0].encryptedPrivateKey, currentWrap), privateKey);
    },
  );
});

test("unwrapMasterSecretForVaultVersion matches the stored version, never NEXT for v1/v2", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
    },
    () => {
      assert.equal(unwrapMasterSecretForVaultVersion(1), process.env.AUTH_SECRET);
      assert.equal(unwrapMasterSecretForVaultVersion(2), process.env.PEOPLE_WALLET_VAULT_SECRET);
      assert.equal(unwrapMasterSecretForVaultVersion(3), process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT);
      assert.equal(expectedSecretSlotForVaultVersion(1), "auth_secret");
      assert.equal(expectedSecretSlotForVaultVersion(2), "dedicated");
      assert.equal(expectedSecretSlotForVaultVersion(3), "next");
    },
  );
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: undefined,
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
    },
    () => {
      assert.equal(unwrapMasterSecretForVaultVersion(3), process.env.PEOPLE_WALLET_VAULT_SECRET);
      assert.equal(expectedSecretSlotForVaultVersion(3), "dedicated");
    },
  );
});

test("unmigrated v2 row with NEXT set returns the old dedicated wrap key, not NEXT", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-wrapkey-stuck-v2-user";
      const privateKey = "88".repeat(32);
      const storedAddress = keyFromPrivate("99".repeat(32)).address;
      assert.notEqual(storedAddress.toLowerCase(), keyFromPrivate(privateKey).address.toLowerCase());
      const db = await getDbReady();
      await db.insert(schema.users).values({ id: userId });
      const wrapKeyHex = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, wrapKeyHex);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: storedAddress,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey,
        vaultVersion: 2,
      });

      const returned = await getUserWrapKeyHex(userId);
      const oldWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(returned, oldWrap);
      assert.notEqual(returned, nextWrap);
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 2);
      assert.equal(loaded.encryptedPrivateKey, encryptedPrivateKey);
    },
  );
});

test("v3 row with NEXT set returns the NEXT wrap key", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-wrapkey-v3-next-user";
      const privateKey = "aa".repeat(32);
      await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT,
        vaultVersion: 3,
        privateKey,
      });
      const returned = await getUserWrapKeyHex(userId);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      const oldWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(returned, nextWrap);
      assert.notEqual(returned, oldWrap);
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
    },
  );
});

test("unmigrated v1 row with NEXT set returns the AUTH_SECRET wrap key", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-wrapkey-stuck-v1-user";
      const privateKey = "bb".repeat(32);
      const storedAddress = keyFromPrivate("cc".repeat(32)).address;
      const db = await getDbReady();
      await db.insert(schema.users).values({ id: userId });
      const legacyWrap = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const encryptedPrivateKey = await encryptPrivateKeyForVault(privateKey, legacyWrap);
      await db.insert(schema.userWalletVaults).values({
        userId,
        address: storedAddress,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey,
        vaultVersion: 1,
      });

      const returned = await getUserWrapKeyHex(userId);
      const authWrap = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(returned, authWrap);
      assert.notEqual(returned, nextWrap);
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 1);
    },
  );
});

test("bulk migrate live reports hashed rowId + error code; dry-run probes each secret slot", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const db = await getDbReady();
      const { eq } = await import("drizzle-orm");
      await db.delete(schema.userWalletVaults);

      const v2OkId = "wallet-probe-v2-ok";
      const v2FailId = "wallet-probe-v2-fail";
      const v3Id = "wallet-probe-v3";
      const v1MismatchId = "wallet-probe-v1-mismatch";

      await insertVault({
        userId: v2OkId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 2,
        privateKey: "d1".repeat(32),
      });
      const v2FailPk = "d2".repeat(32);
      const v2FailAddr = keyFromPrivate("d3".repeat(32)).address;
      await db.insert(schema.users).values({ id: v2FailId });
      const v2FailWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, v2FailId);
      await db.insert(schema.userWalletVaults).values({
        userId: v2FailId,
        address: v2FailAddr,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey: await encryptPrivateKeyForVault(v2FailPk, v2FailWrap),
        vaultVersion: 2,
      });
      await insertVault({
        userId: v3Id,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT,
        vaultVersion: 3,
        privateKey: "d4".repeat(32),
      });
      const v1Pk = "d5".repeat(32);
      const v1Addr = keyFromPrivate("d6".repeat(32)).address;
      await db.insert(schema.users).values({ id: v1MismatchId });
      const v1Wrap = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, v1MismatchId);
      await db.insert(schema.userWalletVaults).values({
        userId: v1MismatchId,
        address: v1Addr,
        publicKey: `0x${"22".repeat(33)}`,
        encryptedPrivateKey: await encryptPrivateKeyForVault(v1Pk, v1Wrap),
        vaultVersion: 1,
      });

      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => {
        warnings.push(args);
      };
      let dry;
      let live;
      try {
        dry = await migrateAllWalletVaults({ dryRun: true });
        live = await migrateAllWalletVaults({ dryRun: false });
      } finally {
        console.warn = original;
      }

      assert.equal(dry.dryRun, true);
      assert.ok(Array.isArray(dry.decryptProbes));
      const byRow = Object.fromEntries(dry.decryptProbes.map((p) => [p.rowId, p]));
      const v2OkProbe = byRow[hashVaultRowId(v2OkId)];
      const v2FailProbe = byRow[hashVaultRowId(v2FailId)];
      const v3Probe = byRow[hashVaultRowId(v3Id)];
      const v1Probe = byRow[hashVaultRowId(v1MismatchId)];
      assert.equal(v2OkProbe.probes.dedicated, "ok");
      assert.equal(v2OkProbe.probes.next, "fail");
      assert.equal(v2OkProbe.expectedSlot, "dedicated");
      assert.equal(v2FailProbe.probes.dedicated, "address_mismatch");
      assert.equal(v3Probe.probes.next, "ok");
      assert.equal(v3Probe.probes.dedicated, "fail");
      assert.equal(v1Probe.probes.auth_secret, "address_mismatch");
      assert.equal(
        dry.decryptProbes.some((p) => JSON.stringify(p).includes(v2FailId)),
        false,
      );
      assert.ok(dry.failures.some((f) => f.rowId === hashVaultRowId(v2FailId)));
      assert.ok(dry.failures.some((f) => f.rowId === hashVaultRowId(v1MismatchId)));
      assert.equal(
        dry.failures.some((f) => f.rowId === hashVaultRowId(v2OkId)),
        false,
      );

      assert.equal(live.migrated, 1);
      assert.equal(live.failed, 2);
      const liveCodes = Object.fromEntries(live.failures.map((f) => [f.rowId, f.code]));
      assert.equal(liveCodes[hashVaultRowId(v2FailId)], "rotate_address_mismatch");
      assert.equal(liveCodes[hashVaultRowId(v1MismatchId)], "legacy_address_mismatch");
      assert.equal(live.failures.some((f) => JSON.stringify(f).includes(v2FailId)), false);
      const logText = JSON.stringify(warnings);
      assert.match(logText, /\[wallet-vault\] rotate row failed/);
      assert.match(logText, /rotate_address_mismatch/);
      assert.match(logText, /legacy_address_mismatch/);
      assert.equal(logText.includes(v2FailId), false);
      assert.equal(logText.includes(v1MismatchId), false);
      assert.equal(logText.includes(v2FailPk), false);

      const v2OkRow = await db.select().from(schema.userWalletVaults).where(eq(schema.userWalletVaults.userId, v2OkId));
      assert.equal(v2OkRow[0].vaultVersion, 3);
      const v2FailRow = await db
        .select()
        .from(schema.userWalletVaults)
        .where(eq(schema.userWalletVaults.userId, v2FailId));
      assert.equal(v2FailRow[0].vaultVersion, 2);
    },
  );
});

test("migrate re-wraps a vault stored under the legacy sha256 address while the site uses keccak", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      NEXT_PUBLIC_CHAIN: "cosmos-evm",
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-legacy-scheme-v2-user";
      const privateKey = "e1".repeat(32);
      const key = keyFromPrivate(privateKey);
      const legacy = legacyAddressFromPublicKey(key.publicKey);
      const evm = evmAddressFromPublicKey(key.publicKey);
      assert.notEqual(legacy.toLowerCase(), evm.toLowerCase());
      await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 2,
        privateKey,
        storedAddress: legacy,
      });

      const dry = await migrateAllWalletVaults({ dryRun: true });
      const probe = dry.decryptProbes.find((p) => p.rowId === hashVaultRowId(userId));
      assert.equal(probe.probes.dedicated, "ok");
      assert.equal(probe.schemeMatch, "legacy");
      assert.equal(probe.storedAddress, legacy.toLowerCase());
      assert.equal(probe.derivedEvm.toLowerCase(), evm.toLowerCase());
      assert.equal(probe.derivedLegacy.toLowerCase(), legacy.toLowerCase());
      assert.equal(
        dry.failures.some((f) => f.rowId === hashVaultRowId(userId)),
        false,
      );

      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
      assert.equal(loaded.address.toLowerCase(), legacy.toLowerCase());
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(await decryptPrivateKeyFromVault(loaded.encryptedPrivateKey, nextWrap), privateKey);
    },
  );
});

test("v1 row stored under the legacy sha256 address migrates and wrap-key follows the row", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      NEXT_PUBLIC_CHAIN: "cosmos-evm",
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-legacy-scheme-v1-user";
      const privateKey = "e2".repeat(32);
      const key = keyFromPrivate(privateKey);
      await insertVault({
        userId,
        secret: process.env.AUTH_SECRET,
        vaultVersion: 1,
        privateKey,
        storedAddress: legacyAddressFromPublicKey(key.publicKey),
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
      const wrap = await getUserWrapKeyHex(userId);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(wrap, nextWrap);
    },
  );
});

test("checksum-only case difference is not address_mismatch", async () => {
  await withEnv(
    {
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-checksum-case-user";
      const privateKey = "e3".repeat(32);
      const evm = evmAddressFromPublicKey(keyFromPrivate(privateKey).publicKey);
      await insertVault({
        userId,
        secret: process.env.PEOPLE_WALLET_VAULT_SECRET,
        vaultVersion: 2,
        privateKey,
        storedAddress: evm.toLowerCase(),
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
    },
  );
});

test("v2 row encrypted with AUTH_SECRET migrates to v3 when dedicated decrypt fails", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-v2-auth-secret-stamp-user";
      const privateKey = "e4".repeat(32);
      await insertVault({
        userId,
        secret: process.env.AUTH_SECRET,
        vaultVersion: 2,
        privateKey,
      });

      const dry = await migrateAllWalletVaults({ dryRun: true });
      const probe = dry.decryptProbes.find((p) => p.rowId === hashVaultRowId(userId));
      assert.equal(probe.probes.dedicated, "fail");
      assert.equal(probe.probes.auth_secret, "ok");
      assert.equal(probe.expectedSlot, "dedicated");
      assert.equal(probe.unwrapSlot, "auth_secret");
      assert.equal(
        dry.failures.some((f) => f.rowId === hashVaultRowId(userId)),
        false,
      );

      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 3);
      const nextWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET_NEXT, userId);
      assert.equal(await decryptPrivateKeyFromVault(loaded.encryptedPrivateKey, nextWrap), privateKey);
      const wrap = await getUserWrapKeyHex(userId);
      assert.equal(wrap, nextWrap);
    },
  );
});

test("wrap-key for a v2 AUTH_SECRET-stamped row returns AUTH_SECRET before rotation", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: undefined,
      PEOPLE_WALLET_VAULT_SECRET_PREVIOUS: undefined,
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-v2-auth-secret-wrap-user";
      const privateKey = "e5".repeat(32);
      await insertVault({
        userId,
        secret: process.env.AUTH_SECRET,
        vaultVersion: 2,
        privateKey,
      });
      const wrap = await getUserWrapKeyHex(userId);
      const authWrap = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      const dedicatedWrap = await deriveUserWrapKeyHex(process.env.PEOPLE_WALLET_VAULT_SECRET, userId);
      assert.equal(wrap, authWrap);
      assert.notEqual(wrap, dedicatedWrap);
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 2);
    },
  );
});

test("v2 AUTH_SECRET fallback still refuses a genuine address mismatch", async () => {
  await withEnv(
    {
      AUTH_SECRET: "legacy-auth-secret-used-for-sessions-too",
      PEOPLE_WALLET_VAULT_SECRET: "O".repeat(32),
      PEOPLE_WALLET_VAULT_SECRET_NEXT: "N".repeat(32),
      DATABASE_URL: "postgres://x/y",
    },
    async () => {
      const userId = "wallet-v2-auth-secret-mismatch-user";
      const privateKey = "e6".repeat(32);
      const otherAddress = keyFromPrivate("e7".repeat(32)).address;
      await insertVault({
        userId,
        secret: process.env.AUTH_SECRET,
        vaultVersion: 2,
        privateKey,
        storedAddress: otherAddress,
      });
      const loaded = await loadUserWalletVault(userId);
      assert.equal(loaded.vaultVersion, 2);
      const wrap = await getUserWrapKeyHex(userId);
      const authWrap = await deriveUserWrapKeyHex(process.env.AUTH_SECRET, userId);
      assert.equal(wrap, authWrap);
    },
  );
});
