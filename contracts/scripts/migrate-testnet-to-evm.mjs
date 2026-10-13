#!/usr/bin/env node
/**
 * Apply ovn-export.json to a deployed Cosmos EVM chain (97401).
 * Requires: DEPLOYER_PRIVATE_KEY, funded deployer, contracts/deployments/97401.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPORT = join(ROOT, "deployments", "ovn-export.json");
const DEPLOYED = join(ROOT, "deployments", "97401.json");
const REPORT = join(ROOT, "deployments", "migration-report.json");

const peopleChain = {
  id: 97401,
  name: "People Cosmos EVM",
  nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL ?? "https://node.peopleblockchain.network/rpc"] } },
};

const tokenFactoryAbi = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "decimals", type: "uint8" },
      { name: "totalSupply", type: "uint256" },
      { name: "metadataURI", type: "string" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  { type: "function", name: "tokenCreateFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

const erc20Abi = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

const routerAbi = [
  {
    type: "function",
    name: "addLiquidityETH",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amountTokenDesired", type: "uint256" },
      { name: "amountTokenMin", type: "uint256" },
      { name: "amountETHMin", type: "uint256" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amountToken", type: "uint256" },
      { name: "amountETH", type: "uint256" },
      { name: "liquidity", type: "uint256" },
    ],
  },
  { type: "function", name: "WETH", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

function tokenBaseUnits(amount, decimals = 6) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  const scale = 10 ** decimals;
  return BigInt(Math.round(n * scale));
}

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk?.startsWith("0x")) throw new Error("DEPLOYER_PRIVATE_KEY required");
  const exportData = JSON.parse(readFileSync(EXPORT, "utf8"));
  const deployed = JSON.parse(readFileSync(DEPLOYED, "utf8"));
  const factory = deployed.contracts?.tokenFactory;
  const router = deployed.contracts?.router;
  if (!factory || !router) throw new Error("deploy contracts first (97401.json)");

  const account = privateKeyToAccount(pk);
  const transport = http(peopleChain.rpcUrls.default.http[0]);
  const publicClient = createPublicClient({ chain: peopleChain, transport });
  const walletClient = createWalletClient({ chain: peopleChain, transport, account });

  const deployerBal = await publicClient.getBalance({ address: account.address });
  if (deployerBal === 0n) {
    console.error(`deployer ${account.address} unfunded on ${peopleChain.rpcUrls.default.http[0]}`);
    process.exit(2);
  }

  const assetMap = { ...(deployed.assetMap ?? {}) };
  const poolsOut = [...(deployed.pools ?? [])];
  const actions = [];

  const userAssets = (exportData.assets ?? []).filter((a) => a.assetId !== "ppl" && a.type === "user");
  const createFee = await publicClient.readContract({ address: factory, abi: tokenFactoryAbi, functionName: "tokenCreateFee" });

  for (const asset of userAssets) {
    if (assetMap[asset.assetId]) continue;
    const supply = tokenBaseUnits(asset.totalSupply ?? 0, asset.decimals ?? 6);
    const meta = asset.creationMetadata?.image
      ? `ipfs://migration/${asset.assetId}`
      : `https://www.peopleblockchain.network/migration/${asset.assetId}`;
    const hash = await walletClient.writeContract({
      address: factory,
      abi: tokenFactoryAbi,
      functionName: "createToken",
      args: [asset.name ?? asset.assetId, asset.symbol ?? asset.assetId, asset.decimals ?? 6, supply, meta],
      value: createFee,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const created = receipt.logs.find((l) => l.topics?.length >= 2 && l.address.toLowerCase() === factory.toLowerCase());
    if (!created?.topics?.[1]) throw new Error(`TokenCreated log missing for ${asset.assetId}`);
    const token = `0x${created.topics[1].slice(-40)}`.toLowerCase();
    assetMap[asset.assetId] = token;
    actions.push({ kind: "createToken", assetId: asset.assetId, token, tx: hash });
  }

  for (const row of exportData.accounts ?? []) {
    const pplWei = parseEther(String(row.balance ?? 0));
    if (pplWei <= 0n) continue;
    const hash = await walletClient.sendTransaction({ to: row.address, value: pplWei });
    await publicClient.waitForTransactionReceipt({ hash });
    actions.push({ kind: "pplTransfer", to: row.address, amount: formatEther(pplWei), tx: hash });
  }

  for (const pool of exportData.pools ?? []) {
    const tokenAddr = assetMap[pool.tokenAssetId];
    if (!tokenAddr) continue;
    const tokenDec = userAssets.find((a) => a.assetId === pool.tokenAssetId)?.decimals ?? 6;
    const tokenAmt = tokenBaseUnits(pool.tokenReserve ?? 0, tokenDec);
    const pplAmt = parseEther(String(pool.nativeReserve ?? 0));
    if (tokenAmt <= 0n || pplAmt <= 0n) continue;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const hash = await walletClient.writeContract({
      address: router,
      abi: routerAbi,
      functionName: "addLiquidityETH",
      args: [tokenAddr, tokenAmt, 0n, 0n, account.address, deadline],
      value: pplAmt,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    poolsOut.push({
      poolId: pool.poolId,
      tokenAssetId: pool.tokenAssetId,
      tokenAddress: tokenAddr,
      nativeReserve: pool.nativeReserve,
      tokenReserve: pool.tokenReserve,
    });
    actions.push({ kind: "seedPool", poolId: pool.poolId, tx: hash });
  }

  deployed.assetMap = assetMap;
  deployed.pools = poolsOut;
  writeFileSync(DEPLOYED, `${JSON.stringify(deployed, null, 2)}\n`);
  writeFileSync(REPORT, `${JSON.stringify({ actions, exportAt: exportData.exportedAt, migratedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`migration complete actions=${actions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
