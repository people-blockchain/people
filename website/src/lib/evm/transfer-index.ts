import { getAddress, type Hex } from "viem";
import { evmJsonRpc, isIncompleteRpcError, isRequestDeadlineError } from "@/lib/evm/rpc-server";
import { readEvmDeployments } from "@/lib/evm/config";
import { currentDeadline, deadlineExpired } from "@/lib/evm/request-deadline";

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
const SCAN_PARTIAL = Symbol("scanPartial");

/** Completed `eth_getLogs` windows. A deadline keeps these so the next request does not rescan them. */
const transferWindowCache = new Map<string, RpcLog[]>();

export function transferScanIsPartial(value: object | null | undefined): boolean {
  return Boolean(value && (value as { [SCAN_PARTIAL]?: boolean })[SCAN_PARTIAL]);
}

function markTransferPartial<T extends object>(value: T, partial: boolean): T {
  if (partial) Object.assign(value, { [SCAN_PARTIAL]: true });
  return value;
}

/**
 * Upper bound on sequential `eth_getLogs` windows one scan may issue, so a single request cannot
 * walk an ever-growing chain. Override with EVM_TRANSFER_SCAN_MAX_WINDOWS (positive integer).
 */
export function maxTransferScanWindows(): number {
  const n = Number(process.env.EVM_TRANSFER_SCAN_MAX_WINDOWS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_SCAN_WINDOWS;
}

export async function fetchTransferLogs(
  tokenAddress: string,
  fromBlock = deploymentStartBlock(),
  toBlock?: number,
  maxWindows = maxTransferScanWindows(),
): Promise<IndexedTransfer[]> {
  const token = getAddress(tokenAddress);
  const underDeadline = Boolean(currentDeadline());
  let head: number;
  if (toBlock !== undefined) {
    head = toBlock;
  } else {
    try {
      head = hexToNumber(await evmJsonRpc<string>("eth_blockNumber", [], { ignoreBackoff: underDeadline }));
    } catch (error) {
      if (underDeadline && (isRequestDeadlineError(error) || isIncompleteRpcError(error) || deadlineExpired())) {
        return markTransferPartial([], true);
      }
      throw error;
    }
  }
  const first = Math.max(0, fromBlock);
  // Past the cap the scan stops at a fixed block: results stay consistent, just stale.
  const latest = Math.min(head, first + maxWindows * 9_000 - 1);
  if (latest < head) {
    console.warn(`[transfer-index] scan capped at ${maxWindows} windows (blocks ${first}..${latest} of ${head})`);
  }
  // Cosmos EVM caps eth_getLogs at 10,000 blocks per query; scan in windows.
  const logs: RpcLog[] = [];
  let partial = false;
  for (let start = first; start <= latest; start += 9_000) {
    if (currentDeadline()?.signal.aborted || deadlineExpired()) {
      partial = true;
      break;
    }
    const end = Math.min(latest, start + 8_999);
    const cacheKey = `${token.toLowerCase()}|${start}|${end}`;
    // Only a compat request (one that has the shared deadline) reuses windows. Other callers keep
    // the historical "every scan hits the node" behaviour, including the window-cap tests.
    if (underDeadline) {
      const cached = transferWindowCache.get(cacheKey);
      if (cached) {
        logs.push(...cached);
        continue;
      }
    }
    let chunk: RpcLog[];
    try {
      chunk = await evmJsonRpc<RpcLog[]>("eth_getLogs", [
        {
          address: token,
          topics: [TRANSFER_TOPIC],
          fromBlock: `0x${start.toString(16)}`,
          toBlock: `0x${end.toString(16)}`,
        },
      ], { ignoreBackoff: underDeadline });
    } catch (error) {
      if (isRequestDeadlineError(error) || deadlineExpired() || (underDeadline && isIncompleteRpcError(error))) {
        partial = true;
        break;
      }
      throw error;
    }
    if (Array.isArray(chunk)) {
      if (underDeadline) transferWindowCache.set(cacheKey, chunk);
      logs.push(...chunk);
    } else if (underDeadline) {
      partial = true;
      break;
    }
  }
  if (!Array.isArray(logs)) return markTransferPartial([], partial);
  const indexed = logs
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
  return markTransferPartial(indexed, partial);
}

export type TokenHolderRow = { address: string; balance: bigint };

/** Full-history log scans are expensive; cache briefly to blunt anonymous scraping. */
const HOLDERS_TTL_MS = 30_000;
/** LRU bound: Map iteration follows insertion order, so the first key is the least recent. */
export const HOLDERS_CACHE_MAX_ENTRIES = 64;
const holdersCache = new Map<string, { at: number; value: TokenHolderRow[] }>();

export function resetTransferIndexCacheForTests(): void {
  holdersCache.clear();
  transferWindowCache.clear();
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

/** Aggregate wallet balances from Transfer logs (excludes zero-balance addresses). */
export async function aggregateHoldersFromTransfers(tokenAddress: string): Promise<TokenHolderRow[]> {
  const cacheKey = tokenAddress.trim().toLowerCase();
  const cached = holdersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HOLDERS_TTL_MS) {
    rememberHolders(cacheKey, cached);
    return cached.value;
  }
  const transfers = await fetchTransferLogs(tokenAddress);
  const partial = transferScanIsPartial(transfers);
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
  // A partial holder list is not cached as complete: the window cache above is what the next
  // request continues from.
  if (!partial) rememberHolders(cacheKey, { at: Date.now(), value });
  return markTransferPartial(value, partial);
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
