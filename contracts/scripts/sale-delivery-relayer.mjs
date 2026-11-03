#!/usr/bin/env node
// PPL sale delivery relayer.
//
// Watches `Bought` events of PplCurveHubV2 on Base and pays each purchase on the PEOPLE mainnet
// through PplSaleDistributor.deliver(purchaseId, recipient, pplOut). The distributor sends the PPL
// and credits the purchase in PplReturnBurn so it can be sold back after 30 days.
//
// Safe to restart or to run twice: every purchase id is paid at most once, and that is enforced by
// the distributor contract, not by this process. On restart it rescans from START_BLOCK.
//
// It refuses to run against the PEOPLE testnet (97401) or any chain other than
// PEOPLE_MAINNET_CHAIN_ID, and checks every address against the contracts before sending anything.
//
// Required env:
//   BASE_RPC_URL, PEOPLE_RPC_URL
//   HUB_ADDRESS            PplCurveHubV2 on Base
//   DISTRIBUTOR_ADDRESS    PplSaleDistributor on PEOPLE mainnet
//   PEOPLE_MAINNET_CHAIN_ID
//   RELAYER_PRIVATE_KEY    the distributor's `relayer` key (keep it in the host's secret store)
//   START_BLOCK            Base block of the hub deployment
// Optional env:
//   BASE_BLOCK_TAG=safe    only read Base blocks at this tag (safe | finalized | latest)
//   POLL_SECONDS=15, CHUNK_BLOCKS=2000
//   LOW_BALANCE_PPL=100000 alert when the distributor has less PPL available than this
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, or ALERT_WEBHOOK_URL (JSON {text}) for alerts
//   ONCE=1                 run one pass and exit (for tests)
//   ALLOW_TEST_CHAIN=1     allow chain 97401 (local rehearsal on anvil only)

import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseAbiItem, encodeAbiParameters, keccak256, formatEther, parseEther, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PEOPLE_TESTNET_CHAIN_ID = 97401;

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback === undefined) throw new Error(`missing env ${name}`);
    return fallback;
  }
  return v;
}

const cfg = {
  baseRpc: env("BASE_RPC_URL"),
  peopleRpc: env("PEOPLE_RPC_URL"),
  hub: getAddress(env("HUB_ADDRESS")),
  distributor: getAddress(env("DISTRIBUTOR_ADDRESS")),
  peopleChainId: Number(env("PEOPLE_MAINNET_CHAIN_ID")),
  key: env("RELAYER_PRIVATE_KEY"),
  startBlock: BigInt(env("START_BLOCK")),
  blockTag: env("BASE_BLOCK_TAG", "safe"),
  pollMs: Number(env("POLL_SECONDS", "15")) * 1000,
  chunk: BigInt(env("CHUNK_BLOCKS", "2000")),
  lowBalance: parseEther(env("LOW_BALANCE_PPL", "100000")),
  once: env("ONCE", "") === "1",
  allowTestChain: env("ALLOW_TEST_CHAIN", "") === "1",
};

const hubAbi = parseAbi([
  "function PEOPLE_CHAIN_ID() view returns (uint256)",
]);
const boughtEvent = parseAbiItem(
  "event Bought(address indexed buyer, address indexed recipient, address indexed referrer, uint256 usdcIn, uint256 toReserve, uint256 pplOut, uint256 lotId)",
);
const distAbi = parseAbi([
  "function relayer() view returns (address)",
  "function baseHub() view returns (address)",
  "function baseChainId() view returns (uint256)",
  "function paused() view returns (bool)",
  "function available() view returns (uint256)",
  "function delivered(bytes32) view returns (bool)",
  "function deliver(bytes32 purchaseId, address recipient, uint256 amount)",
]);

const log = (msg, extra) => console.log(new Date().toISOString(), msg, extra ? JSON.stringify(extra, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : "");

const recentAlerts = new Map();
async function alert(text) {
  log("ALERT " + text);
  // The same alert at most once an hour (a paused distributor would otherwise alert every pass).
  const now = Date.now();
  if (now - (recentAlerts.get(text) ?? 0) < 3600_000) return;
  recentAlerts.set(text, now);
  try {
    const tg = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
    if (tg && chat) {
      await fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: `[PPL delivery] ${text}` }),
      });
    } else if (process.env.ALERT_WEBHOOK_URL) {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `[PPL delivery] ${text}` }),
      });
    }
  } catch (e) {
    log("alert delivery failed", { error: String(e?.message || e) });
  }
}

const account = privateKeyToAccount(cfg.key.startsWith("0x") ? cfg.key : `0x${cfg.key}`);
const base = createPublicClient({ transport: http(cfg.baseRpc) });
const people = createPublicClient({ transport: http(cfg.peopleRpc) });

export function purchaseIdOf(baseChainId, hub, txHash, logIndex) {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint256" }],
    [BigInt(baseChainId), hub, txHash, BigInt(logIndex)],
  ));
}

async function preflight() {
  const peopleChain = await people.getChainId();
  const baseChain = await base.getChainId();
  if (peopleChain !== cfg.peopleChainId) throw new Error(`PEOPLE RPC is chain ${peopleChain}, expected PEOPLE_MAINNET_CHAIN_ID ${cfg.peopleChainId}`);
  if (peopleChain === PEOPLE_TESTNET_CHAIN_ID && !cfg.allowTestChain) throw new Error("refusing to deliver on the PEOPLE testnet (97401)");
  const hubPeople = await base.readContract({ address: cfg.hub, abi: hubAbi, functionName: "PEOPLE_CHAIN_ID" });
  if (Number(hubPeople) !== peopleChain) throw new Error(`hub PEOPLE_CHAIN_ID is ${hubPeople}, PEOPLE RPC is ${peopleChain}`);
  const [relayer, baseHub, baseChainId] = await Promise.all([
    people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "relayer" }),
    people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "baseHub" }),
    people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "baseChainId" }),
  ]);
  if (getAddress(relayer) !== account.address) throw new Error(`distributor relayer is ${relayer}, this key is ${account.address}`);
  if (getAddress(baseHub) !== cfg.hub) throw new Error(`distributor baseHub is ${baseHub}, HUB_ADDRESS is ${cfg.hub}`);
  if (Number(baseChainId) !== baseChain) throw new Error(`distributor baseChainId is ${baseChainId}, Base RPC is ${baseChain}`);
  log("preflight ok", { baseChain, peopleChain, hub: cfg.hub, distributor: cfg.distributor, relayer: account.address });
  return { baseChain, peopleChain };
}

let wallet;
let cursor = cfg.startBlock;
let lastLowAlert = 0;

async function pass(baseChain, peopleChain) {
  const head = (await base.getBlock({ blockTag: cfg.blockTag })).number;
  let paid = 0, skipped = 0;
  while (cursor <= head) {
    const to = cursor + cfg.chunk - 1n < head ? cursor + cfg.chunk - 1n : head;
    const logs = await base.getLogs({ address: cfg.hub, event: boughtEvent, fromBlock: cursor, toBlock: to });
    for (const l of logs) {
      const id = purchaseIdOf(baseChain, cfg.hub, l.transactionHash, l.logIndex);
      const done = await people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "delivered", args: [id] });
      if (done) { skipped++; continue; }
      const { recipient, pplOut } = l.args;
      // Stop at the first purchase that cannot be paid: the cursor stays on this chunk and the next
      // pass tries again, so purchases are paid in order and none is silently skipped.
      if (await people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "paused" })) {
        await alert(`paused: purchase ${l.transactionHash}#${l.logIndex} waits`);
        return { paid, skipped, stopped: "paused" };
      }
      try {
        await people.simulateContract({ account, address: cfg.distributor, abi: distAbi, functionName: "deliver", args: [id, recipient, pplOut] });
        const hash = await wallet.writeContract({ address: cfg.distributor, abi: distAbi, functionName: "deliver", args: [id, recipient, pplOut] });
        const r = await people.waitForTransactionReceipt({ hash, timeout: 120_000 });
        if (r.status !== "success") throw new Error(`deliver reverted ${hash}`);
        paid++;
        log("delivered", { baseTx: l.transactionHash, logIndex: l.logIndex, recipient, ppl: formatEther(pplOut), peopleTx: hash });
      } catch (e) {
        await alert(`cannot pay ${l.transactionHash}#${l.logIndex} (${formatEther(pplOut)} PPL to ${recipient}): ${String(e?.shortMessage || e?.message || e).slice(0, 200)}`);
        return { paid, skipped, stopped: "error" };
      }
    }
    cursor = to + 1n;
  }
  const avail = await people.readContract({ address: cfg.distributor, abi: distAbi, functionName: "available" });
  if (avail < cfg.lowBalance && Date.now() - lastLowAlert > 6 * 3600_000) {
    lastLowAlert = Date.now();
    await alert(`distributor has only ${formatEther(avail)} PPL available`);
  }
  return { paid, skipped, head };
}

async function main() {
  const { baseChain, peopleChain } = await preflight();
  const chain = defineChain({ id: peopleChain, name: "PEOPLE", nativeCurrency: { name: "PPL", symbol: "PPL", decimals: 18 }, rpcUrls: { default: { http: [cfg.peopleRpc] } } });
  wallet = createWalletClient({ account, chain, transport: http(cfg.peopleRpc) });
  for (;;) {
    try {
      const r = await pass(baseChain, peopleChain);
      if (r.paid || r.stopped || cfg.once) log("pass", r);
    } catch (e) {
      await alert(`pass failed: ${String(e?.shortMessage || e?.message || e).slice(0, 200)}`);
    }
    if (cfg.once) return;
    await new Promise((res) => setTimeout(res, cfg.pollMs));
  }
}

main().catch(async (e) => {
  await alert(`stopped: ${String(e?.message || e).slice(0, 300)}`);
  process.exit(1);
});
