import { getAddress, type Hex } from "viem";
import { EvmRpcResponseError, evmJsonRpc } from "@/lib/evm/rpc-server";
import { readEvmDeployments } from "@/lib/evm/config";

/** First block worth scanning: the protocol deployment block when recorded, else genesis. */
function deploymentStartBlock(): number {
  const dep = readEvmDeployments() as { deployBlock?: number | null };
  return typeof dep.deployBlock === "number" && dep.deployBlock > 0 ? dep.deployBlock : 0;
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcLog = {
  address: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
};

export type IndexedTransfer = {
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
  transactionHash: string;
};

function hexToNumber(hex: string | undefined): number {
  if (!hex) return 0;
  return Number.parseInt(hex, 16);
}

function topicAddress(topic: string | undefined): string {
  if (!topic || topic.length < 66) return "";
  return getAddress(`0x${topic.slice(26)}`);
}

const DEFAULT_MAX_SCAN_WINDOWS = 500;

/**
 * Upper bound on sequential `eth_getLogs` windows one scan may issue, so a single request cannot
 * walk an ever-growing chain. Override with EVM_TRANSFER_SCAN_MAX_WINDOWS (positive integer).
 */
export function maxTransferScanWindows(): number {
  const n = Number(process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_SCAN_WINDOWS;
}

const LOG_RETRY_DELAYS_MS = [200, 500] as const;
const LOG_READ_TIMEOUT_MS = 12_000;

function sleepMs(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isTransientLogRpc(error: unknown): boolean {
  if (!(error instanceof Error) || error instanceof EvmRpcResponseError) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  if (error instanceof TypeError) return true;
  if (error.message === "rpc_backoff") return true;
  return /rpc_http_(408|425|429|500|502|503|504)/.test(error.message) || /failed to fetch|network/i.test(error.message);
}

async function getLogsWithRetry(filter: Record<string, unknown>): Promise<RpcLog[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= LOG_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleepMs(LOG_RETRY_DELAYS_MS[attempt - 1]);
    try {
      const chunk = await evmJsonRpc<RpcLog[]>("eth_getLogs", [filter], {
        timeoutMs: LOG_READ_TIMEOUT_MS,
        ignoreBackoff: true,
      });
      return Array.isArray(chunk) ? chunk : [];
    } catch (error) {
      lastError = error;
      if (attempt === LOG_RETRY_DELAYS_MS.length || !isTransientLogRpc(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("log_rpc_failed");
}

export type TransferScan = { transfers: IndexedTransfer[]; partial: boolean };

export async function fetchTransferLogs(
  tokenAddress: string,
  fromBlock = deploymentStartBlock(),
  toBlock?: number,
  maxWindows = maxTransferScanWindows(),
  options?: { preferHead?: boolean },
): Promise<IndexedTransfer[]> {
  return (await fetchTransferLogsDetailed(tokenAddress, fromBlock, toBlock, maxWindows, options)).transfers;
}

/**
 * Transfer logs for one token. When the range is longer than the window cap, the default keeps the
 * oldest windows (stable for tests). `preferHead` keeps the newest windows instead, so a factory
 * token whose creation block could not be found still includes the mint near the chain tip.
 * A window that fails after retries marks the scan partial when another window succeeded; if every
 * window fails, the error is thrown (an empty list must not be cached as "no holders").
 */
export async function fetchTransferLogsDetailed(
  tokenAddress: string,
  fromBlock = deploymentStartBlock(),
  toBlock?: number,
  maxWindows = maxTransferScanWindows(),
  options?: { preferHead?: boolean },
): Promise<TransferScan> {
  const token = getAddress(tokenAddress);
  const head = toBlock ?? hexToNumber(await evmJsonRpc<string>("eth_blockNumber", [], { timeoutMs: LOG_READ_TIMEOUT_MS, ignoreBackoff: true }));
  const first = Math.max(0, fromBlock);
  const windowBlocks = 9_000;
  const capped = head - first + 1 > maxWindows * windowBlocks;
  const latest = capped && !options?.preferHead ? Math.min(head, first + maxWindows * windowBlocks - 1) : head;
  const scanFrom = capped && options?.preferHead ? Math.max(first, head - maxWindows * windowBlocks + 1) : first;
  if (capped) {
    console.warn(`[transfer-index] scan capped at ${maxWindows} windows (blocks ${scanFrom}..${latest} of ${head})`);
  }
  // Head is behind the start (a short mock chain, or a token created after the tip we were given).
  // That is an empty scan, not a failed one.
  if (scanFrom > latest) return { transfers: [], partial: false };
  // Cosmos EVM caps eth_getLogs at 10,000 blocks per query; scan in windows.
  const logs: RpcLog[] = [];
  let succeeded = 0;
  let failed = 0;
  let lastError: unknown;
  for (let start = scanFrom; start <= latest; start += windowBlocks) {
    const end = Math.min(latest, start + windowBlocks - 1);
    try {
      logs.push(...await getLogsWithRetry({
        address: token,
        topics: [TRANSFER_TOPIC],
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
      }));
      succeeded += 1;
    } catch (error) {
      failed += 1;
      lastError = error;
    }
  }
  if (succeeded === 0) throw lastError instanceof Error ? lastError : new Error("log_rpc_failed");
  const transfers = logs
    .map((log) => {
      const topics = log.topics ?? [];
      const from = topicAddress(topics[1]);
      const to = topicAddress(topics[2]);
      const value = BigInt(log.data ?? "0x0");
      return {
        from,
        to,
        value,
        blockNumber: hexToNumber(log.blockNumber),
        transactionHash: log.transactionHash ?? "",
      };
    })
    .filter((row) => row.from && row.to && row.transactionHash);
  return { transfers, partial: failed > 0 };
}

/** Bound on `eth_getCode` probes for one creation-block search (2^26 blocks is far beyond any chain here). */
const CREATION_SEARCH_MAX_CALLS = 32;
/** Total time one creation-block search may take before the caller falls back to the deployment block. */
const CREATION_SEARCH_BUDGET_MS = 6_000;
const CREATION_CACHE_MAX_ENTRIES = 256;
/** Creation blocks never change, so a found value is kept for the process lifetime (LRU-bounded). */
const creationBlockCache = new Map<string, number>();

export function resetTokenCreationBlockCacheForTests(): void {
  creationBlockCache.clear();
}

function rememberCreationBlock(key: string, block: number): void {
  creationBlockCache.delete(key);
  while (creationBlockCache.size >= CREATION_CACHE_MAX_ENTRIES) {
    const oldest = creationBlockCache.keys().next().value;
    if (oldest === undefined) break;
    creationBlockCache.delete(oldest);
  }
  creationBlockCache.set(key, block);
}

const hasCode = (code: unknown): boolean => typeof code === "string" && /^0x[0-9a-f]*[1-9a-f][0-9a-f]*$/i.test(code);

/**
 * First block at which `tokenAddress` has contract code, found by binary search over `eth_getCode`
 * (about log2(head) calls). Returns null when it cannot be determined cheaply and reliably (node
 * without historical state, no code at the head, transport failure, budget exhausted); callers
 * then fall back to the deployment block. Never throws.
 */
export async function findTokenCreationBlock(tokenAddress: string, head?: number): Promise<number | null> {
  let token: string;
  try {
    token = getAddress(tokenAddress);
  } catch {
    return null;
  }
  const key = token.toLowerCase();
  const cached = creationBlockCache.get(key);
  if (cached !== undefined) {
    rememberCreationBlock(key, cached);
    return cached;
  }
  const deadline = Date.now() + CREATION_SEARCH_BUDGET_MS;
  let calls = 0;
  const codeAt = async (block: number): Promise<boolean> => {
    if (calls++ >= CREATION_SEARCH_MAX_CALLS || Date.now() > deadline) throw new Error("creation_search_budget");
    return hasCode(await evmJsonRpc<string>("eth_getCode", [token, `0x${block.toString(16)}`], { timeoutMs: 8_000, ignoreBackoff: true }));
  };
  try {
    const tip = head ?? hexToNumber(await evmJsonRpc<string>("eth_blockNumber", [], { timeoutMs: 8_000, ignoreBackoff: true }));
    if (!Number.isFinite(tip) || tip < 0 || !(await codeAt(tip))) return null;
    let lo = deploymentStartBlock();
    let hi = tip;
    if (lo >= hi) return null;
    // Invariant for the loop: no code at lo, code at hi.
    if (await codeAt(lo)) {
      rememberCreationBlock(key, lo);
      return lo;
    }
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (await codeAt(mid)) hi = mid;
      else lo = mid;
    }
    rememberCreationBlock(key, hi);
    return hi;
  } catch {
    return null;
  }
}

export type TokenHolderRow = { address: string; balance: bigint };

/** Full-history log scans are expensive; cache briefly to blunt anonymous scraping. */
const HOLDERS_TTL_MS = 30_000;
/** LRU bound: Map iteration follows insertion order, so the first key is the least recent. */
export const HOLDERS_CACHE_MAX_ENTRIES = 64;
const holdersCache = new Map<string, { at: number; value: TokenHolderRow[] }>();

export function resetTransferIndexCacheForTests(): void {
  holdersCache.clear();
}

export function holdersCacheSizeForTests(): number {
  return holdersCache.size;
}

function rememberHolders(key: string, entry: { at: number; value: TokenHolderRow[] }): void {
  holdersCache.delete(key);
  while (holdersCache.size >= HOLDERS_CACHE_MAX_ENTRIES) {
    const oldest = holdersCache.keys().next().value;
    if (oldest === undefined) break;
    holdersCache.delete(oldest);
  }
  holdersCache.set(key, entry);
}

export type HolderScan = { holders: TokenHolderRow[]; partial: boolean };

/** Aggregate wallet balances from Transfer logs (excludes zero-balance addresses). */
export async function aggregateHoldersFromTransfers(tokenAddress: string, fromBlock?: number, options?: { preferHead?: boolean }): Promise<TokenHolderRow[]> {
  return (await aggregateHoldersDetailed(tokenAddress, fromBlock, options)).holders;
}

/**
 * Same aggregation as {@link aggregateHoldersFromTransfers}, plus `partial` when a window failed
 * after retries or the scan was capped. A total failure still throws. Partial scans are not cached.
 */
export async function aggregateHoldersDetailed(tokenAddress: string, fromBlock?: number, options?: { preferHead?: boolean }): Promise<HolderScan> {
  const cacheKey = tokenAddress.trim().toLowerCase();
  const cached = holdersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HOLDERS_TTL_MS) {
    rememberHolders(cacheKey, cached);
    return { holders: cached.value, partial: false };
  }
  // Scan failures propagate: an incomplete scan must never be cached or shown as "no holders".
  const scan = await fetchTransferLogsDetailed(tokenAddress, fromBlock, undefined, maxTransferScanWindows(), options);
  const transfers = scan.transfers;
  const balances = new Map<string, bigint>();
  for (const t of transfers) {
    if (t.from !== "0x0000000000000000000000000000000000000000") {
      balances.set(t.from, (balances.get(t.from) ?? BigInt(0)) - t.value);
    }
    balances.set(t.to, (balances.get(t.to) ?? BigInt(0)) + t.value);
  }
  const value = [...balances.entries()]
    .filter(([, bal]) => bal > BigInt(0))
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => (a.balance > b.balance ? -1 : a.balance < b.balance ? 1 : a.address.localeCompare(b.address)));
  if (!scan.partial) rememberHolders(cacheKey, { at: Date.now(), value });
  return { holders: value, partial: scan.partial };
}

export function listKnownTokenAddresses(): string[] {
  const dep = readEvmDeployments();
  const fromMap = Object.values(dep.assetMap ?? {}).filter(Boolean);
  const factory = dep.contracts.tokenFactory;
  return [...new Set([...fromMap, ...(factory ? [] : [])])];
}

export async function readErc20Meta(token: string): Promise<{ name: string; symbol: string; decimals: number; totalSupply: number }> {
  const addr = getAddress(token);
  const call = async (data: Hex) =>
    evmJsonRpc<string>("eth_call", [{ to: addr, data }, "latest"]).catch(() => "0x");
  const decimalsHex = await call("0x313ce567");
  const decimals = Number.parseInt(decimalsHex, 16) || 18;
  return {
    name: token.slice(0, 10),
    symbol: token.slice(2, 8).toUpperCase(),
    decimals,
    totalSupply: 0,
  };
}
