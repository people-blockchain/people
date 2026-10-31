// A normal email sign-in used to share one 20-slot bucket with wrap-key, so a few
// sign-ins answered 429 and the card showed a generic failure. These tests pin the
// split budgets, the failure counter, and Retry-After.
import { test, before, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";

register("./fixtures/wallet-vault-auth-loader.mjs", import.meta.url);
register("./fixtures/wallet-vault-db-loader.mjs", import.meta.url);

process.env.DATABASE_URL ??= "postgres://unit-test/wallet-vault";
process.env.PEOPLE_WALLET_VAULT_SECRET ??= "unit-test-wallet-vault-secret-value";

const { getDbReady } = await import("./fixtures/wallet-vault-pglite-db.mjs");
const schema = await import("../src/db/schema.ts");
const { resetRateLimitStoresForTests, setSharedRateLimitBackendForTests } = await import(
  "../src/lib/api-rate-limit.ts"
);
const { GET, PUT } = await import("../src/app/api/wallet/vault/route.ts");
const { GET: wrapKey } = await import("../src/app/api/wallet/vault/wrap-key/route.ts");
const {
  WALLET_VAULT_READ_ACCOUNT_MAX,
  WALLET_VAULT_READ_IP_MAX,
  WALLET_VAULT_WRAP_ACCOUNT_MAX,
  WALLET_VAULT_WRAP_FAILURE_MAX,
  WALLET_VAULT_WRAP_FAILURE_WINDOW_MS,
  WALLET_VAULT_WRAP_IP_MAX,
  WALLET_VAULT_WRITE_ACCOUNT_MAX,
  WALLET_VAULT_WRITE_IP_MAX,
  WALLET_VAULT_WRITE_WINDOW_MS,
  checkWalletVaultReadLimit,
  checkWalletVaultWrapKeyDelivery,
  checkWalletVaultWriteLimit,
  walletVaultIpRateLimitKey,
} = await import("../src/lib/wallet-vault-rate-limit.ts");
const {
  recordWalletVaultAccess,
  checkDurableWrapKeyRateLimit,
  checkDurableWrapKeyRateLimitDetail,
  reserveWalletVaultWrapKeyAttempt,
} = await import("../src/lib/wallet-vault-access-log.ts");
const { checkDurableRateLimitDetail, resetDurableRateLimitForTests } = await import(
  "../src/lib/durable-rate-limit.ts"
);

const db = await getDbReady();
const languages = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

function vaultRequest(path, method = "GET", body) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("wallet vault rate limit", { concurrency: false }, () => {
before(() => {
  setSharedRateLimitBackendForTests(null);
});

beforeEach(() => {
  resetRateLimitStoresForTests();
  setSharedRateLimitBackendForTests(null);
});

async function user(id) {
  await db.insert(schema.users).values({ id }).onConflictDoNothing();
}

test("ten returning sign-ins (GET vault, then wrap-key) are not rate limited, and further vault reads still succeed", async () => {
  assert.ok(WALLET_VAULT_READ_ACCOUNT_MAX > 20);
  const userId = "vault-rl-sign-in";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };

  for (let i = 1; i <= 10; i += 1) {
    const read = await GET(vaultRequest("/api/wallet/vault"));
    assert.notEqual(read.status, 429, `sign-in ${i} vault read`);
    const key = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
    assert.notEqual(key.status, 429, `sign-in ${i} wrap-key`);
    assert.equal(key.status, 200, `sign-in ${i} wrap-key`);
  }

  // Ten sign-ins of GET+wrap-key are exactly the old shared cap of 20. Reads have their
  // own higher budget, so more vault reads in the same window must still succeed.
  for (let i = 0; i < 15; i += 1) {
    const read = await GET(vaultRequest("/api/wallet/vault"));
    assert.notEqual(read.status, 429, `follow-up vault read ${i}`);
  }
});

test("a vault read 429 carries Retry-After and {error, retryAfter}", async () => {
  const userId = "vault-rl-retry-after";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  for (let i = 0; i < WALLET_VAULT_READ_ACCOUNT_MAX; i += 1) {
    const ok = await GET(vaultRequest("/api/wallet/vault"));
    assert.notEqual(ok.status, 429);
  }
  const limited = await GET(vaultRequest("/api/wallet/vault"));
  assert.equal(limited.status, 429);
  const retryAfter = limited.headers.get("Retry-After");
  assert.match(retryAfter ?? "", /^[1-9]\d*$/);
  const body = await limited.json();
  assert.deepEqual(body, { error: "rate_limited", retryAfter: Number(retryAfter) });
});

test("wrap-key 429 carries Retry-After", async () => {
  const userId = "vault-rl-wrap-retry";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  const route = "wallet/vault/wrap-key";
  for (let i = 0; i < WALLET_VAULT_WRAP_FAILURE_MAX; i += 1) {
    await recordWalletVaultAccess({ userId, route, outcome: "reauth_required" });
  }
  const limited = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
  assert.equal(limited.status, 429);
  const retryAfter = Number(limited.headers.get("Retry-After"));
  // The ceiling is 15 minutes. A zone-less timestamp parsed as local time collapses this to 1.
  assert.ok(retryAfter >= 890 && retryAfter <= 900, `Retry-After ${retryAfter}`);
  const body = await limited.json();
  assert.equal(body.error, "rate_limited");
  assert.equal(body.retryAfter, retryAfter);
});

test("wrap-key failures are cut at the previous per-user ceiling and a vault read does not reset them", async () => {
  assert.equal(WALLET_VAULT_WRAP_FAILURE_MAX, 30);
  assert.equal(WALLET_VAULT_WRAP_FAILURE_WINDOW_MS, 15 * 60 * 1000);
  const userId = "vault-rl-failures";
  await user(userId);
  const route = "wallet/vault/wrap-key";
  for (let i = 0; i < WALLET_VAULT_WRAP_FAILURE_MAX; i += 1) {
    const allowed = await checkDurableWrapKeyRateLimit(userId, route, WALLET_VAULT_WRAP_FAILURE_MAX, 15 * 60 * 1000);
    assert.equal(allowed, true, `failure ${i} still inside the ceiling`);
    await recordWalletVaultAccess({ userId, route, outcome: "reauth_required" });
  }
  assert.equal(
    await checkDurableWrapKeyRateLimit(userId, route, WALLET_VAULT_WRAP_FAILURE_MAX, 15 * 60 * 1000),
    false,
  );

  await recordWalletVaultAccess({ userId, route: "wallet/vault", outcome: "ok" });
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  const read = await GET(vaultRequest("/api/wallet/vault"));
  assert.notEqual(read.status, 429);
  assert.equal(
    await checkDurableWrapKeyRateLimit(userId, route, WALLET_VAULT_WRAP_FAILURE_MAX, 15 * 60 * 1000),
    false,
    "a successful vault read must not clear wrap-key failures",
  );
});

test("a successful wrap-key counts toward the ceiling and does not reopen it", async () => {
  const userId = "vault-rl-no-reset";
  await user(userId);
  const route = "wallet/vault/wrap-key";
  for (let i = 0; i < WALLET_VAULT_WRAP_FAILURE_MAX - 1; i += 1) {
    await recordWalletVaultAccess({ userId, route, outcome: "ok" });
  }
  assert.equal(
    await checkDurableWrapKeyRateLimit(userId, route, WALLET_VAULT_WRAP_FAILURE_MAX, WALLET_VAULT_WRAP_FAILURE_WINDOW_MS),
    true,
  );
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  const ok = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
  assert.equal(ok.status, 200);
  assert.equal(
    await checkDurableWrapKeyRateLimit(userId, route, WALLET_VAULT_WRAP_FAILURE_MAX, WALLET_VAULT_WRAP_FAILURE_WINDOW_MS),
    false,
    "the successful delivery stays inside the same ceiling",
  );
  const again = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
  assert.equal(again.status, 429);
});

test("Retry-After waits for the attempt that still fills the ceiling, not the oldest row", async () => {
  const userId = "vault-rl-boundary";
  await user(userId);
  const route = "wallet/vault/wrap-key";
  const max = WALLET_VAULT_WRAP_FAILURE_MAX;
  const windowMs = WALLET_VAULT_WRAP_FAILURE_WINDOW_MS;
  for (let i = 0; i < max + 10; i += 1) {
    await recordWalletVaultAccess({ userId, route, outcome: "reauth_required" });
  }
  const rows = await db
    .select({ id: schema.walletVaultAccessLogs.id })
    .from(schema.walletVaultAccessLogs)
    .where(eq(schema.walletVaultAccessLogs.userId, userId));
  assert.equal(rows.length, max + 10);
  const now = Date.now();
  for (let i = 0; i < rows.length; i += 1) {
    const ageMs = i < max - 1 ? 1_000 : i === max - 1 ? 10 * 60 * 1000 : 14 * 60 * 1000;
    await db
      .update(schema.walletVaultAccessLogs)
      .set({ createdAt: new Date(now - ageMs) })
      .where(eq(schema.walletVaultAccessLogs.id, rows[i].id));
  }
  const verdict = await checkDurableWrapKeyRateLimitDetail(userId, route, max, windowMs);
  assert.equal(verdict.allowed, false);
  // 10 minutes old inside a 15 minute window is about 300s. The oldest row would report about 60s.
  assert.ok(
    verdict.retryAfterSeconds >= 290 && verdict.retryAfterSeconds <= 310,
    `retry ${verdict.retryAfterSeconds}`,
  );
});

test("parallel reserves cannot both take the last wrap-key slot", async () => {
  const userId = "vault-rl-race";
  await user(userId);
  const route = "wallet/vault/wrap-key";
  const [first, second] = await Promise.all([
    reserveWalletVaultWrapKeyAttempt({ userId, route, maxPerWindow: 1, windowMs: 60_000 }),
    reserveWalletVaultWrapKeyAttempt({ userId, route, maxPerWindow: 1, windowMs: 60_000 }),
  ]);
  const allowed = [first, second].filter((row) => row.allowed);
  assert.equal(allowed.length, 1);
  const denied = [first, second].find((row) => !row.allowed);
  assert.ok(denied);
  assert.ok(denied.retryAfterSeconds >= 1 && denied.retryAfterSeconds <= 60);
});

test("wrap-key fails closed when the access log cannot be written", async () => {
  const userId = "vault-rl-log-missing-user";
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  const res = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "unavailable");
  assert.equal(body.wrapKeyHex, undefined);
});

test("wrap-key delivery stays capped at the previous 20 per 5 minutes", async () => {
  assert.equal(WALLET_VAULT_WRAP_ACCOUNT_MAX, 20);
  const userId = "vault-rl-delivery-cap";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  for (let i = 0; i < WALLET_VAULT_WRAP_ACCOUNT_MAX; i += 1) {
    const res = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
    assert.equal(res.status, 200, `delivery ${i}`);
  }
  const limited = await wrapKey(vaultRequest("/api/wallet/vault/wrap-key"));
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get("Retry-After") ?? "", /^[1-9]\d*$/);
});

test("vault writes have their own budget and a 429 carries Retry-After", async () => {
  assert.ok(WALLET_VAULT_WRITE_ACCOUNT_MAX >= 5 && WALLET_VAULT_WRITE_ACCOUNT_MAX <= 30);
  const userId = "vault-rl-write";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  for (let i = 0; i < WALLET_VAULT_WRITE_ACCOUNT_MAX; i += 1) {
    const res = await PUT(vaultRequest("/api/wallet/vault", "PUT", {}));
    assert.notEqual(res.status, 429, `write ${i}`);
  }
  const limited = await PUT(vaultRequest("/api/wallet/vault", "PUT", {}));
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get("Retry-After") ?? "", /^[1-9]\d*$/);
  const body = await limited.json();
  assert.equal(body.error, "rate_limited");
  assert.equal(body.retryAfter, Number(limited.headers.get("Retry-After")));
});

test("responses already marked rate_limited do not extend the wrap-key block", async () => {
  const userId = "vault-rl-no-extend";
  await user(userId);
  const route = "wallet/vault/wrap-key";
  for (let i = 0; i < 3; i += 1) {
    await recordWalletVaultAccess({ userId, route, outcome: "reauth_required" });
  }
  assert.equal(await checkDurableWrapKeyRateLimit(userId, route, 3, 60_000), false);
  for (let i = 0; i < 5; i += 1) {
    await recordWalletVaultAccess({ userId, route, outcome: "rate_limited" });
  }
  await db
    .delete(schema.walletVaultAccessLogs)
    .where(and(eq(schema.walletVaultAccessLogs.userId, userId), eq(schema.walletVaultAccessLogs.outcome, "reauth_required")));
  assert.equal(
    await checkDurableWrapKeyRateLimit(userId, route, 3, 60_000),
    true,
    "rate_limited rows alone must not keep the block after the failures age out",
  );
});

test("the write address cap is independent of the account cap and a rejection does not spend it", async () => {
  assert.equal(WALLET_VAULT_WRITE_IP_MAX, 1000);
  const egress = "egress-write";
  for (let i = 0; i < WALLET_VAULT_WRITE_IP_MAX; i += 1) {
    const verdict = await checkWalletVaultWriteLimit(`write-user-${i}`, egress);
    assert.equal(verdict.allowed, true, `write ${i}`);
  }
  for (let i = 0; i < WALLET_VAULT_WRITE_ACCOUNT_MAX; i += 1) {
    const denied = await checkWalletVaultWriteLimit("write-victim", egress);
    assert.equal(denied.allowed, false, `victim denial ${i}`);
  }
  const moved = await checkWalletVaultWriteLimit("write-victim", "egress-write-other");
  assert.equal(moved.allowed, true);
});

test("wrap-key delivery keeps a per-address cap and skips an unknown address", async () => {
  assert.equal(WALLET_VAULT_WRAP_IP_MAX, 1000);
  const seen = [];
  setSharedRateLimitBackendForTests(async (namespace) => {
    seen.push(namespace);
    return true;
  });
  await checkWalletVaultWrapKeyDelivery("wrap-unknown", "unknown");
  assert.equal(seen.includes("wallet-vault-wrap-key-ip"), false);

  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  const egress = "egress-wrap";
  for (let i = 0; i < WALLET_VAULT_WRAP_IP_MAX; i += 1) {
    const verdict = await checkWalletVaultWrapKeyDelivery(`wrap-user-${i}`, egress);
    assert.equal(verdict.allowed, true, `wrap ${i}`);
  }
  const blocked = await checkWalletVaultWrapKeyDelivery("wrap-victim", egress);
  assert.equal(blocked.allowed, false);
  const moved = await checkWalletVaultWrapKeyDelivery("wrap-victim", "egress-wrap-other");
  assert.equal(moved.allowed, true);
});

test("vault routes forward the client address to a durable limiter", async () => {
  await resetDurableRateLimitForTests("wallet-vault-read");
  await resetDurableRateLimitForTests("wallet-vault-read-ip");
  await resetDurableRateLimitForTests("wallet-vault-write");
  await resetDurableRateLimitForTests("wallet-vault-write-ip");
  await resetDurableRateLimitForTests("wallet-vault-wrap-key");
  await resetDurableRateLimitForTests("wallet-vault-wrap-key-ip");
  let durableCalls = 0;
  setSharedRateLimitBackendForTests(async (namespace, subject, max, windowMs) => {
    durableCalls += 1;
    return checkDurableRateLimitDetail(namespace, subject, max, windowMs);
  });
  const userId = "vault-rl-durable-route";
  await user(userId);
  globalThis.__walletVaultTestSession = { user: { id: userId }, authTime: Date.now() };
  const previous = process.env.TRUST_PROXY_HEADERS;
  process.env.TRUST_PROXY_HEADERS = "1";
  // TEST-NET (RFC 5737). clientIp only accepts a real address literal.
  const address = "192.0.2.10";
  try {
    const read = await GET(
      new Request("http://localhost/api/wallet/vault", { headers: { "x-real-ip": address } }),
    );
    assert.equal(read.status, 404);
    for (let i = 0; i < WALLET_VAULT_WRITE_ACCOUNT_MAX; i += 1) {
      const res = await PUT(
        vaultRequest("/api/wallet/vault", "PUT", {}),
      );
      // vaultRequest has no address header, so this loop spends the account bucket only.
      assert.notEqual(res.status, 429, `durable write ${i}`);
    }
    const limited = await PUT(vaultRequest("/api/wallet/vault", "PUT", {}));
    assert.equal(limited.status, 429);
    assert.ok(durableCalls >= WALLET_VAULT_WRITE_ACCOUNT_MAX);
    const retryAfter = Number(limited.headers.get("Retry-After"));
    assert.ok(retryAfter >= 1 && retryAfter <= WALLET_VAULT_WRITE_WINDOW_MS / 1000);

    const seen = [];
    setSharedRateLimitBackendForTests(async (namespace, subject) => {
      seen.push([namespace, subject]);
      return { allowed: false, retryAfterSeconds: 12 };
    });
    resetRateLimitStoresForTests();
    const wrapped = await wrapKey(
      new Request("http://localhost/api/wallet/vault/wrap-key", { headers: { "x-real-ip": address } }),
    );
    assert.equal(wrapped.status, 429);
    assert.equal(wrapped.headers.get("Retry-After"), "12");
    assert.deepEqual(seen[0], ["wallet-vault-wrap-key-ip", address]);
    assert.equal(
      seen.some(([namespace]) => namespace === "wallet-vault-wrap-key"),
      false,
    );
  } finally {
    if (previous === undefined) delete process.env.TRUST_PROXY_HEADERS;
    else process.env.TRUST_PROXY_HEADERS = previous;
    setSharedRateLimitBackendForTests(null);
  }
});

test("an unknown client address does not merge accounts into one per-IP bucket", async () => {
  assert.equal(walletVaultIpRateLimitKey("unknown"), null);
  assert.equal(walletVaultIpRateLimitKey(""), null);
  assert.equal(walletVaultIpRateLimitKey("shared-egress"), "shared-egress");

  const seen = [];
  setSharedRateLimitBackendForTests(async (namespace) => {
    seen.push(namespace);
    return true;
  });
  await checkWalletVaultReadLimit("account-a", "unknown");
  await checkWalletVaultReadLimit("account-b", "unknown");
  assert.equal(seen.some((namespace) => namespace.endsWith("-ip")), false);

  setSharedRateLimitBackendForTests(null);
  resetRateLimitStoresForTests();
  let denied = 0;
  for (let i = 0; i < WALLET_VAULT_READ_IP_MAX + 1; i += 1) {
    const verdict = await checkWalletVaultReadLimit(`egress-user-${i}`, "shared-egress");
    if (!verdict.allowed) denied += 1;
  }
  assert.equal(denied, 1);
});

test("wallet sign-in copy names the wait in every locale", () => {
  for (const lang of languages) {
    const copy = JSON.parse(
      readFileSync(new URL(`../src/lib/locales/surfaces/wallet-ux-${lang}.json`, import.meta.url), "utf8"),
    );
    assert.match(copy.signInRateLimited, /\{minutes\}/, lang);
    if (lang !== "en") assert.notEqual(copy.signInRateLimited, JSON.parse(
      readFileSync(new URL("../src/lib/locales/surfaces/wallet-ux-en.json", import.meta.url), "utf8"),
    ).signInRateLimited);
  }
});

test("the sign-in card reuses the vault it already fetched and shows the rate-limit wait", () => {
  const signIn = readFileSync(
    new URL("../src/components/wallet/WalletWeb3AuthSignIn.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(signIn.includes("fetchVaultRecordClient"), false);
  assert.match(signIn, /formatSignInRateLimited/);
  assert.match(signIn, /vault/);
  const bridge = readFileSync(
    new URL("../src/components/wallet/CloudWalletSessionBridge.tsx", import.meta.url),
    "utf8",
  );
  assert.match(signIn, /finishConnect\(user\.id, user\.email, \{ vault/);
  assert.match(signIn, /fetchWrapKey\(/);
  assert.match(signIn, /errorFrom\(/);
  assert.match(signIn, /cloudSessionMayRestore\(cloudRateLimitedUntil\(\)\)/);
  assert.match(signIn, /finishConnect\(user\.id, user\.email, \{ session/);
  assert.match(signIn, /isWalletCloudErrorCode\(err, "reauth_required"\)/);
  assert.match(bridge, /cloudSessionMayRestore\(cloudRateLimitedUntil\(\)\)/);
  assert.match(bridge, /fetchVaultRecord/);
  assert.match(bridge, /unlockCloudVaultSession/);
  assert.match(bridge, /invalid_ciphertext/);
  assert.match(bridge, /address_mismatch/);
  assert.equal(bridge.includes("ensureCloudWalletSession"), false);
});
});
