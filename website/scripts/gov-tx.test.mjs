import { test } from "node:test";
import assert from "node:assert/strict";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { MsgVote, MsgSubmitProposal } from "cosmjs-types/cosmos/gov/v1/tx.js";
import { VoteOption } from "cosmjs-types/cosmos/gov/v1/gov.js";
import { TxRaw, TxBody, SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { bech32FromEvmAddress } from "../src/lib/gov/address.ts";
import { buildSignedVoteTx, buildSignedSubmitProposalTx, voterAddressFromSigner } from "../src/lib/gov/tx.ts";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const CHAIN_ID = "people_97401-1";

test("bech32FromEvmAddress matches known vectors", () => {
  assert.equal(
    bech32FromEvmAddress("0x0000000000000000000000000000000000000000"),
    "people1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqyhc2qe"
  );
  assert.equal(
    bech32FromEvmAddress("0x1111111111111111111111111111111111111111"),
    "people1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3kf0h4t"
  );
});

test("bech32FromEvmAddress rejects malformed input", () => {
  assert.throws(() => bech32FromEvmAddress("0xnothex"));
  assert.throws(() => bech32FromEvmAddress("0x1234"));
});

function fixedSigner() {
  const privateKey = "11".repeat(32);
  const publicKey = secp.etc.bytesToHex(secp.getPublicKey(secp.etc.hexToBytes(privateKey), true));
  return { privateKey: `0x${privateKey}`, publicKey: `0x${publicKey}` };
}

test("voterAddressFromSigner derives the bech32 address from the EVM pubkey hash", () => {
  const signer = fixedSigner();
  const address = voterAddressFromSigner(signer);
  assert.match(address, /^people1[a-z0-9]+$/);
  // Same signer must always derive the same address.
  assert.equal(voterAddressFromSigner(signer), address);
});

test("buildSignedVoteTx round-trips: decoding the encoded bytes recovers the vote and a verifiable signature", () => {
  const signer = fixedSigner();
  const voter = voterAddressFromSigner(signer);
  const txBytes = buildSignedVoteTx({
    signer,
    proposalId: 7n,
    option: VoteOption.VOTE_OPTION_YES,
    sequence: 3n,
    accountNumber: 42n,
    chainId: CHAIN_ID,
    gasLimit: 200000n,
    feeAmount: [{ denom: "appl", amount: "20" }],
  });

  const txRaw = TxRaw.decode(txBytes);
  assert.equal(txRaw.signatures.length, 1);
  assert.equal(txRaw.signatures[0].length, 64, "signature must be compact 64-byte r||s");

  const body = TxBody.decode(txRaw.bodyBytes);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].typeUrl, "/cosmos.gov.v1.MsgVote");
  const msg = MsgVote.decode(body.messages[0].value);
  assert.equal(msg.proposalId, 7n);
  assert.equal(msg.voter, voter);
  assert.equal(msg.option, VoteOption.VOTE_OPTION_YES);

  const signDoc = SignDoc.encode(
    SignDoc.fromPartial({
      bodyBytes: txRaw.bodyBytes,
      authInfoBytes: txRaw.authInfoBytes,
      chainId: CHAIN_ID,
      accountNumber: 42n,
    })
  ).finish();
  const digest = keccak_256(signDoc);
  const publicKeyBytes = secp.etc.hexToBytes(signer.publicKey.replace(/^0x/, ""));
  const valid = secp.verify(txRaw.signatures[0], digest, publicKeyBytes, { prehash: false });
  assert.equal(valid, true);
});

test("buildSignedSubmitProposalTx encodes a messages-less text proposal with the given deposit", () => {
  const signer = fixedSigner();
  const proposer = voterAddressFromSigner(signer);
  const txBytes = buildSignedSubmitProposalTx({
    signer,
    title: "Testnet governance check",
    summary: "E2E check",
    metadata: "gov-e2e-script",
    initialDeposit: [{ denom: "appl", amount: "10000000" }],
    sequence: 0n,
    accountNumber: 1n,
    chainId: CHAIN_ID,
    gasLimit: 250000n,
    feeAmount: [{ denom: "appl", amount: "25" }],
  });

  const txRaw = TxRaw.decode(txBytes);
  const body = TxBody.decode(txRaw.bodyBytes);
  const msg = MsgSubmitProposal.decode(body.messages[0].value);
  assert.equal(msg.messages.length, 0);
  assert.equal(msg.proposer, proposer);
  assert.equal(msg.title, "Testnet governance check");
  assert.equal(msg.initialDeposit[0].denom, "appl");
  assert.equal(msg.initialDeposit[0].amount, "10000000");
  // x/gov's MsgServer rejects a proposal with both empty `messages` and empty `metadata`
  // (ErrNoProposalMsgs) -- a pure text proposal must carry non-empty metadata.
  assert.equal(msg.metadata, "gov-e2e-script");
});
