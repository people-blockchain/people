#!/usr/bin/env node
/**
 * Hit a running public testnet node: health, blocks, faucet, transfer, tokenCreate, nftMint.
 * Usage:
 *   NODE_URL=http://127.0.0.1:14001 DEV_FAUCET_PRIVATE_KEY=... node scripts/smoke-public-node.mjs
 */
import {
  DEFAULT_NFT_MINT_MIN_FEE,
  DEFAULT_TOKEN_CREATE_MIN_FEE,
  DEFAULT_TRANSFER_FEE,
  generateKeyPair,
  signTransaction
} from "@people/core";

const base = (process.env.NODE_URL ?? "http://127.0.0.1:14001").replace(/\/$/, "");

async function json(path, init) {
  const res = await fetch(base + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const health = await json("/health");
if (!health.ok) throw new Error("health not ok");
if (String(health.chainId ?? "").toLowerCase().includes("mainnet")) {
  throw new Error("refusing to smoke a mainnet chainId");
}

let height = 0;
for (let i = 0; i < 20; i += 1) {
  const ready = await json("/ready");
  height = Number(ready.height ?? 0);
  if (height >= 1) break;
  await sleep(1500);
}
if (height < 1) throw new Error(`blocks did not grow, height=${height}`);

const user = generateKeyPair();
const peer = generateKeyPair();
const faucet = await json("/faucet/fund", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: user.address, amount: 20 })
});
if (!faucet.ok) throw new Error("faucet failed");

await sleep(4000);
const funded = await json(`/address/${user.address}`);
if (Number(funded.balance ?? 0) < 20) throw new Error("faucet did not credit");

const send = signTransaction(user.privateKey, {
  id: `${user.address}-smoke-transfer`,
  from: user.address,
  to: peer.address,
  amount: 0.001,
  fee: DEFAULT_TRANSFER_FEE,
  nonce: Number(funded.nonce ?? 0),
  timestamp: Date.now(),
  type: "transfer"
});
const sent = await json("/tx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(send)
});
if (!sent.accepted) throw new Error("transfer rejected");

const afterSend = await json(`/address/${user.address}`);
const tokenTx = signTransaction(user.privateKey, {
  id: `${user.address}-smoke-token`,
  from: user.address,
  to: user.address,
  amount: 0,
  fee: DEFAULT_TOKEN_CREATE_MIN_FEE,
  nonce: Number(afterSend.nonce ?? 0),
  timestamp: Date.now(),
  type: "tokenCreate",
  payload: {
    name: "SmokeToken",
    symbol: "SMK",
    decimals: 6,
    totalSupply: 1_000_000,
    metadata: { description: "smoke" }
  }
});
const tokenRes = await json("/tx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(tokenTx)
});
if (!tokenRes.accepted) throw new Error("tokenCreate rejected");

const afterToken = await json(`/address/${user.address}`);
const nftTx = signTransaction(user.privateKey, {
  id: `${user.address}-smoke-nft`,
  from: user.address,
  to: "nft",
  amount: 0,
  fee: DEFAULT_NFT_MINT_MIN_FEE,
  nonce: Number(afterToken.nonce ?? 0),
  timestamp: Date.now(),
  type: "nftMint",
  payload: { name: "SmokeNft", description: "smoke", imageUri: "https://example.com/n.png" }
});
const nftRes = await json("/tx", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(nftTx)
});
if (!nftRes.accepted) throw new Error("nftMint rejected");

await sleep(4000);
const nfts = await json(`/nfts?owner=${encodeURIComponent(user.address)}`);
if (!Array.isArray(nfts) || nfts.length < 1) throw new Error("nft not listed");

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      chainId: health.chainId,
      height,
      address: user.address,
      transfer: send.id,
      token: tokenTx.id,
      nft: nftTx.id
    },
    null,
    2
  ) + "\n"
);
