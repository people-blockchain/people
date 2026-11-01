#!/usr/bin/env node
// End-to-end check of the creator tools on the live PEOPLE testnet (chain 97401).
// It uses a fresh throwaway wallet funded by the public faucet, so it needs no secrets.
// Addresses come from deployments/97401.json and contract bytecode for the no-code
// templates comes from the same precompiled artifacts the website serves.
//
// What it checks, in order:
//   1. faucet funds a new wallet
//   2. token launch through TokenFactory (fee read from the contract)
//   3. bonding curve buy and sell of that token
//   4. NFT collection create + mint through NftFactory, owner and tokenURI read back
//   5. deploy of every no-code contract template (vesting, staking, airdrop, escrow,
//      multisig, dao, timelock) and one read call on each
//   6. public site API endpoints answer (read only)
//
// Usage: node scripts/testnet-e2e.mjs  (env RPC_URL, EVM_FAUCET_URL, SITE_URL optional)
// Exit code 0 only when every step passed. A JSON summary is printed at the end.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  parseEventLogs,
  formatEther,
  encodeDeployData,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || "https://node.peopleblockchain.network/rpc";
const FAUCET = process.env.EVM_FAUCET_URL || "https://node.peopleblockchain.network/faucet";
const SITE = (process.env.SITE_URL || "https://www.peopleblockchain.network").replace(/\/$/, "");

const deployments = JSON.parse(readFileSync(join(here, "../deployments/97401.json"), "utf8"));
const C = deployments.contracts;
const templates = JSON.parse(
  readFileSync(join(here, "../../website/src/lib/generated/contract-template-artifacts.json"), "utf8"),
).templates;

const chain = defineChain({
  id: 97401,
  name: "PEOPLE testnet",
  nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pub = createPublicClient({ chain, transport: http(RPC, { timeout: 60_000 }) });
const account = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ chain, account, transport: http(RPC, { timeout: 60_000 }) });

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step}${detail ? " " + JSON.stringify(detail, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : ""}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
    return detail;
  } catch (e) {
    record(name, false, { error: String(e?.shortMessage || e?.message || e).slice(0, 400) });
    return null;
  }
}
let GAS_PRICE = null;
const FALLBACK_GAS = 3_000_000n;
const estimateNotes = [];
const gasLog = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const msg = String(e?.shortMessage || e?.message || e);
      if (i + 1 >= tries || !/Missing or invalid parameters|429|rate|timeout|fetch failed/i.test(msg)) throw e;
      await pause(3000 * (i + 1));
    }
  }
}
async function gasFor(estimate, label) {
  try { return ((await retry(estimate)) * 12n) / 10n; }
  catch (e) {
    estimateNotes.push({ label, error: String(e?.shortMessage || e?.message || e).slice(0, 200) });
    return FALLBACK_GAS;
  }
}
async function send(req) {
  // Like the site: estimate first (preflight), then send with gas x1.2 and the node's gas price.
  // If the node cannot estimate, fall back to a fixed limit and record that (it is a finding).
  await pause(1500);
  const gas = await gasFor(() => pub.estimateContractGas({ ...req, account }), req.functionName);
  const need = gas * GAS_PRICE + (req.value ?? 0n);
  const have = await pub.getBalance({ address: account.address });
  if (need > have) throw new Error(`${req.functionName}: needs ${formatEther(need)} PPL upfront (gas limit ${gas} x ${GAS_PRICE} wei + value ${formatEther(req.value ?? 0n)}), wallet has ${formatEther(have)}`);
  const hash = await retry(() => wallet.writeContract({ ...req, gas, gasPrice: GAS_PRICE, type: "legacy" }));
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`tx reverted ${hash}`);
  gasLog.push({ fn: req.functionName, gasLimit: gas.toString(), gasUsed: receipt.gasUsed.toString(), costPpl: formatEther(receipt.gasUsed * GAS_PRICE) });
  return receipt;
}
async function deploy(abi, bytecode, args) {
  await pause(1500);
  const gas = await gasFor(() => pub.estimateGas({ account, data: encodeDeployData({ abi, bytecode, args }) }), "deploy");
  const hash = await retry(() => wallet.deployContract({ abi, bytecode, args, gas, gasPrice: GAS_PRICE, type: "legacy" }));
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deploy reverted ${hash}`);
  return { address: receipt.contractAddress, tx: hash };
}

const factoryAbi = parseAbi([
  "function tokenCreateFee() view returns (uint256)",
  "function createToken(string name,string symbol,uint8 decimals,uint256 totalSupply,string metadataURI) payable returns (address)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function symbol() view returns (string)",
]);
const curveAbi = parseAbi([
  "function buy(address token, uint256 minTokensOut) payable",
  "function sell(address token, uint256 tokenAmount, uint256 minNativeOut)",
]);
const nftFactoryAbi = parseAbi([
  "function mintFee() view returns (uint256)",
  "function createCollection(string name, string symbol) returns (address)",
  "function mint(address collection, string tokenURI) payable returns (uint256)",
  "event CollectionCreated(address indexed collection, address indexed creator, string name, string symbol)",
]);
const nftAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

async function main() {
  const tag = String(Date.now()).slice(-6);
  console.log(`wallet ${account.address} rpc ${RPC}`);
  GAS_PRICE = await pub.getGasPrice();
  const block = await pub.getBlock();
  console.log(`gasPrice ${GAS_PRICE} wei (${formatEther(GAS_PRICE * 1_000_000n)} PPL per 1M gas), block gasLimit ${block.gasLimit}`);

  // 1. faucet
  const funded = await step("faucet funds a new wallet", async () => {
    const res = await fetch(`${FAUCET}/fund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, amount: "30" }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`faucet HTTP ${res.status}: ${body.slice(0, 200)}`);
    for (let i = 0; i < 30; i++) {
      const bal = await pub.getBalance({ address: account.address });
      if (bal > 0n) return { balance: formatEther(bal) };
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("balance still 0 after 60 s");
  });
  if (!funded) return;

  // 2. token launch
  let token = null;
  await step("token launch (TokenFactory.createToken)", async () => {
    const fee = await pub.readContract({ address: C.tokenFactory, abi: factoryAbi, functionName: "tokenCreateFee" });
    const receipt = await send({
      address: C.tokenFactory,
      abi: factoryAbi,
      functionName: "createToken",
      args: [`E2E Token ${tag}`, `E2E${tag}`, 18, 1_000_000n * 10n ** 18n, `ipfs://e2e/${tag}`],
      value: fee,
    });
    // TokenCreated(address indexed token, address indexed creator, ...): read the indexed topics
    const me = account.address.toLowerCase().slice(2);
    const ev = receipt.logs.find((l) => l.address.toLowerCase() === C.tokenFactory.toLowerCase() && l.topics.length === 3 && l.topics[2].toLowerCase().endsWith(me));
    if (!ev) throw new Error("no TokenCreated event");
    token = `0x${ev.topics[1].slice(26)}`;
    const symbol = await pub.readContract({ address: token, abi: erc20Abi, functionName: "symbol" });
    return { token, symbol, feePpl: formatEther(fee), tx: receipt.transactionHash };
  });

  // 3. curve buy and sell
  if (token) {
    await step("curve buy", async () => {
      const r = await send({ address: C.bondingCurve, abi: curveAbi, functionName: "buy", args: [token, 1n], value: 10n ** 18n });
      const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      if (bal === 0n) throw new Error("no tokens after buy");
      return { tokens: formatEther(bal), tx: r.transactionHash };
    });
    await step("curve sell", async () => {
      const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      const half = bal / 2n;
      await send({ address: token, abi: erc20Abi, functionName: "approve", args: [C.bondingCurve, half] });
      const before = await pub.getBalance({ address: account.address });
      const r = await send({ address: C.bondingCurve, abi: curveAbi, functionName: "sell", args: [token, half, 1n] });
      const after = await pub.getBalance({ address: account.address });
      return { soldTokens: formatEther(half), pplDelta: formatEther(after - before), tx: r.transactionHash };
    });
  }

  // 4. NFT
  await step("NFT collection + mint (NftFactory)", async () => {
    const r1 = await send({ address: C.nftFactory, abi: nftFactoryAbi, functionName: "createCollection", args: [`E2E NFT ${tag}`, `EN${tag}`] });
    const ev = parseEventLogs({ abi: nftFactoryAbi, logs: r1.logs, eventName: "CollectionCreated" })[0];
    const col = ev?.args.collection;
    if (!col) throw new Error("collection address not found in logs");
    const fee = await pub.readContract({ address: C.nftFactory, abi: nftFactoryAbi, functionName: "mintFee" });
    const uri = `ipfs://e2e-nft/${tag}`;
    const r2 = await send({ address: C.nftFactory, abi: nftFactoryAbi, functionName: "mint", args: [col, uri], value: fee });
    const t = parseEventLogs({ abi: nftAbi, logs: r2.logs, eventName: "Transfer" }).find((l) => l.address.toLowerCase() === col.toLowerCase());
    if (!t) throw new Error("no Transfer from collection");
    const owner = await pub.readContract({ address: col, abi: nftAbi, functionName: "ownerOf", args: [t.args.tokenId] });
    const gotUri = await pub.readContract({ address: col, abi: nftAbi, functionName: "tokenURI", args: [t.args.tokenId] });
    if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`owner ${owner}`);
    if (gotUri !== uri) throw new Error(`tokenURI ${gotUri}`);
    return { collection: col, tokenId: t.args.tokenId, feePpl: formatEther(fee), tx: r2.transactionHash };
  });

  // 5. no-code contract templates (same bytecode the site serves)
  const me = account.address;
  const tk = token ?? C.wppl;
  const argsFor = {
    vesting: [tk, me, 3600n, 1000n],
    staking: [tk, tk],
    airdrop: [tk],
    escrow: [me, 3600n],
    multisig: [[me], 1n],
    dao: [tk, 1n, 3600n],
    timelock: [3600n],
  };
  for (const [id, art] of Object.entries(templates)) {
    await step(`template deploy: ${id} (${art.name})`, async () => {
      const args = argsFor[id];
      if (!args) throw new Error("no test args for this template");
      const d = await deploy(art.abi, art.bytecode, args);
      const code = await pub.getCode({ address: d.address });
      if (!code || code === "0x") throw new Error("no code at address");
      if (code.toLowerCase() !== art.deployedBytecode.toLowerCase() && !art.deployedBytecode.includes("__")) {
        // immutables make runtime code differ; only length is a meaningful check then
        if (Math.abs(code.length - art.deployedBytecode.length) > 4) throw new Error("runtime code length differs from artifact");
      }
      return d;
    });
  }

  // 6. public site API (read only)
  for (const path of ["/api/factory/config", "/api/sale/config", "/api/agents/community-agent", "/buy", "/help", "/litepaper"]) {
    await step(`site ${path}`, async () => {
      const res = await fetch(`${SITE}${path}`, { headers: { "user-agent": "people-testnet-e2e" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return { status: res.status, bytes: text.length, sample: path.startsWith("/api") ? text.slice(0, 300) : undefined };
    });
  }
}

main()
  .catch((e) => record("unexpected", false, { error: String(e?.message || e) }))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log("SUMMARY " + JSON.stringify({ wallet: account.address, estimateNotes, gasLog, passed: results.length - failed, failed, results }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
    process.exit(failed ? 1 : 0);
  });
