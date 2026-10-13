#!/usr/bin/env node
/**
 * Submit joinValidator for a funded key against a running node.
 * Usage (from people-node, after npm run build):
 *
 *   NODE_URL=http://127.0.0.1:4001 VALIDATOR_PRIVATE_KEY=... node scripts/join-validator.mjs
 *
 * Optional: STAKE (default 100), NODE_KIND=full|light
 */
import { DEFAULT_TRANSFER_FEE, keyPairFromPrivateKey, signTransaction } from "@ovn/core";

const base = (process.env.NODE_URL ?? "http://127.0.0.1:4001").replace(/\/$/, "");
const privateKey = (process.env.VALIDATOR_PRIVATE_KEY ?? "").trim();
const stake = Number(process.env.STAKE ?? 100);
const nodeKind = process.env.NODE_KIND === "light" ? "light" : "full";

if (!privateKey) {
  throw new Error("VALIDATOR_PRIVATE_KEY is required");
}

const key = keyPairFromPrivateKey(privateKey);

async function json(path, init) {
  const res = await fetch(base + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

const health = await json("/health");
if (String(health.chainId ?? "").toLowerCase().includes("mainnet")) {
  throw new Error("refusing to joinValidator on a mainnet chainId");
}

const account = await json(`/address/${key.address}`);
const nonce = Number(account.nonce ?? 0);
const balance = Number(account.balance ?? 0);
if (balance < stake + DEFAULT_TRANSFER_FEE) {
  throw new Error(
    `insufficient balance ${balance} PPL at ${key.address}; need stake ${stake} + fee ${DEFAULT_TRANSFER_FEE}`
  );
}

const tx = signTransaction(privateKey, {
  id: `${key.address}-join-${Date.now()}`,
  from: key.address,
  to: "staking_pool",
  amount: stake,
  fee: DEFAULT_TRANSFER_FEE,
  nonce,
  timestamp: Date.now(),
  type: "joinValidator",
  payload: { nodeKind }
});

const sent = await json("/tx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(tx)
});
if (!sent.accepted) {
  throw new Error(`joinValidator rejected: ${JSON.stringify(sent)}`);
}

process.stdout.write(
  [
    `joinValidator accepted id=${tx.id}`,
    `address=${key.address}`,
    `stake=${stake} nodeKind=${nodeKind}`,
    "status starts as joining; active after warmupEpochs (2 epochs in current config).",
    "Set VALIDATOR_ADDRESS and VALIDATOR_PRIVATE_KEY on the node process, then restart.",
    ""
  ].join("\n")
);
