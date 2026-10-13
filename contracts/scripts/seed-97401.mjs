#!/usr/bin/env node
/**
 * Idempotent testnet seed for Cosmos EVM 97401 (demo tokens, pools, NFTs).
 * Requires: TESTNET_DEPLOYER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY, contracts/deployments/97401.json
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  getAddress,
  isAddress,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeContractWithGas } from "./evm-tx-utils.mjs";
import { discoverSeedState, discoverPoolPair } from "./seed-97401-discover.mjs";
import { parseMaxPools, parsePpl, seedMinPpl } from "./seed-97401-budget.mjs";
import {
  collectionFromReceipt,
  isUsableCollection,
  nftMintedFromReceipt,
  peopleNftAbi,
  readNextTokenIdSafe,
  waitForReceiptRetry,
  isOutOfGas,
  waitForVerifiedCollection,
} from "./seed-97401-nft.mjs";

// The 97401 node's eth_estimateGas badly under-estimates calls that deploy contracts
// (createToken ~1.25M, a curve buy that migrates to the AMM ~1.76M, addLiquidityETH creating a
// pair), so the generic 500k floor runs out of gas and the tx reverts. Use a 3M floor for those.
const HEAVY_GAS = { fallback: 3_000_000n, minGas: 3_000_000n };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "seed-97401-manifest.json");
const DEPLOYED = join(ROOT, "deployments", "97401.json");
const REPORT = join(ROOT, "deployments", "seed-97401-report.json");
const SITE_ASSETS = join(ROOT, "..", "website", "src", "data", "evm-seed-assets.json");

const peopleChain = (rpc) => ({
  id: 97401,
  name: "People Cosmos EVM",
  nativeCurrency: { name: "People", symbol: "PPL", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});

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

const bondingCurveAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "minTokensOut", type: "uint256" },
    ],
    outputs: [],
  },
];

const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

/** Gas for NftFactory.createCollection (deploys PeopleNFT); estimate often fails on slow RPC. */
// createCollection deploys a full ERC721URIStorage (~2M gas incl. code deposit). Escalate on out-of-gas.
const NFT_CREATE_COLLECTION_GAS = [
  { minGas: 3_000_000n, fallback: 6_000_000n },
  { minGas: 8_000_000n, fallback: 8_000_000n },
];

const FOUNDER_AIRDROP_WALLETS = 10_000;
const FOUNDER_AIRDROP_PER_TOKEN = 100;

const DEMO_DISTRIBUTOR_ADDRESS = "0x25d2DE6aBC3Eb704C534dc86Fe7eFC1438329EC4";
const DEMO_DISTRIBUTOR_PER_TOKEN = 1_000_000n;
const DEMO_DISTRIBUTOR_ASSET_IDS = new Set([
  "trosc3",
  "tpitp3",
  "tmark3",
  "tkrda2",
  "tmem2",
  "tgood2",
]);

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
];

const ammFactoryAbi = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
];

const pairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const nftFactoryAbi = [
  {
    type: "function",
    name: "isCollection",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "createCollection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
    ],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      { name: "collection", type: "address" },
      { name: "tokenURI", type: "string" },
    ],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "mintFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

function tokenBaseUnits(amount, decimals = 6) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  const scale = 10 ** decimals;
  return BigInt(Math.round(n * scale));
}

function expectedSupplyBase(asset) {
  return tokenBaseUnits(asset.totalSupply, asset.decimals ?? 6);
}

async function readTokenTotalSupply(publicClient, token) {
  if (!token || !isAddress(token)) return null;
  try {
    return await publicClient.readContract({
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "totalSupply",
    });
  } catch {
    return null;
  }
}

async function tokenMatchesManifestSupply(publicClient, token, asset) {
  const onChain = await readTokenTotalSupply(publicClient, token);
  if (onChain == null) return false;
  return onChain === expectedSupplyBase(asset);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function faucetFund(faucetUrl, address, amountPpl) {
  const url = `${faucetUrl.replace(/\/$/, "")}/fund`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, amount: String(amountPpl) }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) {
    return { rateLimited: true, body };
  }
  if (!res.ok && !body?.ok) {
    throw new Error(`faucet failed: ${res.status} ${JSON.stringify(body)}`);
  }
  return { rateLimited: false, body };
}

async function ensureDeployerBalance(publicClient, account, faucetUrl, minWei) {
  let bal = await publicClient.getBalance({ address: account.address });
  if (bal >= minWei) return bal;
  const needPpl = Math.ceil(Number(formatEther(minWei - bal)) + 50);
  const chunks = Math.min(4, Math.max(1, Math.ceil(needPpl / 500)));
  const perChunk = Math.ceil(needPpl / chunks);
  for (let i = 0; i < chunks; i++) {
    const fund = await faucetFund(faucetUrl, account.address, perChunk);
    if (fund.rateLimited) {
      bal = await publicClient.getBalance({ address: account.address });
      if (bal >= minWei) return bal;
      console.warn("faucet rate limited (429); continuing with current balance");
      break;
    }
    await sleep(8000);
    bal = await publicClient.getBalance({ address: account.address });
    if (bal >= minWei) return bal;
  }
  bal = await publicClient.getBalance({ address: account.address });
  if (bal < minWei) {
    throw new Error(`deployer ${account.address} balance ${formatEther(bal)} PPL < ${formatEther(minWei)}`);
  }
  return bal;
}

async function pairHasLiquidity(publicClient, pair, wppl) {
  if (!pair || pair === zeroAddress) return false;
  const [r0, r1] = await publicClient.readContract({
    address: pair,
    abi: pairAbi,
    functionName: "getReserves",
  });
  const token0 = await publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" });
  const wpplLower = wppl.toLowerCase();
  const native = token0.toLowerCase() === wpplLower ? r0 : r1;
  return native > 0n;
}

async function ensurePool({
  publicClient,
  walletClient,
  account,
  token,
  wppl,
  ammFactory,
  bondingCurve,
  router,
  maxCurveSpendWei,
  fallbackPoolPpl,
}) {
  let pair = await publicClient.readContract({
    address: ammFactory,
    abi: ammFactoryAbi,
    functionName: "getPair",
    args: [token, wppl],
  });
  if (await pairHasLiquidity(publicClient, pair, wppl)) {
    return getAddress(pair);
  }

  let spent = 0n;
  const chunk = parseEther("3");
  while (spent < maxCurveSpendWei) {
    const hash = await writeContractWithGas(publicClient, walletClient, {
      address: bondingCurve,
      abi: bondingCurveAbi,
      functionName: "buy",
      args: [token, 0n],
      value: chunk,
    }, HEAVY_GAS);
    const buyReceipt = await publicClient.waitForTransactionReceipt({ hash });
    if (buyReceipt.status !== "success") throw new Error(`bonding buy reverted: ${hash}`);
    spent += chunk;
    pair = await publicClient.readContract({
      address: ammFactory,
      abi: ammFactoryAbi,
      functionName: "getPair",
      args: [token, wppl],
    });
    if (await pairHasLiquidity(publicClient, pair, wppl)) {
      return getAddress(pair);
    }
  }

  const bal = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const tokenAmt = bal / 20n;
  const pplAmt = parseEther(String(fallbackPoolPpl));
  if (tokenAmt <= 0n || pplAmt <= 0n) {
    throw new Error(`cannot seed pool for ${token}: no creator tokens`);
  }
  await writeContractWithGas(publicClient, walletClient, {
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [router, tokenAmt],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const hash = await writeContractWithGas(publicClient, walletClient, {
    address: router,
    abi: routerAbi,
    functionName: "addLiquidityETH",
    args: [token, tokenAmt, 0n, 0n, account.address, deadline],
    value: pplAmt,
  }, HEAVY_GAS);
  const liqReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (liqReceipt.status !== "success") throw new Error(`addLiquidityETH reverted: ${hash}`);
  pair = await publicClient.readContract({
    address: ammFactory,
    abi: ammFactoryAbi,
    functionName: "getPair",
    args: [token, wppl],
  });
  return getAddress(pair);
}

async function readPoolReserves(publicClient, pair, wppl, token, decimals) {
  const [r0, r1] = await publicClient.readContract({
    address: pair,
    abi: pairAbi,
    functionName: "getReserves",
  });
  const token0 = await publicClient.readContract({ address: pair, abi: pairAbi, functionName: "token0" });
  const wpplLower = wppl.toLowerCase();
  const tokenLower = token.toLowerCase();
  const tokenIs0 = token0.toLowerCase() === tokenLower;
  const tokenReserve = Number(tokenIs0 ? r0 : r1) / 10 ** decimals;
  const nativeReserve = Number(tokenIs0 ? r1 : r0) / 1e18;
  return { tokenReserve, nativeReserve };
}

function jsonStringify(value) {
  return `${JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}\n`;
}

async function fundDemoDistributor({
  publicClient,
  walletClient,
  account,
  manifest,
  assetMap,
  actions,
  deployed,
}) {
  const distributorAddr = getAddress(DEMO_DISTRIBUTOR_ADDRESS);
  for (const asset of manifest.assets ?? []) {
    if (!DEMO_DISTRIBUTOR_ASSET_IDS.has(asset.assetId)) continue;
    const token = assetMap[asset.assetId];
    if (!token || !isAddress(token)) continue;
    const decimals = asset.decimals ?? 6;
    const target = DEMO_DISTRIBUTOR_PER_TOKEN * 10n ** BigInt(decimals);
    const distBal = await publicClient.readContract({
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [distributorAddr],
    });
    if (distBal >= target) {
      actions.push({ kind: "skipDemoDistributorFund", assetId: asset.assetId });
      continue;
    }
    const shortfall = target - distBal;
    const deployerBal = await publicClient.readContract({
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (deployerBal < shortfall) {
      console.warn(
        `deployer lacks ${asset.assetId} for demo distributor (need ${shortfall}, have ${deployerBal})`,
      );
      continue;
    }
    const hash = await writeContractWithGas(publicClient, walletClient, {
      address: getAddress(token),
      abi: erc20Abi,
      functionName: "transfer",
      args: [distributorAddr, shortfall],
    });
    await waitForReceiptRetry(publicClient, hash);
    actions.push({
      kind: "fundDemoDistributor",
      assetId: asset.assetId,
      amount: shortfall.toString(),
      distributor: distributorAddr.toLowerCase(),
      tx: hash,
    });
  }
  deployed.seed = {
    ...(deployed.seed ?? {}),
    demoTokenDistributor: distributorAddr.toLowerCase(),
  };
}

function writeOutputs(deployed, manifest, siteAssetsExtra = {}) {
  writeFileSync(DEPLOYED, jsonStringify(deployed));
  const siteAssets = {
    version: manifest.version,
    assets: Object.fromEntries(
      (manifest.assets ?? []).map((a) => [
        a.assetId,
        {
          name: a.name,
          symbol: a.symbol,
          decimals: a.decimals,
          creationMetadata: a.creationMetadata,
        },
      ]),
    ),
    nfts: Object.fromEntries(
      (manifest.nfts ?? []).map((n) => [
        n.nftId,
        { name: n.name, description: n.description, imageUri: n.imageUri },
      ]),
    ),
    ...siteAssetsExtra,
  };
  writeFileSync(SITE_ASSETS, jsonStringify(siteAssets));
  copyFileSync(DEPLOYED, join(ROOT, "..", "website", "src", "data", "evm-deployments-97401.json"));
}

function assertSafeToCreate(discovery, manifest) {
  if (!discovery.ok) {
    throw new Error(
      `Discovery did not complete (no creates allowed): ${discovery.report?.error ?? "scan incomplete"}`,
    );
  }
  const manifestCount = manifest.assets?.length ?? 0;
  const factoryCreates = discovery.report?.factoryTokenCreates ?? 0;
  const missing = discovery.report?.missingAssetIds ?? [];
  const supplyMismatch = discovery.report?.supplyMismatchAssetIds ?? [];
  const needsCreate = missing.length + supplyMismatch.length;
  if (factoryCreates >= manifestCount && needsCreate > 0) {
    throw new Error(
      `Discovery found ${factoryCreates} deployer TokenCreated events but ${needsCreate} manifest assets still need tokens (missing: ${missing.join(", ") || "none"}; supply mismatch: ${supplyMismatch.join(", ") || "none"}). Aborting before new creates.`,
    );
  }
  const deployerCollections = (discovery.report?.collectionsFound ?? []).length;
  if (deployerCollections > 0 && !discovery.collection && manifest.nftCollection) {
    throw new Error(
      `Discovery found ${deployerCollections} CollectionCreated from deployer but none match "${manifest.nftCollection.name}". Aborting before new creates.`,
    );
  }
}

async function main() {
  const pk = process.env.TESTNET_DEPLOYER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk?.startsWith("0x")) throw new Error("TESTNET_DEPLOYER_PRIVATE_KEY required");
  const rpc = process.env.RPC_URL ?? "https://node.peopleblockchain.network/rpc";
  const faucetUrl = process.env.EVM_FAUCET_URL ?? "https://node.peopleblockchain.network/faucet";
  const maxCurveSpendPpl = parsePpl(process.env.SEED_MAX_CURVE_SPEND_PPL, 180, "SEED_MAX_CURVE_SPEND_PPL");
  const fallbackPoolPpl = parsePpl(process.env.SEED_FALLBACK_POOL_PPL, 20, "SEED_FALLBACK_POOL_PPL");
  const maxPools = parseMaxPools(process.env.SEED_MAX_POOLS);

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const deployed = JSON.parse(readFileSync(DEPLOYED, "utf8"));
  const factory = deployed.contracts?.tokenFactory;
  const bondingCurve = deployed.contracts?.bondingCurve;
  const router = deployed.contracts?.router;
  const wppl = deployed.contracts?.wppl;
  const ammFactory = deployed.contracts?.ammFactory;
  const nftFactory = deployed.contracts?.nftFactory;
  if (!factory || !bondingCurve || !router || !wppl || !ammFactory || !nftFactory) {
    throw new Error("97401.json missing contract addresses");
  }

  const account = privateKeyToAccount(pk);
  const transport = http(rpc);
  const publicClient = createPublicClient({ chain: peopleChain(rpc), transport });
  const walletClient = createWalletClient({ chain: peopleChain(rpc), transport, account });

  const assetCount = manifest.assets?.length ?? 0;
  const manifestAssetIds = new Set((manifest.assets ?? []).map((a) => a.assetId));
  const assetMap = {};
  for (const [assetId, addr] of Object.entries(deployed.assetMap ?? {})) {
    if (manifestAssetIds.has(assetId) && addr) assetMap[assetId] = addr;
  }
  const poolsOut = (deployed.pools ?? []).filter((p) => manifestAssetIds.has(p.tokenAssetId));
  const nftsOut = [...(deployed.nfts ?? [])];
  let collection = null;
  const collectionHint = deployed.seed?.creatorCollectiblesCollection;
  if (collectionHint && isAddress(collectionHint)) {
    if (await isUsableCollection(publicClient, nftFactory, nftFactoryAbi, collectionHint)) {
      collection = collectionHint.toLowerCase();
    }
  }
  const actions = [];
  let discoveryReport = null;
  let seedFailed = false;
  let seedError = null;

  const discoveryHints = [
    ...Object.values(deployed.assetMap ?? {}),
    ...(deployed.pools ?? []).map((p) => p.tokenAddress).filter(Boolean),
  ];

  try {
  const discovery = await discoverSeedState(publicClient, {
    deployer: account.address,
    tokenFactory: factory,
    nftFactory,
    ammFactory,
    bondingCurve,
    router,
    wppl,
    manifestAssets: manifest.assets,
    nftCollection: manifest.nftCollection,
    hintAddresses: discoveryHints,
    assetIdHints: assetMap,
    collectionHint: collection,
  });
  discoveryReport = discovery.report;

  for (const [assetId, addr] of Object.entries(discovery.assetMap)) {
    if (addr) assetMap[assetId] = addr;
  }
  if (discovery.collection) collection = discovery.collection;

  deployed.assetMap = assetMap;
  deployed.pools = poolsOut;
  deployed.seed = {
    ...(deployed.seed ?? {}),
    creatorCollectiblesCollection: collection?.toLowerCase() ?? deployed.seed?.creatorCollectiblesCollection,
    discovery: discoveryReport,
  };
  writeOutputs(deployed, manifest);

  assertSafeToCreate(discovery, manifest);

  const tokensToCreate =
    (discovery.report?.missingAssetIds?.length ?? assetCount) + (discovery.report?.supplyMismatchAssetIds?.length ?? 0);
  const poolsToCreate = (manifest.assets ?? []).filter(
    (a) => a.seedPool && !discovery.poolsByAssetId[a.assetId],
  ).length;
  const minWei = parseEther(
    String(seedMinPpl({ tokensToCreate, poolsToCreate, maxPools, maxCurveSpendPpl, fallbackPoolPpl })),
  );
  await ensureDeployerBalance(publicClient, account, faucetUrl, minWei);

  for (const asset of manifest.assets ?? []) {
    if (!asset.seedPool || !assetMap[asset.assetId]) continue;
    const pair =
      discovery.poolsByAssetId[asset.assetId] ??
      (await discoverPoolPair(publicClient, ammFactory, wppl, assetMap[asset.assetId]));
    if (!pair) continue;
    const existing = poolsOut.find((p) => p.tokenAssetId === asset.assetId);
    const { tokenReserve, nativeReserve } = await readPoolReserves(
      publicClient,
      pair,
      getAddress(wppl),
      getAddress(assetMap[asset.assetId]),
      asset.decimals ?? 6,
    );
    const poolRow = {
      poolId: pair,
      tokenAssetId: asset.assetId,
      tokenAddress: assetMap[asset.assetId],
      nativeReserve,
      tokenReserve,
      status: "active",
    };
    if (existing) Object.assign(existing, poolRow);
    else poolsOut.push(poolRow);
  }

  const createFee = await publicClient.readContract({
    address: factory,
    abi: tokenFactoryAbi,
    functionName: "tokenCreateFee",
  });

  let newPoolsSeeded = 0;
  for (const asset of manifest.assets ?? []) {
    const assetId = asset.assetId;
    let tokenAddr = assetMap[assetId];
    if (tokenAddr && isAddress(tokenAddr)) {
      const code = await publicClient.getBytecode({ address: getAddress(tokenAddr) });
      const supplyOk = await tokenMatchesManifestSupply(publicClient, tokenAddr, asset);
      if (code && code !== "0x" && supplyOk) {
        actions.push({ kind: "skipToken", assetId, token: tokenAddr });
      } else {
        if (code && code !== "0x" && !supplyOk) {
          actions.push({ kind: "rejectTokenSupply", assetId, token: tokenAddr, expected: expectedSupplyBase(asset).toString() });
        }
        tokenAddr = null;
        delete assetMap[assetId];
      }
    }
    if (!tokenAddr) {
      const onChain = discovery.assetMap[asset.assetId];
      if (onChain && (await tokenMatchesManifestSupply(publicClient, onChain, asset))) {
        tokenAddr = onChain;
        assetMap[assetId] = tokenAddr.toLowerCase();
        actions.push({ kind: "discoverToken", assetId, token: tokenAddr });
      }
    }
    if (!tokenAddr) {
      const supply = tokenBaseUnits(asset.totalSupply, asset.decimals ?? 6);
      const meta = asset.creationMetadata?.image ?? `${manifest.siteBase}/seed/${asset.assetId}.png`;
      const { request, result } = await publicClient.simulateContract({
        address: factory,
        abi: tokenFactoryAbi,
        functionName: "createToken",
        args: [asset.name, asset.symbol, asset.decimals ?? 6, supply, String(meta)],
        value: createFee,
        account,
      });
      const hash = await writeContractWithGas(publicClient, walletClient, request, HEAVY_GAS);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`createToken ${assetId} reverted: ${hash}`);
      tokenAddr = getAddress(result);
      assetMap[assetId] = tokenAddr.toLowerCase();
      actions.push({ kind: "createToken", assetId, token: tokenAddr, tx: hash });
    }

    const poolExists =
      asset.seedPool &&
      (discovery.poolsByAssetId[assetId] ||
        (await discoverPoolPair(publicClient, ammFactory, wppl, tokenAddr)));
    if (asset.seedPool && !poolExists && newPoolsSeeded >= maxPools) {
      actions.push({ kind: "deferPool", assetId, reason: `SEED_MAX_POOLS=${maxPools}` });
    } else if (asset.seedPool) {
      if (!poolExists) newPoolsSeeded++;
      const existing = poolsOut.find((p) => p.tokenAssetId === assetId);
      const pair = await ensurePool({
        publicClient,
        walletClient,
        account,
        token: getAddress(tokenAddr),
        wppl: getAddress(wppl),
        ammFactory: getAddress(ammFactory),
        bondingCurve: getAddress(bondingCurve),
        router: getAddress(router),
        maxCurveSpendWei: parseEther(String(maxCurveSpendPpl)),
        fallbackPoolPpl: asset.poolPpl ?? fallbackPoolPpl,
      });
      const { tokenReserve, nativeReserve } = await readPoolReserves(
        publicClient,
        pair,
        getAddress(wppl),
        getAddress(tokenAddr),
        asset.decimals ?? 6,
      );
      const poolRow = {
        poolId: pair.toLowerCase(),
        tokenAssetId: assetId,
        tokenAddress: tokenAddr.toLowerCase(),
        nativeReserve,
        tokenReserve,
        status: "active",
      };
      if (existing) {
        Object.assign(existing, poolRow);
      } else {
        poolsOut.push(poolRow);
      }
      actions.push({ kind: "seedPool", assetId, pair, nativeReserve, tokenReserve });
    }
    deployed.assetMap = assetMap;
    deployed.pools = poolsOut;
    writeOutputs(deployed, manifest);
  }

  await fundDemoDistributor({
    publicClient,
    walletClient,
    account,
    manifest,
    assetMap,
    actions,
    deployed,
  });
  writeOutputs(deployed, manifest);

  if (collection && !(await isUsableCollection(publicClient, nftFactory, nftFactoryAbi, collection))) {
    collection = null;
  }

  if (!collection || !isAddress(collection)) {
    if (
      discovery.collection &&
      (await isUsableCollection(publicClient, nftFactory, nftFactoryAbi, discovery.collection))
    ) {
      collection = discovery.collection;
      actions.push({ kind: "discoverCollection", collection });
    } else {
      const { request } = await publicClient.simulateContract({
        address: nftFactory,
        abi: nftFactoryAbi,
        functionName: "createCollection",
        args: [manifest.nftCollection.name, manifest.nftCollection.symbol],
        account,
      });
      let hash;
      let receipt;
      for (let i = 0; i < NFT_CREATE_COLLECTION_GAS.length; i++) {
        hash = await writeContractWithGas(publicClient, walletClient, request, NFT_CREATE_COLLECTION_GAS[i]);
        try {
          receipt = await waitForReceiptRetry(publicClient, hash);
          break;
        } catch (err) {
          if (!isOutOfGas(err) || i === NFT_CREATE_COLLECTION_GAS.length - 1) throw err;
          console.warn(`createCollection out of gas (${err.message}); retrying with more gas`);
        }
      }
      const fromLog = collectionFromReceipt(receipt, nftFactory);
      if (!fromLog) {
        throw new Error("createCollection receipt missing CollectionCreated event");
      }
      collection = await waitForVerifiedCollection(publicClient, nftFactory, nftFactoryAbi, fromLog);
      actions.push({ kind: "createCollection", collection, tx: hash });
    }
  }

  const mintFee = await publicClient.readContract({
    address: nftFactory,
    abi: nftFactoryAbi,
    functionName: "mintFee",
  });

  let nextMintIndex = 0n;
  if (collection && isAddress(collection)) {
    nextMintIndex = await readNextTokenIdSafe(publicClient, collection);
  }

  for (let i = 0; i < (manifest.nfts ?? []).length; i++) {
    const spec = manifest.nfts[i];
    const existing = nftsOut.find((n) => n.nftId === spec.nftId);
    if (existing?.onChainTokenId != null) {
      actions.push({ kind: "skipNft", nftId: spec.nftId });
      continue;
    }
    if (nextMintIndex > BigInt(i)) {
      const tokenId = BigInt(i).toString();
      const row = {
        nftId: spec.nftId,
        collection: collection.toLowerCase(),
        onChainTokenId: tokenId,
        owner: account.address.toLowerCase(),
        creator: account.address.toLowerCase(),
        name: spec.name,
        description: spec.description,
        imageUri: spec.imageUri,
      };
      if (existing) Object.assign(existing, row);
      else nftsOut.push(row);
      actions.push({ kind: "discoverNft", nftId: spec.nftId, tokenId });
      continue;
    }
    const { request: mintRequest, result: mintResult } = await publicClient.simulateContract({
      address: nftFactory,
      abi: nftFactoryAbi,
      functionName: "mint",
      args: [getAddress(collection), spec.tokenURI ?? spec.imageUri],
      value: mintFee,
      account,
    });
    const hash = await writeContractWithGas(publicClient, walletClient, mintRequest);
    const mintReceipt = await waitForReceiptRetry(publicClient, hash);
    const fromEvent = nftMintedFromReceipt(mintReceipt, nftFactory, collection);
    let tokenId;
    if (fromEvent != null) {
      tokenId = fromEvent.toString();
    } else if (mintResult != null) {
      tokenId = BigInt(mintResult).toString();
    } else {
      const nextId = await readNextTokenIdSafe(publicClient, collection);
      tokenId = nextId > 0n ? (nextId - 1n).toString() : "0";
    }
    const row = {
      nftId: spec.nftId,
      collection: collection.toLowerCase(),
      onChainTokenId: tokenId,
      owner: account.address.toLowerCase(),
      creator: account.address.toLowerCase(),
      name: spec.name,
      description: spec.description,
      imageUri: spec.imageUri,
    };
    if (existing) Object.assign(existing, row);
    else nftsOut.push(row);
    actions.push({ kind: "mintNft", nftId: spec.nftId, tokenId, tx: hash });
    nextMintIndex = await readNextTokenIdSafe(publicClient, collection);
    deployed.nfts = nftsOut;
    deployed.seed = {
      ...(deployed.seed ?? {}),
      creatorCollectiblesCollection: collection.toLowerCase(),
    };
    writeOutputs(deployed, manifest);
  }

  const airdropPk = process.env.FOUNDERS_AIRDROP_PRIVATE_KEY;
  if (airdropPk?.startsWith("0x")) {
    const distributor = privateKeyToAccount(airdropPk);
    const distributorClient = createWalletClient({ chain: peopleChain(rpc), transport, account: distributor });
    for (const asset of manifest.assets ?? []) {
      const token = assetMap[asset.assetId];
      if (!token) continue;
      const decimals = asset.decimals ?? 6;
      const need = BigInt(FOUNDER_AIRDROP_WALLETS * FOUNDER_AIRDROP_PER_TOKEN) * 10n ** BigInt(decimals);
      const distBal = await publicClient.readContract({
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [distributor.address],
      });
      if (distBal >= need) {
        actions.push({ kind: "skipAirdropFund", assetId: asset.assetId });
        continue;
      }
      const deployerBal = await publicClient.readContract({
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      });
      const shortfall = need - distBal;
      if (deployerBal < shortfall) {
        console.warn(`deployer lacks ${asset.assetId} for airdrop reserve (need ${shortfall}, have ${deployerBal})`);
        continue;
      }
      const hash = await writeContractWithGas(publicClient, walletClient, {
        address: getAddress(token),
        abi: erc20Abi,
        functionName: "transfer",
        args: [distributor.address, shortfall],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      actions.push({ kind: "fundAirdrop", assetId: asset.assetId, amount: shortfall.toString(), tx: hash });
    }
    deployed.seed = {
      ...(deployed.seed ?? {}),
      foundersAirdropDistributor: distributor.address.toLowerCase(),
    };
  }

  deployed.rpcUrl = rpc;
  deployed.assetMap = assetMap;
  deployed.pools = poolsOut;
  deployed.nfts = nftsOut;
  deployed.seed = {
    ...(deployed.seed ?? {}),
    manifestVersion: manifest.version,
    seededAt: new Date().toISOString(),
    creatorCollectiblesCollection: collection?.toLowerCase() ?? null,
  };
  writeOutputs(deployed, manifest);

  } catch (err) {
    seedFailed = true;
    seedError = err?.message ?? String(err);
    console.error(err);
    throw err;
  } finally {
    deployed.assetMap = assetMap;
    deployed.pools = poolsOut;
    deployed.nfts = nftsOut;
    deployed.seed = {
      ...(deployed.seed ?? {}),
      creatorCollectiblesCollection: collection?.toLowerCase() ?? deployed.seed?.creatorCollectiblesCollection,
      discovery: discoveryReport,
      lastError: seedError,
    };
    try {
      writeOutputs(deployed, manifest);
    } catch (writeErr) {
      console.error("failed to write outputs:", writeErr);
    }
    writeFileSync(
      REPORT,
      jsonStringify({
        actions,
        seededAt: deployed.seed?.seededAt ?? null,
        rpc,
        failed: seedFailed,
        error: seedError,
        discovery: discoveryReport,
      }),
    );
  }

  if (!seedFailed) {
    console.log(
      `seed complete actions=${actions.length} assets=${Object.keys(assetMap).length} pools=${poolsOut.length} nfts=${nftsOut.length}`,
    );
  }
}

main().catch(() => {
  process.exit(1);
});
