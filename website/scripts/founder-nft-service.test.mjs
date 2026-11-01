import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, recoverTypedDataAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getFounderNftStatus, issueFounderNftSignature } from "../src/lib/founders/founder-nft-service.ts";
import { founderNftMintTypedData, founderNftRebindTypedData } from "../src/lib/founders/founder-nft-typed-data.ts";
import { buildFounderNftWalletAuthMessage } from "../src/lib/founders/founder-nft-wallet-auth.ts";

const account = privateKeyToAccount(generatePrivateKey());
const wallet = privateKeyToAccount(generatePrivateKey());
const CONTRACT = getAddress("0x0000000000000000000000000000000000000003");
const USER = wallet.address;
const OLD = getAddress("0x0000000000000000000000000000000000000002");
const PERSON = `0x${"11".repeat(32)}`;
const NOW = 1_700_000_000;
const CHAIN_ID = 97401;
const EXPIRES = new Date((NOW + 600) * 1000).toISOString();

function reader(overrides = {}) {
  return {
    tokenOfPerson: async () => 0n,
    personOf: async () => PERSON,
    ownerOf: async () => OLD,
    balanceOf: async () => 0n,
    tokenOfOwner: async () => 0n,
    pendingRebind: async () => null,
    mintDeadline: async () => BigInt(NOW + 86_400),
    signerEpoch: async () => 1n,
    totalSupply: async () => 0n,
    tokenURI: async () => null,
    ...overrides,
  };
}

function deps(overrides = {}) {
  const rows = new Map();
  let seq = 0;
  const chain = reader(overrides.reader ?? {});
  return {
    readConfig: () => ({ address: CONTRACT, chainId: CHAIN_ID }),
    readSigner: () => account,
    loadFounder: async () => ({ verificationLevel: 2, walletAddress: USER, passportWallet: null }),
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: ["stamp-a"], deduped: false }),
    findPerson: async () => ({ kind: "none" }),
    resolvePerson: async () => ({ ok: true, personId: PERSON, created: true, addedHashes: 1 }),
    chain: () => chain,
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
    reader: undefined,
  };
}

async function prove(store, userId, address = USER, chainId = CHAIN_ID, signer = wallet, expiresAt = EXPIRES) {
  const issued = store.issueWalletAuth(userId, chainId, expiresAt);
  const message = buildFounderNftWalletAuthMessage({
    address,
    nonce: issued.nonce,
    chainId: issued.chainId,
    expiresAt: issued.expiresAt,
  });
  const signature = await signer.signMessage({ message });
  return { nonce: issued.nonce, signature, chainId };
}

test("telegram-only founder gets no mint signature", async () => {
  let resolved = false;
  const store = deps({
    loadFounder: async () => ({ verificationLevel: 1, walletAddress: USER, passportWallet: null }),
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: [], deduped: false }),
    resolvePerson: async () => {
      resolved = true;
      return { ok: false, error: "no_stamps" };
    },
  });
  const result = await issueFounderNftSignature("mint", "user-telegram", USER, await prove(store, "user-telegram"), store);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpStatus, 403);
  assert.equal(result.error, "hp_required");
  assert.equal(resolved, false);
  assert.equal("signature" in result, false);
});

test("level-2 mint signature recovers to the test signer", async () => {
  const config = { address: CONTRACT, chainId: CHAIN_ID };
  const store = deps();
  const result = await issueFounderNftSignature("mint", "user-hp", USER, await prove(store, "user-hp"), store);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { signature } = result;
  assert.equal(signature.action, "mint");
  assert.equal(signature.personId, PERSON);
  assert.equal(signature.nonce, "7");
  assert.equal(signature.deadline, String(NOW + 600));
  assert.equal(signature.contract.address, CONTRACT);
  assert.equal(signature.contract.chainId, CHAIN_ID);
  const recovered = await recoverTypedDataAddress({
    ...founderNftMintTypedData(config, {
      personId: signature.personId,
      to: signature.address,
      nonce: BigInt(signature.nonce),
      deadline: BigInt(signature.deadline),
    }),
    signature: signature.signature,
  });
  assert.equal(recovered, account.address);
});

test("rebind signature recovers and a stale pending rebind is ignored", async () => {
  const config = { address: CONTRACT, chainId: CHAIN_ID };
  const shared = {
    loadFounder: async () => ({ verificationLevel: 2, walletAddress: null, passportWallet: USER }),
    findPerson: async () => ({ kind: "found", personId: PERSON }),
    reader: {
      tokenOfPerson: async () => 9n,
      ownerOf: async () => OLD,
      signerEpoch: async () => 4n,
      pendingRebind: async () => ({
        oldHolder: OLD,
        newHolder: USER,
        executeAfter: BigInt(NOW + 3_600),
        signerEpoch: 1n,
      }),
    },
  };
  const status = await getFounderNftStatus("user-hp", USER, deps(shared));
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "rebind_available");
  if (status.status.state !== "rebind_available") return;
  assert.equal(status.status.dedup, false);
  assert.equal(status.status.tokenId, "9");
  assert.equal(status.status.oldHolder, OLD);

  const store = deps(shared);
  const signed = await issueFounderNftSignature("rebind", "user-hp", USER, await prove(store, "user-hp"), store);
  assert.equal(signed.ok, true);
  if (!signed.ok) return;
  const { signature } = signed;
  assert.equal(signature.action, "rebind");
  assert.equal(signature.oldHolder, OLD);
  const recovered = await recoverTypedDataAddress({
    ...founderNftRebindTypedData(config, {
      personId: signature.personId,
      oldHolder: signature.oldHolder,
      newHolder: signature.address,
      nonce: BigInt(signature.nonce),
      deadline: BigInt(signature.deadline),
    }),
    signature: signature.signature,
  });
  assert.equal(recovered, account.address);
});

test("a pending rebind from an older signer epoch is hidden from the holder", async () => {
  const status = await getFounderNftStatus(
    "user-hp",
    USER,
    deps({
      reader: {
        tokenOfOwner: async () => 4n,
        signerEpoch: async () => 2n,
        pendingRebind: async () => ({
          oldHolder: USER,
          newHolder: OLD,
          executeAfter: BigInt(NOW + 100),
          signerEpoch: 1n,
        }),
      },
    }),
  );
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "holder");
  if (status.status.state !== "holder") return;
  assert.equal(status.status.pending, null);
  assert.equal(status.status.tokenId, "4");
});

test("missing contract or signer is a 503 and does not invent a signature", async () => {
  const noContract = await issueFounderNftSignature("mint", "user-hp", USER, null, deps({ readConfig: () => null }));
  assert.equal(noContract.ok, false);
  if (!noContract.ok) {
    assert.equal(noContract.httpStatus, 503);
    assert.equal(noContract.error, "not_configured");
    assert.equal(noContract.reason, "contract");
  }

  const status = await getFounderNftStatus("user-hp", USER, deps({ readSigner: () => null }));
  assert.equal(status.ok, true);
  if (status.ok) assert.equal(status.signerReady, false);

  const noSigner = await issueFounderNftSignature("mint", "user-hp", USER, null, deps({ readSigner: () => null }));
  assert.equal(noSigner.ok, false);
  if (!noSigner.ok) {
    assert.equal(noSigner.httpStatus, 503);
    assert.equal(noSigner.error, "not_configured");
    assert.equal(noSigner.reason, "signer");
  }
});

test("invalid address and action are rejected before a signature", async () => {
  const badAddress = await issueFounderNftSignature("mint", "user-hp", "not-an-address", null, deps());
  assert.equal(badAddress.ok, false);
  if (!badAddress.ok) {
    assert.equal(badAddress.httpStatus, 400);
    assert.equal(badAddress.error, "invalid_address");
  }

  const badAction = await issueFounderNftSignature("burn", "user-hp", USER, null, deps({ readConfig: () => { throw new Error("config"); } }));
  assert.equal(badAction.ok, false);
  if (!badAction.ok) {
    assert.equal(badAction.httpStatus, 400);
    assert.equal(badAction.error, "invalid_action");
  }
});

test("mint and rebind are rejected without a wallet signature", async () => {
  let consumed = false;
  const store = deps({
    consumeWalletAuth: async () => {
      consumed = true;
      return true;
    },
  });
  const missing = await issueFounderNftSignature("mint", "user-hp", USER, null, store);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.httpStatus, 403);
    assert.equal(missing.error, "wallet_auth_missing");
  }
  const blank = await issueFounderNftSignature("rebind", "user-hp", USER, { nonce: "n", signature: "", chainId: CHAIN_ID }, store);
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.equal(blank.error, "wallet_auth_missing");
  assert.equal(consumed, false);
});

test("a wallet signature from a different key is rejected and does not burn the nonce", async () => {
  const store = deps();
  const other = privateKeyToAccount(generatePrivateKey());
  const auth = await prove(store, "user-hp", USER, CHAIN_ID, other);
  const result = await issueFounderNftSignature("mint", "user-hp", USER, auth, store);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "wallet_auth_invalid");
  const row = await store.readWalletAuth("user-hp", auth.nonce);
  assert.equal(row.used, false);
});

test("an expired wallet nonce is rejected", async () => {
  const store = deps();
  const expiresAt = new Date((NOW - 1) * 1000).toISOString();
  const issued = store.issueWalletAuth("user-hp", CHAIN_ID, expiresAt);
  const signature = await wallet.signMessage({
    message: buildFounderNftWalletAuthMessage({ address: USER, nonce: issued.nonce, chainId: CHAIN_ID, expiresAt }),
  });
  const result = await issueFounderNftSignature(
    "mint",
    "user-hp",
    USER,
    { nonce: issued.nonce, signature, chainId: CHAIN_ID },
    store,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "wallet_auth_expired");
  assert.equal((await store.readWalletAuth("user-hp", issued.nonce)).used, false);
});

test("a wallet nonce cannot be replayed", async () => {
  const store = deps();
  const auth = await prove(store, "user-hp");
  const first = await issueFounderNftSignature("mint", "user-hp", USER, auth, store);
  assert.equal(first.ok, true);
  const second = await issueFounderNftSignature("mint", "user-hp", USER, auth, store);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.error, "wallet_auth_replayed");
});

test("a wallet signature for a different chain is rejected", async () => {
  const store = deps();
  const issued = store.issueWalletAuth("user-hp", CHAIN_ID, EXPIRES);
  const signature = await wallet.signMessage({
    message: buildFounderNftWalletAuthMessage({ address: USER, nonce: issued.nonce, chainId: 1, expiresAt: EXPIRES }),
  });
  const result = await issueFounderNftSignature(
    "rebind",
    "user-hp",
    USER,
    { nonce: issued.nonce, signature, chainId: 1 },
    store,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "wallet_auth_chain");
  assert.equal((await store.readWalletAuth("user-hp", issued.nonce)).used, false);
});

test("a new account whose stamps already belong to a minted person can only rebind", async () => {
  let resolved = false;
  const shared = {
    loadFounder: async () => ({ verificationLevel: 0, walletAddress: USER, passportWallet: null }),
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: ["stamp-a"], deduped: true }),
    findPerson: async () => ({ kind: "found", personId: PERSON }),
    resolvePerson: async () => {
      resolved = true;
      return { ok: true, personId: PERSON, created: false, addedHashes: 0 };
    },
    reader: {
      tokenOfPerson: async () => 9n,
      ownerOf: async () => OLD,
    },
  };
  const status = await getFounderNftStatus("user-new", USER, deps(shared));
  assert.equal(status.ok, true);
  if (!status.ok) return;
  assert.equal(status.status.state, "rebind_available");
  if (status.status.state !== "rebind_available") return;
  assert.equal(status.status.dedup, true);
  assert.equal(status.status.tokenId, "9");

  const store = deps(shared);
  const auth = await prove(store, "user-new");
  const mint = await issueFounderNftSignature("mint", "user-new", USER, auth, store);
  assert.equal(mint.ok, false);
  if (!mint.ok) assert.equal(mint.error, "not_available");

  const again = deps(shared);
  const rebound = await issueFounderNftSignature("rebind", "user-new", USER, await prove(again, "user-new"), again);
  assert.equal(rebound.ok, true);
  if (rebound.ok) {
    assert.equal(rebound.signature.action, "rebind");
    assert.equal(rebound.signature.oldHolder, OLD);
    assert.equal(rebound.signature.personId, PERSON);
  }
  assert.equal(resolved, false);
});
