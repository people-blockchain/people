#!/usr/bin/env node
// Real-chain governance check (testnet only): submits one text proposal and votes Yes on it,
// using the exact same tx builder the /governance page uses.
//
//   E2E_WALLET_KEY_FILE=/path/to/key node --experimental-strip-types scripts/gov-e2e.mjs
//
// The key file holds a single 0x-prefixed secp256k1 private key. Its contents are never
// logged, printed, or written anywhere other than into the in-memory signer.
//
// This node's REST gateway doesn't expose `GET /cosmos/tx/v1beta1/txs/{hash}` (confirmed: it
// 404s even right after a successful broadcast), so inclusion is confirmed by polling the
// signer's account sequence instead, and the submitted proposal is found by listing proposals
// and matching on proposer + title rather than reading it out of tx events.

import { readFileSync } from "node:fs";
import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  fetchAccount,
  fetchProposal,
  fetchProposals,
  fetchVote,
  fetchVotingParams,
  simulateTx,
  broadcastTx,
  pollForSequenceIncrease,
} from "../src/lib/gov/rest.ts";
import { buildSignedSubmitProposalTx, buildSignedVoteTx, voterAddressFromSigner, VoteOption } from "../src/lib/gov/tx.ts";
import { gasLimitWithMargin, feeForGasLimit } from "../src/lib/gov/fee.ts";

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const CHAIN_ID = "people_97401-1";
const DEFAULT_SIMULATE_GAS = BigInt(250_000);
const PROPOSAL_TITLE = "Testnet governance check";
const PROPOSAL_SUMMARY = "Automated E2E check that proposal submission and voting work end-to-end on testnet.";
const PROPOSAL_METADATA = "gov-e2e-script";

function readSigner() {
  const keyFile = process.env.E2E_WALLET_KEY_FILE;
  if (!keyFile) {
    throw new Error("E2E_WALLET_KEY_FILE is required");
  }
  const privateKey = readFileSync(keyFile, "utf8").trim();
  const privateKeyBytes = secp.etc.hexToBytes(privateKey.replace(/^0x/i, ""));
  const publicKey = secp.etc.bytesToHex(secp.getPublicKey(privateKeyBytes, true));
  return { privateKey, publicKey };
}

/** Signs and broadcasts via (simulate for real gas, then build+sign again at that gas), waiting for the signer's sequence to move past `beforeSequence`. */
async function signBroadcastAndWait(voter, beforeSequence, buildTx) {
  const draftTx = buildTx(DEFAULT_SIMULATE_GAS, feeForGasLimit(DEFAULT_SIMULATE_GAS));
  const simulated = await simulateTx(draftTx).catch(() => ({ gasUsed: DEFAULT_SIMULATE_GAS }));
  const gasLimit = gasLimitWithMargin(simulated.gasUsed);
  const finalTx = buildTx(gasLimit, feeForGasLimit(gasLimit));
  const broadcast = await broadcastTx(finalTx);
  if (broadcast.code !== 0) {
    throw new Error(`broadcast rejected (code ${broadcast.code}): ${broadcast.rawLog}`);
  }
  console.log(`  tx hash: ${broadcast.txHash}`);
  const account = await pollForSequenceIncrease(voter, beforeSequence);
  console.log(`  included: sequence ${beforeSequence} -> ${account.sequence}`);
  return account;
}

async function main() {
  const signer = readSigner();
  const voter = voterAddressFromSigner(signer);
  console.log(`Voter address: ${voter}`);

  const params = await fetchVotingParams();
  const minDeposit = params.params?.min_deposit ?? [{ denom: "appl", amount: "10000000" }];
  console.log(`Min deposit: ${minDeposit.map((c) => `${c.amount}${c.denom}`).join(",")}`);

  console.log("1. Submitting text proposal...");
  const accountBefore = await fetchAccount(voter);
  if (!accountBefore) throw new Error(`account not found on-chain: ${voter}`);

  await signBroadcastAndWait(voter, accountBefore.sequence, (gasLimit, feeAmount) =>
    buildSignedSubmitProposalTx({
      signer,
      title: PROPOSAL_TITLE,
      summary: PROPOSAL_SUMMARY,
      metadata: PROPOSAL_METADATA,
      initialDeposit: minDeposit,
      sequence: accountBefore.sequence,
      accountNumber: accountBefore.accountNumber,
      chainId: CHAIN_ID,
      gasLimit,
      feeAmount,
    })
  );

  const proposals = await fetchProposals();
  const submitted = proposals.find((p) => p.proposer === voter && p.title === PROPOSAL_TITLE);
  if (!submitted) {
    throw new Error(`submitted proposal not found in /cosmos/gov/v1/proposals (proposer=${voter}, title=${JSON.stringify(PROPOSAL_TITLE)})`);
  }
  const proposalId = submitted.id;
  console.log(`  proposal id: ${proposalId}`);

  const proposal = await fetchProposal(proposalId);
  if (proposal.title !== PROPOSAL_TITLE) {
    throw new Error(`proposal ${proposalId} title mismatch: got ${JSON.stringify(proposal.title)}`);
  }
  console.log(`  confirmed via REST: status=${proposal.status}`);

  console.log("2. Voting Yes on the proposal...");
  const accountAfterSubmit = await fetchAccount(voter);
  if (!accountAfterSubmit) throw new Error(`account not found on-chain: ${voter}`);

  await signBroadcastAndWait(voter, accountAfterSubmit.sequence, (gasLimit, feeAmount) =>
    buildSignedVoteTx({
      signer,
      proposalId: BigInt(proposalId),
      option: VoteOption.VOTE_OPTION_YES,
      sequence: accountAfterSubmit.sequence,
      accountNumber: accountAfterSubmit.accountNumber,
      chainId: CHAIN_ID,
      gasLimit,
      feeAmount,
    })
  );

  const vote = await fetchVote(proposalId, voter);
  if (!vote || vote.options[0]?.option !== "VOTE_OPTION_YES") {
    throw new Error(`vote not confirmed via REST: ${JSON.stringify(vote)}`);
  }
  console.log(`  confirmed via REST: vote=${vote.options[0].option}`);

  console.log(`\nOK: proposal #${proposalId} submitted and voted Yes by ${voter}.`);
}

main().catch((err) => {
  console.error(`gov-e2e failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
