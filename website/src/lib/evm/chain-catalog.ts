import { unstable_cache } from "next/cache";
import { getAddress, formatUnits } from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import { evmJsonRpc, evmJsonRpcBatch, resetRpcBackoffForTests } from "@/lib/evm/rpc-server";
import { curatedAssetKeys, enrichAssetRow, resolveLogicalAssetId, seedAssetMeta } from "@/lib/evm/seed-assets";

/** `TokenCreated(address,address,string,string,uint8,uint256,(uint256×5))` — pre-leftoverMode factories. */
const TOKEN_CREATED_TOPIC = "0x10911c4cd4fbfa42352cbeb31e021abbab48257dff3d94957b57da33a205d724";
/** Same event with the trailing `uint8 leftoverMode` (owner rule 2026-10-13 factories). */
const TOKEN_CREATED_LEFTOVER_TOPIC = "0xdcb5d6c49a959a42d0c67fe9b9aa48b4da6065c9f47789f71789f629d84d30f1";
const PAIR_CREATED_TOPIC = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

// ERC-20 / Uniswap-V2 selectors, spelled out so the catalog scan stays dependency-free.
const SEL_NAME = "0x06fdde03";
const SEL_SYMBOL = "0x95d89b41";
const SEL_DECIMALS = "0x313ce567";
const SEL_TOTAL_SUPPLY = "0x18160ddd";
const SEL_TOKEN0 = "0x0dfe1681";
const SEL_TOKEN1 = "0xd21220a7";
const SEL_RESERVES = "0x0902f1ac";

type RpcLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
};

export type CatalogToken = {
  assetId: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  creator: string;
  status: string;
  type: string;
  /** True only for assets with curated (seed) metadata; everything else is author-supplied. */
  verified: boolean;
  /** Curated assetId whose name/symbol this uncurated token copies, if any. */
  impersonates?: string;
};

export type CatalogPool = {
  poolId: string;
  tokenAssetId: string;
  tokenAddress: string;
  nativeReserve: number;
  tokenReserve: number;
};

/** Current + legacy (`<base>V1`, `<base>V2`, …) addresses of one contract role, current first. */
function contractVersions(dep: { contracts: Record<string, string | null> }, base: string): string[] {
  const re = new RegExp(`^${base}(V\\d+)?$`);
  return Object.entries(dep.contracts ?? {})
    .filter(([key, addr]) => re.test(key) && Boolean(addr))
    .sort(([a], [b]) => (a === base ? -1 : b === base ? 1 : a.localeCompare(b)))
    .map(([, addr]) => addr as string);
}

function topicAddress(topic: string | undefined): string {
  if (!topic || topic.length < 66) return "";
  return getAddress(`0x${topic.slice(26)}`);
}

/**
 * Cosmos EVM nodes reject eth_getLogs over more than 10,000 blocks
 * ("maximum [from, to] blocks distance: 10000"), so a single 0x1..latest query
 * threw and the whole pool/token scan came back empty on a long-running chain.
 * Scan in windows from the deployment block instead; a failed window is skipped
 * so static entries from the deployment JSON still show.
 */
export const LOG_WINDOW_BLOCKS = 9_000;

export function logWindows(fromBlock: number, latest: number, size = LOG_WINDOW_BLOCKS): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let start = Math.max(0, fromBlock); start <= latest; start += size) {
    out.push([start, Math.min(latest, start + size - 1)]);
  }
  return out;
}

function deploymentStartBlock(): number {
  const dep = readEvmDeployments();
  return typeof dep.deployBlock === "number" && dep.deployBlock > 0 ? dep.deployBlock : 1;
}

/**
 * First block that can possibly hold a log from `address`.
 *
 * The chain's first deploy is block 56, but the token/AMM factories were created around block
 * 220 450 — scanning from 56 walks ~24 windows that can never match and dominated the cold
 * catalog scan. `startBlocks` in the deployment JSON records where each contract really starts;
 * an address with no entry (an AMM pair the factory deployed, say) can only have logged after its
 * factory existed, so it falls back to the AMM factory's start block.
 */
export function logStartBlock(address: string): number {
  const dep = readEvmDeployments();
  const startBlocks = dep.startBlocks ?? {};
  const lower = address.toLowerCase();
  for (const [key, contract] of Object.entries(dep.contracts ?? {})) {
    if (!contract || contract.toLowerCase() !== lower) continue;
    const start = startBlocks[key];
    return typeof start === "number" && start > 0 ? start : deploymentStartBlock();
  }
  // Legacy pairs/tokens of the previous stack predate the current AMM factory, so fall back to
  // the earliest AMM factory start.
  const ammStarts = Object.entries(startBlocks)
    .filter(([key]) => /^ammFactory(V\d+)?$/.test(key))
    .map(([, block]) => block)
    .filter((b): b is number => typeof b === "number" && b > 0);
  return ammStarts.length ? Math.min(...ammStarts) : deploymentStartBlock();
}

/**
 * Log results for a window that sits more than a full window behind the tip can never gain new
 * entries (the chain is attested/finalised), so they are reused for a long time. The tip window is
 * always re-read, so a freshly created token or pair appears without any cache flush.
 */
const WINDOW_LOG_TTL_MS = 15 * 60_000;
const MAX_WINDOW_CACHE_ENTRIES = 400;
const windowLogsCache = new Map<string, { at: number; value: RpcLog[] }>();

/**
 * At most this many `eth_getLogs` windows are in flight per server instance, across every caller.
 * Each window is a full 9 000-block range scan on the node; firing dozens at once (one batch per
 * pair/curve/agent scan, several scans per page) is what pushed the shared validator over its
 * memory limit on 2026-10-17.
 */
export const MAX_PARALLEL_LOG_WINDOWS = 2;
let logWindowsInFlight = 0;
const logWindowQueue: Array<() => void> = [];

async function withLogWindowSlot<T>(work: () => Promise<T>): Promise<T> {
  if (logWindowsInFlight >= MAX_PARALLEL_LOG_WINDOWS) {
    await new Promise<void>((resolve) => logWindowQueue.push(resolve));
  } else {
    logWindowsInFlight++;
  }
  try {
    return await work();
  } finally {
    const next = logWindowQueue.shift();
    // Hand the slot straight to the next waiter; only free it when nobody is queued.
    if (next) next();
    else logWindowsInFlight--;
  }
}

/** Peak concurrent `eth_getLogs` windows, for tests. */
let logWindowsPeak = 0;
export function logWindowConcurrencyPeakForTests(): number {
  return logWindowsPeak;
}

function windowCacheKey(address: string, topics: Array<string | null>, from: number, to: number): string {
  return `${address.toLowerCase()}|${topics.map((topic) => topic ?? "*").join(",")}|${from}|${to}`;
}

function rememberWindowLogs(key: string, value: RpcLog[]): void {
  if (windowLogsCache.size >= MAX_WINDOW_CACHE_ENTRIES) {
    const oldest = windowLogsCache.keys().next().value;
    if (oldest !== undefined) windowLogsCache.delete(oldest);
  }
  windowLogsCache.set(key, { at: Date.now(), value });
}

function rpcLogFilter(address: string, topics: Array<string | null>, from: number, to: number) {
  return {
    address: getAddress(address),
    topics,
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
  };
}

/** Marks an error raised by the node (as opposed to the Next data cache being unavailable). */
class LogWindowRpcError extends Error {}

async function readLogWindowFromNode(address: string, topics: Array<string | null>, from: number, to: number): Promise<RpcLog[]> {
  return withLogWindowSlot(async () => {
    logWindowsPeak = Math.max(logWindowsPeak, logWindowsInFlight);
    let logs: unknown;
    try {
      logs = await evmJsonRpc<RpcLog[]>("eth_getLogs", [rpcLogFilter(address, topics, from, to)]);
    } catch (error) {
      throw new LogWindowRpcError(error instanceof Error ? error.message : "rpc_logs_failed");
    }
    // Throwing (rather than returning []) keeps a failed window out of every cache.
    if (!Array.isArray(logs)) throw new LogWindowRpcError("rpc_logs_unavailable");
    return logs as RpcLog[];
  });
}

/**
 * Immutable windows are shared across server instances/lambdas through the Next data cache, so a
 * cold instance does not re-scan history that every other instance already read. The arguments
 * (lower-cased address, topics, range) are part of the cache key.
 */
const IMMUTABLE_WINDOW_REVALIDATE_SECONDS = 24 * 60 * 60;
const readImmutableLogWindowShared = unstable_cache(readLogWindowFromNode, ["evm-log-window-v1"], {
  revalidate: IMMUTABLE_WINDOW_REVALIDATE_SECONDS,
  tags: ["evm-log-windows"],
});

async function readLogWindow(
  address: string,
  topics: Array<string | null>,
  from: number,
  to: number,
  immutable: boolean,
): Promise<RpcLog[] | null> {
  const lower = address.toLowerCase();
  if (immutable) {
    try {
      return await readImmutableLogWindowShared(lower, topics, from, to);
    } catch (error) {
      if (error instanceof LogWindowRpcError) return null;
      // Outside the Next runtime (node tests, scripts) there is no data cache: read directly.
    }
  }
  try {
    return await readLogWindowFromNode(lower, topics, from, to);
  } catch {
    return null;
  }
}

/**
 * Scans every window from the contract's first block to the tip.
 *
 * - Windows come from the per-process cache, then (for immutable windows) the shared Next data
 *   cache, and only then from the node.
 * - Node reads are capped at `MAX_PARALLEL_LOG_WINDOWS` in flight across the whole process, so a
 *   cold page render cannot fire dozens of range scans at the validator at once.
 * - `rpc-server.ts` backs off exponentially after node failures, so an unhealthy node is not
 *   hammered with retries; failed windows are simply skipped (and not cached).
 *
 * `fromBlockHint` can only move the start later (e.g. a pair's own factory start block).
 * `topics` follows the JSON-RPC log filter: `null` is a wildcard position. The window cache key
 * includes every topic, so a buy scan and a sell scan of the same address do not collide.
 */
export async function fetchLogsWindowed(
  address: string,
  topics: Array<string | null>,
  fromBlockHint?: number,
): Promise<RpcLog[]> {
  const latestHex = await evmJsonRpc<string>("eth_blockNumber", []).catch(() => "");
  const latest = latestHex ? Number.parseInt(latestHex, 16) : Number.NaN;
  if (!Number.isFinite(latest)) return [];
  const start = Math.max(logStartBlock(address), typeof fromBlockHint === "number" && fromBlockHint > 0 ? fromBlockHint : 0);
  const windows = logWindows(start, latest);
  if (!windows.length) return [];

  const now = Date.now();
  const results = await Promise.all(
    windows.map(async ([from, to]) => {
      const key = windowCacheKey(address, topics, from, to);
      const isImmutable = to < latest - LOG_WINDOW_BLOCKS;
      const entry = windowLogsCache.get(key);
      if (entry && (!isImmutable || now - entry.at < WINDOW_LOG_TTL_MS)) return entry.value;
      const logs = await readLogWindow(address, topics, from, to, isImmutable);
      if (logs) rememberWindowLogs(key, logs);
      return logs ?? [];
    }),
  );
  return results.flat();
}

const SEL_FACTORY = "0xc45a0155";

/**
 * First block worth scanning for an AMM pair: the start block of the factory that created it
 * (read via `factory()`), so a pair of the 2026-10-16 stack is not scanned from the legacy V1
 * factory's block 58. Falls back to `logStartBlock(pair)` when the factory is unknown.
 */
export async function pairLogStartBlock(pair: string): Promise<number> {
  const fallback = logStartBlock(pair);
  const out = await evmJsonRpc<string>("eth_call", [{ to: getAddress(pair), data: SEL_FACTORY }, "latest"]).catch(() => "");
  if (!out || out.length < 66) return fallback;
  const factory = `0x${out.slice(-40)}`.toLowerCase();
  const dep = readEvmDeployments();
  const known = Object.values(dep.contracts ?? {}).some((contract) => contract?.toLowerCase() === factory);
  return known ? Math.max(fallback, logStartBlock(factory)) : fallback;
}

/**
 * Decodes ABI-encoded `string` return data. Author-controlled: control characters are stripped and
 * length is capped so a token cannot spoof a catalog entry with invisible/homoglyph padding.
 */
function decodeErc20String(out: string | null | undefined): string {
  if (!out || out === "0x" || out.length < 130) return "";
  try {
    return Buffer.from(out.slice(130), "hex")
      .toString("utf8")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 64);
  } catch {
    return "";
  }
}

function decodeUint(out: string | null | undefined): bigint {
  if (!out || out === "0x") return BigInt(0);
  try {
    return BigInt(out);
  } catch {
    return BigInt(0);
  }
}

function decodeAddress(ret: string | null | undefined): string {
  if (!ret || ret === "0x" || ret.length < 66) return "";
  return getAddress(`0x${ret.slice(-40)}`);
}

/** On-chain catalog scans are expensive; the cached copy is refreshed in the background. */
const CATALOG_STALE_MS = 30_000;
const CATALOG_REVALIDATE_SECONDS = 60;
export const CHAIN_CATALOG_TAGS = ["evm-chain-catalog"];

let tokensCache: { at: number; value: CatalogToken[] } | null = null;
let poolsCache: { at: number; value: CatalogPool[] } | null = null;
let tokensRefreshing: Promise<CatalogToken[]> | null = null;
let poolsRefreshing: Promise<CatalogPool[]> | null = null;

export function resetChainCatalogCacheForTests(): void {
  tokensCache = null;
  poolsCache = null;
  tokensRefreshing = null;
  poolsRefreshing = null;
  windowLogsCache.clear();
  logWindowsPeak = 0;
  resetRpcBackoffForTests();
}

/**
 * Cross-request cache so a cold server instance (or a second Vercel lambda) does not repeat the
 * full log scan for every visitor. Sanitised by the in-process stale-while-revalidate below, which
 * guarantees no request ever *awaits* a re-scan after the first one.
 */
const scanTokensCached = unstable_cache(discoverTokensOnChainUncached, ["evm-chain-catalog-tokens-v1"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: CHAIN_CATALOG_TAGS,
});
const scanPoolsCached = unstable_cache(discoverPoolsOnChainUncached, ["evm-chain-catalog-pools-v1"], {
  revalidate: CATALOG_REVALIDATE_SECONDS,
  tags: CHAIN_CATALOG_TAGS,
});

async function discoverTokensOnChainUncached(): Promise<CatalogToken[]> {
  const dep = readEvmDeployments();
  const factory = dep.contracts.tokenFactory;
  if (!factory) return [];

  const staticMap = Object.entries(dep.assetMap ?? {});
  // Tokens launched on earlier stacks (`tokenFactoryVn`) stay on their old contracts but must
  // keep showing up in the catalog.
  const factories = contractVersions(dep, "tokenFactory");
  const fromLogs = (
    await Promise.all(
      factories.flatMap((f) => [
        fetchLogsWindowed(f, [TOKEN_CREATED_TOPIC]),
        fetchLogsWindowed(f, [TOKEN_CREATED_LEFTOVER_TOPIC]),
      ]),
    )
  ).flat();

  const tokenAddrs = new Set<string>();
  for (const [, addr] of staticMap) {
    if (addr) tokenAddrs.add(getAddress(addr).toLowerCase());
  }
  for (const log of fromLogs) {
    const t = topicAddress(log.topics?.[1]);
    if (t) tokenAddrs.add(t.toLowerCase());
  }
  const tokens = [...tokenAddrs].map((lower) => getAddress(lower));
  if (!tokens.length) return [];

  // Four reads per token, all tokens in one batch: ~0.4 s for 13 tokens where the previous
  // sequential per-token loop measured ~3.8 s.
  const metadata = await evmJsonRpcBatch<string>(
    tokens.flatMap((token) => [
      { method: "eth_call", params: [{ to: token, data: SEL_NAME }, "latest"] },
      { method: "eth_call", params: [{ to: token, data: SEL_SYMBOL }, "latest"] },
      { method: "eth_call", params: [{ to: token, data: SEL_DECIMALS }, "latest"] },
      { method: "eth_call", params: [{ to: token, data: SEL_TOTAL_SUPPLY }, "latest"] },
    ]),
  ).catch(() => tokens.flatMap(() => [null, null, null, null] as Array<string | null>));

  const rows: CatalogToken[] = tokens.map((token, index) => {
    const name = decodeErc20String(metadata[index * 4]);
    const symbol = decodeErc20String(metadata[index * 4 + 1]);
    const decimals = Number(decodeUint(metadata[index * 4 + 2])) || 18;
    const supplyWei = decodeUint(metadata[index * 4 + 3]);
    const assetId = resolveLogicalAssetId(token);
    const seed = seedAssetMeta(assetId);
    // Token metadata is permissionless: anyone can deploy a contract that calls itself
    // "People"/"PPL". Curated assets carry seed metadata, so a row whose assetId has none but
    // whose name/symbol matches a curated one is flagged instead of being presented as it.
    const impersonates = seed ? undefined : curatedAssetKeys().get((symbol || name).trim().toLowerCase());
    return enrichAssetRow({
      assetId,
      tokenAddress: token,
      name: seed?.name ?? (name || assetId.slice(0, 10)),
      symbol: seed?.symbol ?? (symbol || "TKN"),
      decimals: seed?.decimals ?? decimals,
      totalSupply: Number(formatUnits(supplyWei, decimals)),
      creator: dep.deployer ?? "0x0",
      status: "active",
      type: "token",
      verified: Boolean(seed),
      ...(impersonates && impersonates !== assetId ? { impersonates } : {}),
    });
  });
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function loadTokens(): Promise<CatalogToken[]> {
  const value = await scanTokensCached().catch(() => discoverTokensOnChainUncached());
  tokensCache = { at: Date.now(), value };
  return value;
}

export async function discoverTokensOnChain(): Promise<CatalogToken[]> {
  const cached = tokensCache;
  if (cached) {
    if (Date.now() - cached.at < CATALOG_STALE_MS) return cached.value;
    // Serve the stale catalog at once and re-scan in the background: no visitor is made to wait
    // for the full scan a second time.
    if (!tokensRefreshing) {
      tokensRefreshing = loadTokens()
        .catch(() => cached.value)
        .finally(() => {
          tokensRefreshing = null;
        });
    }
    return cached.value;
  }
  return loadTokens();
}

async function pairReserves(pair: string, wppl: string): Promise<CatalogPool | null> {
  const pairAddr = getAddress(pair);
  const wpplAddr = getAddress(wppl);
  const token0 = decodeAddress(await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_TOKEN0 }, "latest"]).catch(() => "0x"));
  const token1 = decodeAddress(await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_TOKEN1 }, "latest"]).catch(() => "0x"));
  const reservesRaw = await evmJsonRpc<string>("eth_call", [{ to: pairAddr, data: SEL_RESERVES }, "latest"]).catch(() => "0x");
  if (!token0 || !token1 || !reservesRaw || reservesRaw.length < 130) return null;
  const r0 = BigInt(`0x${reservesRaw.slice(2, 66)}`);
  const r1 = BigInt(`0x${reservesRaw.slice(66, 130)}`);
  const tokenAddr = token0.toLowerCase() === wpplAddr.toLowerCase() ? token1 : token0;
  if (tokenAddr.toLowerCase() === wpplAddr.toLowerCase()) return null;
  const decimalsOut = await evmJsonRpc<string>("eth_call", [{ to: tokenAddr, data: SEL_DECIMALS }, "latest"]).catch(() => "0x");
  const tokenDecimals = Number(decodeUint(decimalsOut)) || 6;
  const tokenReserve =
    token0.toLowerCase() === tokenAddr.toLowerCase()
      ? Number(formatUnits(r0, tokenDecimals))
      : Number(formatUnits(r1, tokenDecimals));
  const nativeReserve =
    token0.toLowerCase() === wpplAddr.toLowerCase() ? Number(r0) / 1e18 : Number(r1) / 1e18;
  return {
    poolId: pairAddr,
    tokenAssetId: resolveLogicalAssetId(tokenAddr),
    tokenAddress: tokenAddr,
    nativeReserve,
    tokenReserve,
  };
}

/**
 * Resolves many pairs in two batched phases (token0/token1/reserves, then decimals) instead of
 * four sequential round-trips per pair. Falls back to the per-pair path on a node without batch
 * support.
 */
async function pairReservesBatch(pairs: string[], wppl: string): Promise<CatalogPool[]> {
  const raw = await evmJsonRpcBatch<string>(
    pairs.flatMap((pair) => [
      { method: "eth_call", params: [{ to: pair, data: SEL_TOKEN0 }, "latest"] },
      { method: "eth_call", params: [{ to: pair, data: SEL_TOKEN1 }, "latest"] },
      { method: "eth_call", params: [{ to: pair, data: SEL_RESERVES }, "latest"] },
    ]),
  ).catch(() => null);
  if (!raw) {
    const pools: CatalogPool[] = [];
    for (const pair of pairs) {
      const row = await pairReserves(pair, wppl);
      if (row) pools.push(row);
    }
    return pools;
  }

  const wpplLower = wppl.toLowerCase();
  const drafts = pairs
    .map((pair, index) => {
      const token0 = decodeAddress(raw[index * 3]);
      const token1 = decodeAddress(raw[index * 3 + 1]);
      const reservesRaw = raw[index * 3 + 2];
      if (!token0 || !token1 || !reservesRaw || reservesRaw.length < 130) return null;
      const tokenAddr = token0.toLowerCase() === wpplLower ? token1 : token0;
      if (tokenAddr.toLowerCase() === wpplLower) return null;
      return {
        pair,
        token0,
        tokenAddr,
        r0: BigInt(`0x${reservesRaw.slice(2, 66)}`),
        r1: BigInt(`0x${reservesRaw.slice(66, 130)}`),
      };
    })
    .filter((draft): draft is NonNullable<typeof draft> => draft !== null);

  const uniqueTokens = [...new Set(drafts.map((draft) => draft.tokenAddr.toLowerCase()))].map((lower) => getAddress(lower));
  const decimalsRaw = await evmJsonRpcBatch<string>(
    uniqueTokens.map((token) => ({ method: "eth_call", params: [{ to: token, data: SEL_DECIMALS }, "latest"] })),
  ).catch(() => uniqueTokens.map(() => null as string | null));
  const decimalsByToken = new Map(
    uniqueTokens.map((token, index) => [token.toLowerCase(), Number(decodeUint(decimalsRaw[index])) || 6]),
  );

  return drafts.map(({ pair, token0, tokenAddr, r0, r1 }) => {
    const tokenDecimals = decimalsByToken.get(tokenAddr.toLowerCase()) ?? 6;
    const tokenIsToken0 = token0.toLowerCase() === tokenAddr.toLowerCase();
    return {
      poolId: pair,
      tokenAssetId: resolveLogicalAssetId(tokenAddr),
      tokenAddress: tokenAddr,
      tokenReserve: Number(formatUnits(tokenIsToken0 ? r0 : r1, tokenDecimals)),
      nativeReserve: token0.toLowerCase() === wpplLower ? Number(r0) / 1e18 : Number(r1) / 1e18,
    };
  });
}

/** `allPairsLength()` + `allPairs(uint256)` in two batched calls; null when the factory rejects them. */
async function factoryPairAddresses(ammFactory: string): Promise<string[] | null> {
  try {
    const [lenHex] = await evmJsonRpcBatch<string>([
      { method: "eth_call", params: [{ to: ammFactory, data: "0x574f2ba3" }, "latest"] },
    ]);
    const len = Math.min(Number(decodeUint(lenHex)) || 0, 500);
    if (len <= 0) return [];
    const addrs = await evmJsonRpcBatch<string>(
      Array.from({ length: len }, (_, i) => ({
        method: "eth_call",
        params: [{ to: ammFactory, data: `0x1e3dd18b${i.toString(16).padStart(64, "0")}` }, "latest"],
      })),
    );
    return addrs.map(decodeAddress).filter(Boolean);
  } catch {
    return null;
  }
}

async function discoverPoolsOnChainUncached(): Promise<CatalogPool[]> {
  const dep = readEvmDeployments();
  const wppl = dep.contracts.wppl;
  const ammFactory = dep.contracts.ammFactory;
  if (!wppl || !ammFactory) return [];

  const staticPools = dep.pools ?? [];
  const pairAddrs = new Set<string>();
  for (const p of staticPools) {
    if (p.poolId) pairAddrs.add(getAddress(p.poolId).toLowerCase());
  }

  // The factory's own `allPairs` index is authoritative (the contract only ever pushes to it, so it
  // is a superset of every PairCreated log) and costs two batched calls. The log scan re-reads each
  // 9 000-block window and measured ~16 s cold against the live node, which put the whole pool list
  // behind a multi-second skeleton, so it now runs only when the index is unavailable — an older
  // factory, or a node that rejects the calls.
  // Every AMM factory (current and legacy `ammFactoryVn`) is listed, so old pools stay visible.
  for (const factory of contractVersions(dep, "ammFactory")) {
    const indexed = await factoryPairAddresses(factory);
    if (indexed && indexed.length) {
      for (const addr of indexed) pairAddrs.add(addr.toLowerCase());
    } else {
      const fromLogs = await fetchLogsWindowed(factory, [PAIR_CREATED_TOPIC]);
      for (const log of fromLogs) {
        const pair = topicAddress(log.topics?.[2]);
        if (pair) pairAddrs.add(pair.toLowerCase());
      }
    }
  }

  const pairs = [...pairAddrs].map((lower) => getAddress(lower));
  if (!pairs.length) return [];

  return pairReservesBatch(pairs, getAddress(wppl));
}

async function loadPools(): Promise<CatalogPool[]> {
  const value = await scanPoolsCached().catch(() => discoverPoolsOnChainUncached());
  poolsCache = { at: Date.now(), value };
  return value;
}

export async function discoverPoolsOnChain(): Promise<CatalogPool[]> {
  const cached = poolsCache;
  if (cached) {
    if (Date.now() - cached.at < CATALOG_STALE_MS) return cached.value;
    if (!poolsRefreshing) {
      poolsRefreshing = loadPools()
        .catch(() => cached.value)
        .finally(() => {
          poolsRefreshing = null;
        });
    }
    return cached.value;
  }
  return loadPools();
}
