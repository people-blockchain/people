// recon.md R1: durable (DB-backed) access log + rate limit for the wrap-key route.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { eq } from "drizzle-orm";

register("./fixtures/wallet-vault-db-loader.mjs", import.meta.url);

const { getDbReady } = await import("./fixtures/wallet-vault-pglite-db.mjs");
const schema = await import("../src/db/schema.ts");
const { recordWalletVaultAccess, checkDurableWrapKeyRateLimit } = await import(
  "../src/lib/wallet-vault-access-log.ts"
);

const db = await getDbReady();

test("recordWalletVaultAccess surfaces a failed insert instead of dropping it", async () => {
  await assert.rejects(() =>
    recordWalletVaultAccess({
      userId: "missing-access-log-user",
      route: "wallet/vault/wrap-key",
      outcome: "reauth_required",
    }),
  );
});

test("recordWalletVaultAccess inserts a row with no key material fields", async () => {
  const userId = "access-log-user-1";
  await db.insert(schema.users).values({ id: userId });
  await recordWalletVaultAccess({ userId, route: "wallet/vault/wrap-key", outcome: "ok", ip: "127.0.0.1" });

  const rows = await db
    .select()
    .from(schema.walletVaultAccessLogs)
    .where(eq(schema.walletVaultAccessLogs.userId, userId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outcome, "ok");
  assert.equal(rows[0].route, "wallet/vault/wrap-key");
  assert.equal(rows[0].ip, "127.0.0.1");
  assert.ok(!("encryptedPrivateKey" in rows[0]));
});

test("checkDurableWrapKeyRateLimit counts prior rows within the window and refuses once over budget", async () => {
  const userId = "access-log-user-2";
  await db.insert(schema.users).values({ id: userId });
  const route = "wallet/vault/wrap-key";

  for (let i = 0; i < 3; i += 1) {
    const ok = await checkDurableWrapKeyRateLimit(userId, route, 3, 60_000);
    assert.equal(ok, true, `request ${i} should be within budget`);
    await recordWalletVaultAccess({ userId, route, outcome: "reauth_required" });
  }

  const ok = await checkDurableWrapKeyRateLimit(userId, route, 3, 60_000);
  assert.equal(ok, false, "the 4th request exceeds the budget of 3");
});

test("checkDurableWrapKeyRateLimit is scoped per user and per route", async () => {
  const userA = "access-log-user-3a";
  const userB = "access-log-user-3b";
  await db.insert(schema.users).values([{ id: userA }, { id: userB }]);
  const route = "wallet/vault/wrap-key";

  await recordWalletVaultAccess({ userId: userA, route, outcome: "reauth_required" });
  assert.equal(await checkDurableWrapKeyRateLimit(userA, route, 1, 60_000), false);

  // userB has made no requests yet, so it is unaffected by userA's usage.
  const okForB = await checkDurableWrapKeyRateLimit(userB, route, 1, 60_000);
  assert.equal(okForB, true);

  // A different route for the same user is also unaffected.
  const okOtherRoute = await checkDurableWrapKeyRateLimit(userA, "wallet/vault", 1, 60_000);
  assert.equal(okOtherRoute, true);
});
