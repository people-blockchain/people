import assert from "node:assert/strict";
import { test } from "node:test";
import { getAddress, recoverTypedDataAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getFounderNftStatus, issueFounderNftSignature } from "../src/lib/founders/founder-nft-service.ts";
import { founderNftMintTypedData, founderNftRebindTypedData } from "../src/lib/founders/founder-nft-typed-data.ts";

const account = privateKeyToAccount(generatePrivateKey());
const CONTRACT = getAddress("0x0000000000000000000000000000000000000003");
const USER = getAddress("0x0000000000000000000000000000000000000001");
const OLD = getAddress("0x0000000000000000000000000000000000000002");
const PERSON = `0x${"11".repeat(32)}`;
const NOW = 1_700_000_000;
const CHAIN_ID = 97401;

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
  const chain = reader(overrides.reader ?? {});
  return {
    readConfig: () => ({ address: CONTRACT, chainId: CHAIN_ID }),
    readSigner: () => account,
    loadFounder: async () => ({ verificationLevel: 2, walletAddress: USER, passportWallet: null }),
    fetchNullifiers: async () => ({ ok: true, address: USER, nullifiers: ["stamp-a"] }),
    findPerson: async () => ({ kind: "none" }),
    resolvePerson: async () => ({ ok: true, personId: PERSON, created: true, addedHashes: 1 }),
    chain: () => chain,
    now: () => NOW,
    randomNonce: () => 7n,
    ...overrides,
    reader: undefined,
  };
}

test("telegram-only founder gets no mint signature", async () => {
  let stampsRead = false;
  const result = await issueFounderNftSignature(
    "mint",
    "user-telegram",
    USER,
    deps({
      loadFounder: async () => ({ verificationLevel: 1, walletAddress: USER, passportWallet: null }),
      fetchNullifiers: async () => {
        stampsRead = true;
        return { ok: true, address: USER, nullifiers: ["stamp-a"] };
      },
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.httpStatus, 403);
  assert.equal(result.error, "hp_required");
  assert.equal(stampsRead, false);
  assert.equal("signature" in result, false);
});

test("level-2 mint signature recovers to the test signer", async () => {
  const config = { address: CONTRACT, chainId: CHAIN_ID };
  const result = await issueFounderNftSignature("mint", "user-hp", USER, deps());
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
  assert.equal(status.status.tokenId, "9");
  assert.equal(status.status.oldHolder, OLD);

  const signed = await issueFounderNftSignature("rebind", "user-hp", USER, deps(shared));
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
  const noContract = await issueFounderNftSignature("mint", "user-hp", USER, deps({ readConfig: () => null }));
  assert.equal(noContract.ok, false);
  if (!noContract.ok) {
    assert.equal(noContract.httpStatus, 503);
    assert.equal(noContract.error, "not_configured");
    assert.equal(noContract.reason, "contract");
  }

  const status = await getFounderNftStatus("user-hp", USER, deps({ readSigner: () => null }));
  assert.equal(status.ok, true);
  if (status.ok) assert.equal(status.signerReady, false);

  const noSigner = await issueFounderNftSignature("mint", "user-hp", USER, deps({ readSigner: () => null }));
  assert.equal(noSigner.ok, false);
  if (!noSigner.ok) {
    assert.equal(noSigner.httpStatus, 503);
    assert.equal(noSigner.error, "not_configured");
    assert.equal(noSigner.reason, "signer");
  }
});

test("invalid address and action are rejected before a signature", async () => {
  const badAddress = await issueFounderNftSignature("mint", "user-hp", "not-an-address", deps());
  assert.equal(badAddress.ok, false);
  if (!badAddress.ok) {
    assert.equal(badAddress.httpStatus, 400);
    assert.equal(badAddress.error, "invalid_address");
  }

  const badAction = await issueFounderNftSignature("burn", "user-hp", USER, deps({ readConfig: () => { throw new Error("config"); } }));
  assert.equal(badAction.ok, false);
  if (!badAction.ok) {
    assert.equal(badAction.httpStatus, 400);
    assert.equal(badAction.error, "invalid_action");
  }
});
