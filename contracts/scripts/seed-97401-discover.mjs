import { getAddress, isAddress, zeroAddress } from "viem";
import { scanDeployerReceipts, parseReceiptEvents } from "./seed-97401-block-scan.mjs";

const erc20MetaAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

function expectedSupplyBase(asset) {
  const n = Number(asset.totalSupply);
  const decimals = asset.decimals ?? 6;
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 10 ** decimals));
}

async function tokenMatchesManifestSupply(publicClient, token, asset) {
  try {
    const onChain = await publicClient.readContract({
      address: getAddress(token),
      abi: erc20MetaAbi,
      functionName: "totalSupply",
    });
    return onChain === expectedSupplyBase(asset);
  } catch {
    return false;
  }
}

const tokenFactoryViewsAbi = [
  {
    type: "function",
    name: "isPeopleToken",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
];

const nftFactoryViewsAbi = [
  {
    type: "function",
    name: "isCollection",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
  },
];

const peopleProjectTokenAbi = [
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

const erc721MetaAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
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

export function parseDiscoveryFromBlock(envValue = process.env.SEED_DISCOVERY_FROM_BLOCK) {
  if (envValue === undefined || envValue === "") return 0n;
  const trimmed = String(envValue).trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) return BigInt(trimmed);
  return BigInt(trimmed);
}

async function tokenSymbolByAddress(publicClient, token) {
  try {
    const symbol = await publicClient.readContract({
      address: getAddress(token),
      abi: erc20MetaAbi,
      functionName: "symbol",
    });
    return String(symbol).toUpperCase();
  } catch {
    return null;
  }
}

async function pairHasLiquidity(publicClient, pair, wppl) {
  if (!pair || pair === zeroAddress) return false;
  try {
    const [r0, r1] = await publicClient.readContract({
      address: getAddress(pair),
      abi: pairAbi,
      functionName: "getReserves",
    });
    const token0 = await publicClient.readContract({
      address: getAddress(pair),
      abi: pairAbi,
      functionName: "token0",
    });
    const wpplLower = getAddress(wppl).toLowerCase();
    const native = token0.toLowerCase() === wpplLower ? r0 : r1;
    return native > 0n;
  } catch {
    return false;
  }
}

async function matchPeopleTokenByAddress(publicClient, factory, deployer, tokenAddr) {
  if (!tokenAddr || !isAddress(tokenAddr)) return null;
  const token = getAddress(tokenAddr);
  try {
    const [isPeople, onFactory, creator] = await Promise.all([
      publicClient.readContract({
        address: getAddress(factory),
        abi: tokenFactoryViewsAbi,
        functionName: "isPeopleToken",
        args: [token],
      }),
      publicClient.readContract({ address: token, abi: peopleProjectTokenAbi, functionName: "factory" }),
      publicClient.readContract({ address: token, abi: peopleProjectTokenAbi, functionName: "creator" }),
    ]);
    if (!isPeople) return null;
    if (getAddress(onFactory).toLowerCase() !== getAddress(factory).toLowerCase()) return null;
    if (getAddress(creator).toLowerCase() !== getAddress(deployer).toLowerCase()) return null;
    const symbol = await tokenSymbolByAddress(publicClient, token);
    if (!symbol) return null;
    return { token: token.toLowerCase(), symbol, blockNumber: 0n };
  } catch {
    return null;
  }
}

function sortByChainOrder(a, b) {
  const bn = a.blockNumber - b.blockNumber;
  if (bn !== 0n) return bn < 0n ? -1 : 1;
  const li = (a.logIndex ?? 0) - (b.logIndex ?? 0);
  return li < 0 ? -1 : li > 0 ? 1 : 0;
}

async function pickCanonicalToken(publicClient, wppl, ammFactory, candidates) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort(sortByChainOrder);
  for (const c of sorted) {
    const pair = await discoverPoolPair(publicClient, ammFactory, wppl, c.token);
    if (pair && (await pairHasLiquidity(publicClient, pair, wppl))) {
      return { ...c, pair, reason: "earliest_with_liquidity" };
    }
  }
  return { ...sorted[0], pair: null, reason: "earliest" };
}

async function enrichTokensFromScan(publicClient, factory, deployer, scanTokens) {
  const deployerLc = deployer.toLowerCase();
  const bySymbol = new Map();
  for (const row of scanTokens) {
    if (row.creator && row.creator !== deployerLc) continue;
    const symbol = await tokenSymbolByAddress(publicClient, row.token);
    if (!symbol) continue;
    const list = bySymbol.get(symbol) ?? [];
    list.push({ ...row, symbol, token: row.token.toLowerCase() });
    bySymbol.set(symbol, list);
  }
  return bySymbol;
}

async function matchCollectionByAddress(publicClient, nftFactory, deployer, collectionAddr, expectedName, expectedSymbol) {
  if (!collectionAddr || !isAddress(collectionAddr)) return null;
  const collection = getAddress(collectionAddr);
  try {
    const isColl = await publicClient.readContract({
      address: getAddress(nftFactory),
      abi: nftFactoryViewsAbi,
      functionName: "isCollection",
      args: [collection],
    });
    if (!isColl) return null;
    const [name, symbol] = await Promise.all([
      publicClient.readContract({ address: collection, abi: erc721MetaAbi, functionName: "name" }),
      publicClient.readContract({ address: collection, abi: erc721MetaAbi, functionName: "symbol" }),
    ]);
    if (name === expectedName && symbol === expectedSymbol) return collection.toLowerCase();
  } catch {
    /* skip */
  }
  return null;
}

const ammFactoryListAbi = [
  {
    type: "function",
    name: "allPairsLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allPairs",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
  },
];

async function discoverPoolsViaAmmFactory(publicClient, ammFactory, wppl, assetMap) {
  const out = {};
  try {
    const len = await publicClient.readContract({
      address: getAddress(ammFactory),
      abi: ammFactoryListAbi,
      functionName: "allPairsLength",
    });
    const wpplLc = getAddress(wppl).toLowerCase();
    const tokenToAsset = new Map();
    for (const [assetId, token] of Object.entries(assetMap)) {
      if (token) tokenToAsset.set(getAddress(token).toLowerCase(), assetId);
    }
    const max = Number(len > 200n ? 200n : len);
    for (let i = 0; i < max; i++) {
      const pair = await publicClient.readContract({
        address: getAddress(ammFactory),
        abi: ammFactoryListAbi,
        functionName: "allPairs",
        args: [BigInt(i)],
      });
      if (!pair || pair === zeroAddress) continue;
      const token0 = await publicClient.readContract({
        address: pair,
        abi: pairAbi,
        functionName: "token0",
      });
      const token1 = await publicClient.readContract({
        address: pair,
        abi: [{ type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
        functionName: "token1",
      });
      const t0 = getAddress(token0).toLowerCase();
      const t1 = getAddress(token1).toLowerCase();
      let projectToken = null;
      if (t0 === wpplLc && tokenToAsset.has(t1)) projectToken = t1;
      if (t1 === wpplLc && tokenToAsset.has(t0)) projectToken = t0;
      if (!projectToken) continue;
      const assetId = tokenToAsset.get(projectToken);
      const pairLc = getAddress(pair).toLowerCase();
      if (!out[assetId] || (await pairHasLiquidity(publicClient, pairLc, wppl))) {
        out[assetId] = pairLc;
      }
    }
  } catch (err) {
    console.warn("[discover] allPairs enumeration failed:", err?.message ?? err);
  }
  return out;
}

export async function discoverPoolPair(publicClient, ammFactory, wppl, token) {
  if (!token || !isAddress(token)) return null;
  const pair = await publicClient.readContract({
    address: getAddress(ammFactory),
    abi: [
      {
        type: "function",
        name: "getPair",
        stateMutability: "view",
        inputs: [{ type: "address" }, { type: "address" }],
        outputs: [{ type: "address" }],
      },
    ],
    functionName: "getPair",
    args: [getAddress(token), getAddress(wppl)],
  });
  if (!pair || pair === zeroAddress) return null;
  return getAddress(pair).toLowerCase();
}

/**
 * Full seed discovery: block scan + view hints (no eth_getLogs).
 */
export async function discoverSeedState(publicClient, params) {
  const {
    deployer,
    tokenFactory,
    nftFactory,
    ammFactory,
    bondingCurve,
    router,
    wppl,
    manifestAssets,
    nftCollection,
    hintAddresses = [],
    assetIdHints = {},
    collectionHint,
    fromBlock,
  } = params;

  const report = {
    method: "block_scan",
    scanCompleted: false,
    fromBlock: "0",
    toBlock: "0",
    blocksScanned: 0,
    deployerTxCount: 0,
    duplicates: [],
    tokensFound: [],
    collectionsFound: [],
    pairsFound: [],
    hintsUsed: [],
    error: null,
  };

  const from = fromBlock ?? parseDiscoveryFromBlock();
  let to = 0n;
  try {
    to = await publicClient.getBlockNumber();
  } catch (err) {
    report.error = `getBlockNumber: ${err?.message ?? err}`;
    return { ok: false, assetMap: {}, collection: null, poolsByAssetId: {}, report };
  }
  report.fromBlock = `0x${from.toString(16)}`;
  report.toBlock = `0x${to.toString(16)}`;

  const watch = [tokenFactory, nftFactory, bondingCurve, router, ammFactory].filter(Boolean).map(getAddress);
  const factories = {
    tokenFactory: getAddress(tokenFactory),
    nftFactory: getAddress(nftFactory),
    ammFactory: getAddress(ammFactory),
  };

  let scan;
  try {
    scan = await scanDeployerReceipts(
      publicClient,
      deployer,
      watch,
      from,
      to,
      factories,
      (p) => {
        if (p.scanned % 500n === 0n || p.scanned === p.total) {
          console.log(`[discover] blocks ${p.scanned}/${p.total} deployer txs=${p.txJobs}`);
        }
      },
    );
    report.scanCompleted = true;
    report.blocksScanned = scan.blocksScanned;
    report.deployerTxCount = scan.deployerTxCount;
    report.tokensFound = scan.tokens;
    report.collectionsFound = scan.collections;
    report.pairsFound = scan.pairs;
  } catch (err) {
    report.error = err?.message ?? String(err);
    report.scanCompleted = false;
    return { ok: false, assetMap: {}, collection: null, poolsByAssetId: {}, report };
  }

  const symbolCandidates = await enrichTokensFromScan(publicClient, tokenFactory, deployer, scan.tokens);
  const assetMap = {};
  const duplicates = [];

  for (const asset of manifestAssets ?? []) {
    const sym = String(asset.symbol).toUpperCase();
    const candidates = symbolCandidates.get(sym) ?? [];
    if (candidates.length > 1) {
      duplicates.push({
        kind: "token",
        symbol: sym,
        addresses: candidates.map((c) => c.token),
        blockNumbers: candidates.map((c) => c.blockNumber?.toString()),
      });
    }
    if (candidates.length === 1) {
      const picked = await pickCanonicalToken(publicClient, wppl, ammFactory, candidates);
      if (picked && (await tokenMatchesManifestSupply(publicClient, picked.token, asset))) {
        assetMap[asset.assetId] = picked.token;
      }
    } else if (candidates.length > 1) {
      const hint = assetIdHints[asset.assetId];
      if (hint) {
        const hintLc = String(hint).toLowerCase();
        const match = candidates.find((c) => c.token === hintLc);
        if (match && (await tokenMatchesManifestSupply(publicClient, match.token, asset))) {
          assetMap[asset.assetId] = match.token;
        }
      }
    }
  }

  for (const raw of hintAddresses) {
    if (!raw) continue;
    const hit = await matchPeopleTokenByAddress(publicClient, tokenFactory, deployer, raw);
    if (!hit) continue;
    report.hintsUsed.push(hit.token);
    for (const asset of manifestAssets ?? []) {
      const sym = String(asset.symbol).toUpperCase();
      if (sym === hit.symbol && !assetMap[asset.assetId]) {
        if (await tokenMatchesManifestSupply(publicClient, hit.token, asset)) {
          assetMap[asset.assetId] = hit.token;
        }
      }
    }
  }

  let collection = null;
  if (collectionHint) {
    collection = await matchCollectionByAddress(
      publicClient,
      nftFactory,
      deployer,
      collectionHint,
      nftCollection.name,
      nftCollection.symbol,
    );
  }

  const deployerLc = deployer.toLowerCase();
  const collectionMatches = [];
  for (const row of scan.collections) {
    if (row.creator && row.creator !== deployerLc) continue;
    const hit = await matchCollectionByAddress(
      publicClient,
      nftFactory,
      deployer,
      row.collection,
      nftCollection.name,
      nftCollection.symbol,
    );
    if (hit) collectionMatches.push({ ...row, collection: hit });
  }
  if (collectionMatches.length > 1) {
    duplicates.push({
      kind: "collection",
      name: nftCollection.name,
      addresses: collectionMatches.map((c) => c.collection),
    });
    collectionMatches.sort(sortByChainOrder);
  }
  if (!collection && collectionMatches.length > 0) {
    collection = collectionMatches[0].collection;
  }

  const poolsByAssetId = {};
  const poolsFromFactory = await discoverPoolsViaAmmFactory(publicClient, ammFactory, wppl, assetMap);
  for (const [assetId, pair] of Object.entries(poolsFromFactory)) {
    poolsByAssetId[assetId] = pair;
  }

  for (const asset of manifestAssets ?? []) {
    if (!asset.seedPool || !assetMap[asset.assetId]) continue;
    if (poolsByAssetId[asset.assetId]) continue;
    const token = assetMap[asset.assetId];
    let pair = await discoverPoolPair(publicClient, ammFactory, wppl, token);
    if (pair && !(await pairHasLiquidity(publicClient, pair, wppl))) {
      const wpplLc = getAddress(wppl).toLowerCase();
      const tokenLc = getAddress(token).toLowerCase();
      const scanPairs = scan.pairs.filter(
        (p) =>
          (p.token0 === tokenLc && p.token1 === wpplLc) || (p.token1 === tokenLc && p.token0 === wpplLc),
      );
      scanPairs.sort(sortByChainOrder);
      for (const sp of scanPairs) {
        if (await pairHasLiquidity(publicClient, sp.pair, wppl)) {
          pair = sp.pair;
          break;
        }
      }
    }
    if (pair) poolsByAssetId[asset.assetId] = pair.toLowerCase();
  }

  report.duplicates = duplicates;
  const supplyMismatchAssetIds = [];
  for (const asset of manifestAssets ?? []) {
    const token = assetMap[asset.assetId];
    if (!token) continue;
    if (!(await tokenMatchesManifestSupply(publicClient, token, asset))) {
      supplyMismatchAssetIds.push(asset.assetId);
      delete assetMap[asset.assetId];
    }
  }
  report.supplyMismatchAssetIds = supplyMismatchAssetIds;
  const manifestIds = (manifestAssets ?? []).map((a) => a.assetId);
  report.missingAssetIds = manifestIds.filter((id) => !assetMap[id]);

  const factoryTokenCreates = scan.tokens.filter((t) => !t.creator || t.creator === deployerLc).length;
  report.factoryTokenCreates = factoryTokenCreates;

  const ok = report.scanCompleted;
  return { ok, assetMap, collection, poolsByAssetId, report };
}

/** @deprecated use discoverSeedState */
export async function discoverTokensByManifest(publicClient, factory, deployer, manifestAssets, options = {}) {
  const state = await discoverSeedState(publicClient, {
    deployer,
    tokenFactory: factory,
    nftFactory: options.nftFactory ?? zeroAddress,
    ammFactory: options.ammFactory ?? zeroAddress,
    wppl: options.wppl ?? zeroAddress,
    manifestAssets,
    nftCollection: { name: "", symbol: "" },
    hintAddresses: options.hintAddresses ?? [],
    fromBlock: options.fromBlock,
  });
  return state.assetMap;
}

/** @deprecated use discoverSeedState */
export async function discoverCreatorCollectiblesCollection(
  publicClient,
  nftFactory,
  deployer,
  expectedName,
  expectedSymbol,
  options = {},
) {
  const state = await discoverSeedState(publicClient, {
    deployer,
    tokenFactory: options.tokenFactory ?? zeroAddress,
    nftFactory,
    ammFactory: options.ammFactory ?? zeroAddress,
    wppl: options.wppl ?? zeroAddress,
    manifestAssets: [],
    nftCollection: { name: expectedName, symbol: expectedSymbol },
    collectionHint: options.collectionHint,
    fromBlock: options.fromBlock,
  });
  return state.collection;
}

export { parseReceiptEvents };
