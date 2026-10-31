import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getFounderNftStatus, issueFounderNftSignature } from "../src/lib/founders/founder-nft-service.ts";
import { buildFounderNftWalletAuthMessage } from "../src/lib/founders/founder-nft-wallet-auth.ts";

const account = privateKeyToAccount(generatePrivateKey());
const wallet = privateKeyToAccount(generatePrivateKey());
const CONTRACT = getAddress("0x0000000000000000000000000000000000000003");
const USER = wallet.address;
const OTHER = getAddress("0x0000000000000000000000000000000000000004");
const PERSON = `0x${"11".repeat(32)}`;
const NOW = 1_700_000_000;
const CHAIN_ID = 97401;
const EXPIRES = new Date((NOW + 600) * 1000).toISOString();

const ENV_KEYS = ["VERCEL_ENV", "NODE_ENV", "FOUNDER_NFT_TEST_ALLOWLIST"];

function deps(overrides = {}) {
  const rows = new Map();
  let seq = 0;
  return {
    readConfig: () => ({ address: CONTRACT, chainId: CHAIN_ID }),
    readSigner: () => account,
    loadFounder: async () => ({ verificationLevel: 1, walletAddress: USER, passportWallet: null }),
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: ["stamp-a"], deduped: false }),
    findPerson: async () => ({ kind: "none" }),
    resolvePerson: async () => ({ ok: true, personId: PERSON, created: true, addedHashes: 1 }),
    chain: () => ({
      tokenOfPerson: async () => 0n,
      personOf: async () => PERSON,
      ownerOf: async () => OTHER,
      balanceOf: async () => 0n,
      tokenOfOwner: async () => 0n,
      pendingRebind: async () => null,
      mintDeadline: async () => BigInt(NOW + 86_400),
      signerEpoch: async () => 1n,
      totalSupply: async () => 0n,
      tokenURI: async () => null,
    }),
    now: () => NOW,
    randomNonce: () => 7n,
    readWalletAuth: async (userId, nonce) => rows.get(`${userId}:${nonce}`) ?? null,
    consumeWalletAuth: async (userId, nonce) => {
      const row = rows.get(`${userId}:${nonce}`);
      if (!row || row.used) return false;
      row.used = true;
      return true;
    },
    issueWalletAuth: (userId, chainId = CHAIN_ID, expiresAt = EXPIRES) => {
      seq += 1;
      const nonce = `nonce-${seq}`;
      rows.set(`${userId}:${nonce}`, { chainId, expiresAt, used: false });
      return { nonce, expiresAt, chainId };
    },
    ...overrides,
  };
}

async function prove(store, userId) {
  const issued = store.issueWalletAuth(userId);
  const message = buildFounderNftWalletAuthMessage({
    address: USER,
    nonce: issued.nonce,
    chainId: issued.chainId,
    expiresAt: issued.expiresAt,
  });
  const signature = await wallet.signMessage({ message });
  return { nonce: issued.nonce, signature, chainId: issued.chainId };
}

async function withEnv(vars, fn) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

let tail = Promise.resolve();
function serial(name, fn) {
  test(name, () => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => {},
      () => {},
    );
    return run;
  });
}

function emptyStampDeps(overrides = {}) {
  return deps({
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: [], deduped: false }),
    resolvePerson: async (nullifiers) => {
      if (nullifiers.length === 0) return { ok: false, error: "no_stamps" };
      return { ok: true, personId: PERSON, created: true, addedHashes: nullifiers.length };
    },
    ...overrides,
  });
}

serial("allowlisted address with no stamps is eligible on testnet", async () => {
  const store = emptyStampDeps();
  const status = await withEnv(
    { VERCEL_ENV: "preview", FOUNDER_NFT_TEST_ALLOWLIST: USER },
    () => getFounderNftStatus("user-allow", USER, store),
  );
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "can_mint");

  const signed = await withEnv(
    { VERCEL_ENV: "preview", FOUNDER_NFT_TEST_ALLOWLIST: USER },
    async () => issueFounderNftSignature("mint", "user-allow", USER, await prove(store, "user-allow"), store),
  );
  assert.equal(signed.ok, true);
  if (!signed.ok) return;
  assert.equal(signed.signature.action, "mint");
  assert.equal(signed.signature.contract.chainId, CHAIN_ID);
});

serial("allowlisted address with no stamps stays not_eligible in production", async () => {
  const store = emptyStampDeps();
  const status = await withEnv(
    {
      VERCEL_ENV: "production",
      NODE_ENV: "development",
      FOUNDER_NFT_TEST_ALLOWLIST: USER,
    },
    () => getFounderNftStatus("user-allow", USER, store),
  );
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "not_eligible");
});

serial("allowlisted address with no stamps stays not_eligible on another chain", async () => {
  const store = emptyStampDeps({
    readConfig: () => ({ address: CONTRACT, chainId: 1 }),
  });
  const status = await withEnv(
    { VERCEL_ENV: "preview", FOUNDER_NFT_TEST_ALLOWLIST: USER },
    () => getFounderNftStatus("user-allow", USER, store),
  );
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "not_eligible");
});

serial("production ignores the allowlist", async () => {
  const store = deps();
  const result = await withEnv(
    {
      VERCEL_ENV: "production",
      NODE_ENV: "development",
      FOUNDER_NFT_TEST_ALLOWLIST: USER,
    },
    async () => issueFounderNftSignature("mint", "user-allow", USER, await prove(store, "user-allow"), store),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpStatus, 403);
  assert.equal(result.error, "hp_required");
});

serial("non-production chain 97401 listed address passes the level check", async () => {
  const store = deps();
  const result = await withEnv(
    {
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
      FOUNDER_NFT_TEST_ALLOWLIST: ` ${USER.toLowerCase()} , ${OTHER} `,
    },
    async () => issueFounderNftSignature("mint", "user-allow", USER, await prove(store, "user-allow"), store),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.signature.action, "mint");
  assert.equal(result.signature.contract.chainId, CHAIN_ID);
});

serial("non-production allowlist is ignored on any other chain id", async () => {
  const store = deps({
    readConfig: () => ({ address: CONTRACT, chainId: 1 }),
  });
  const result = await withEnv(
    {
      VERCEL_ENV: "preview",
      FOUNDER_NFT_TEST_ALLOWLIST: USER,
    },
    async () => issueFounderNftSignature("mint", "user-allow", USER, await prove(store, "user-allow"), store),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "hp_required");
});

serial("an unlisted address is still blocked", async () => {
  const store = deps();
  const result = await withEnv(
    {
      VERCEL_ENV: "development",
      FOUNDER_NFT_TEST_ALLOWLIST: OTHER,
    },
    async () => issueFounderNftSignature("mint", "user-allow", USER, await prove(store, "user-allow"), store),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpStatus, 403);
  assert.equal(result.error, "hp_required");
});

test("unauthenticated signature request is 401 even when the allowlist matches", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/node-test-paths.mjs",
      "--experimental-strip-types",
      "./scripts/fixtures/founder-nft-signature-anon.mjs",
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        DATABASE_URL: "postgres://unused:unused@localhost/unused",
        VERCEL_ENV: "preview",
        FOUNDER_NFT_TEST_ALLOWLIST: getAddress("0x00000000000000000000000000000000000000b2"),
        FOUNDER_NFT_ANON_ADDRESS: getAddress("0x00000000000000000000000000000000000000b2"),
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.trim().split("\n").at(-1);
  const body = JSON.parse(line);
  assert.equal(body.status, 401);
  assert.equal(body.error, "sign_in_required");
});
