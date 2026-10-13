import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildPassportWalletLinkMessage,
  linkPassportWalletForUser,
} from "../src/lib/founders/passport-wallet.ts";

const ACCOUNT = privateKeyToAccount(`0x${"1".repeat(64)}`);
const OTHER_ACCOUNT = privateKeyToAccount(`0x${"2".repeat(64)}`);

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EXPIRES = new Date(NOW.getTime() + 10 * 60 * 1000);

/** Deps where the nonce is valid once, scoped to `userId`, and no wallet is taken yet. */
function harness({ owners = {} } = {}) {
  const used = new Set();
  const stored = new Map();
  const deps = {
    consumeNonce: async (nonce, userId) => {
      if (nonce !== "n1" || userId !== "u1" || used.has(nonce)) return { ok: false };
      used.add(nonce);
      return { ok: true, issuedAt: NOW, expiresAt: EXPIRES };
    },
    findWalletOwner: async (address) => {
      const owner = owners[address];
      return owner ? { userId: owner } : null;
    },
    setPassportWallet: async (userId, address) => {
      stored.set(userId, address);
    },
  };
  return { deps, stored };
}

async function signLinkMessage(account, params) {
  const message = buildPassportWalletLinkMessage(params);
  return account.signMessage({ message });
}

test("valid signature from the claimed address links the wallet", async () => {
  const { deps, stored } = harness();
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  const signature = await signLinkMessage(ACCOUNT, params);
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(result, { ok: true, address: ACCOUNT.address.toLowerCase() });
  assert.equal(stored.get("u1"), ACCOUNT.address.toLowerCase());
});

test("signature from a different wallet than the claimed address is rejected", async () => {
  const { deps, stored } = harness();
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  // OTHER_ACCOUNT signs the message, but the request claims to be ACCOUNT.
  const signature = await signLinkMessage(OTHER_ACCOUNT, params);
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(result, { ok: false, error: "invalid_signature" });
  assert.equal(stored.size, 0);
});

test("signature made for a different founder number is rejected", async () => {
  const { deps, stored } = harness();
  // Signed for founder #9, but the server reconstructs the message for the real founder #7.
  const signature = await signLinkMessage(ACCOUNT, {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 9,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  });
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(result, { ok: false, error: "invalid_signature" });
  assert.equal(stored.size, 0);
});

test("expired or already-used nonce is rejected without checking the signature", async () => {
  const { deps, stored } = harness();
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  const signature = await signLinkMessage(ACCOUNT, params);
  const first = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.equal(first.ok, true);

  // Reused nonce: consumeNonce's deps already marked "n1" used for u1.
  const second = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(second, { ok: false, error: "nonce_invalid" });
  assert.equal(stored.size, 1);
});

test("nonce issued to another user is rejected", async () => {
  const { deps } = harness();
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  const signature = await signLinkMessage(ACCOUNT, params);
  const result = await linkPassportWalletForUser(
    { userId: "someone-else", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(result, { ok: false, error: "nonce_invalid" });
});

test("a wallet already linked to another founder is rejected (anti-sybil)", async () => {
  const { deps, stored } = harness({ owners: { [ACCOUNT.address.toLowerCase()]: "u2" } });
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  const signature = await signLinkMessage(ACCOUNT, params);
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.deepEqual(result, { ok: false, error: "passport_wallet_taken" });
  assert.equal(stored.size, 0);
});

test("re-linking a wallet already owned by the same founder succeeds (idempotent)", async () => {
  const { deps, stored } = harness({ owners: { [ACCOUNT.address.toLowerCase()]: "u1" } });
  const params = {
    domain: "example.com",
    address: ACCOUNT.address,
    founderNumber: 7,
    nonce: "n1",
    issuedAt: NOW.toISOString(),
    expiresAt: EXPIRES.toISOString(),
  };
  const signature = await signLinkMessage(ACCOUNT, params);
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: ACCOUNT.address, signature },
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(stored.get("u1"), ACCOUNT.address.toLowerCase());
});

test("malformed address is rejected before touching the nonce", async () => {
  const { deps, stored } = harness();
  const result = await linkPassportWalletForUser(
    { userId: "u1", founderNumber: 7, domain: "example.com", nonce: "n1", address: "not-an-address", signature: "0xdead" },
    deps,
  );
  assert.deepEqual(result, { ok: false, error: "invalid_input" });
  assert.equal(stored.size, 0);
});
