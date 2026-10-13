import { formatUnits, type Hash } from "viem";
import { readEvmRpcUrl } from "@/lib/evm/config";
import { evmJsonRpc, evmJsonRpcBatch } from "@/lib/evm/rpc-server";

type RpcBlock = {
  number?: string;
  hash?: Hash;
  timestamp?: string;
  miner?: string;
  transactions?: Hash[] | RpcTx[];
};

type RpcTx = {
  hash: Hash;
  from: string;
  to?: string | null;
  value?: string;
  blockNumber?: string;
  input?: string;
};

export type EvmExplorerBlock = {
  hash: string;
  header: { height: number; proposer?: string; timestamp?: number };
  transactions: unknown[];
};

export type EvmExplorerTx = {
  id: string;
  type?: string;
  from?: string;
  to?: string;
  amount?: number;
  fee?: number;
  blockHeight?: number;
};

function hexToNumber(hex: string | undefined): number {
  if (!hex) return 0;
  return Number.parseInt(hex, 16);
}

function heightHex(height: number): string {
  return `0x${height.toString(16)}`;
}

export async function fetchLatestBlockNumber(): Promise<number> {
  const hex = await evmJsonRpc<string>("eth_blockNumber", []);
  return hexToNumber(hex);
}

/** Recent-feed window: the newest N blocks a feed request is allowed to touch. */
const RECENT_SCAN_BLOCKS = 40;
/** A page load reads a feed twice (SSR prefetch, then the client refresh) — dedupe that burst. */
const RECENT_CACHE_TTL_MS = 3_000;
const RECENT_CACHE_MAX_ENTRIES = 32;

const recentCache = new Map<string, { at: number; value: unknown }>();
const recentInFlight = new Map<string, Promise<unknown>>();

/** Test hook: a fresh RPC node must not be served another node's entry. */
export function resetRecentFeedCacheForTests(): void {
  recentCache.clear();
  recentInFlight.clear();
}

/**
 * Serves a burst (several visitors refreshing at once, or the SSR prefetch racing the client
 * refresh) from one scan: a settled entry inside the TTL, otherwise the scan already in flight.
 */
function cachedRecent<T>(kind: string, head: number, take: number, load: () => Promise<T>): Promise<T> {
  // The RPC URL is part of the key so two nodes never share a cached page of the feed.
  const key = `${kind}|${readEvmRpcUrl()}|${head}|${take}`;
  const hit = recentCache.get(key);
  if (hit && Date.now() - hit.at < RECENT_CACHE_TTL_MS) return Promise.resolve(hit.value as T);
  const pending = recentInFlight.get(key);
  if (pending) return pending as Promise<T>;
  const scan = load()
    .then((value) => {
      if (recentCache.size >= RECENT_CACHE_MAX_ENTRIES) recentCache.clear();
      recentCache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => recentInFlight.delete(key));
  recentInFlight.set(key, scan);
  return scan;
}

/** Block heights to read for a recent feed, newest first. */
function recentHeights(head: number, window: number): number[] {
  const start = Math.max(1, head - window + 1);
  const heights: number[] = [];
  for (let h = head; h >= start; h -= 1) heights.push(h);
  return heights;
}

/**
 * One `eth_getBlockByNumber` per height, sent as a single JSON-RPC batch. Reading the newest 20
 * blocks one HTTP request at a time cost ~0.2–1 s per block; the same reads in one batch answer in
 * a single round-trip. A `null` slot is a block the node failed to return.
 */
function batchBlocks(heights: number[], full: boolean): Promise<Array<RpcBlock | null>> {
  return evmJsonRpcBatch<RpcBlock>(
    heights.map((height) => ({ method: "eth_getBlockByNumber", params: [heightHex(height), full] })),
  );
}

/**
 * The block at `index`, from the batch when it succeeded and one request at a time when the node
 * rejected batch arrays. The sequential fallback keeps the old lazy read order, so a feed that only
 * needs the newest block still opens exactly one request.
 */
function readBlock(
  batched: Array<RpcBlock | null> | null,
  index: number,
  heights: number[],
  full: boolean,
): Promise<RpcBlock | null> {
  if (batched) return Promise.resolve(batched[index] ?? null);
  return evmJsonRpc<RpcBlock>("eth_getBlockByNumber", [heightHex(heights[index]), full]);
}

export async function fetchRecentBlocks(limit: number): Promise<EvmExplorerBlock[]> {
  const head = await fetchLatestBlockNumber();
  if (head < 1) return [];
  const take = Math.max(1, Math.min(limit, 40));
  const heights = recentHeights(head, take);
  return cachedRecent("blocks", head, take, async () => {
    const batched = await batchBlocks(heights, false).catch(() => null);
    const blocks: EvmExplorerBlock[] = [];
    for (let index = 0; index < heights.length; index += 1) {
      const block = await readBlock(batched, index, heights, false);
      if (!block?.hash) continue;
      blocks.push({
        hash: block.hash,
        header: {
          height: heights[index],
          proposer: block.miner,
          timestamp: hexToNumber(block.timestamp) * 1000,
        },
        transactions: Array.isArray(block.transactions) ? block.transactions : [],
      });
    }
    return blocks;
  });
}

function toExplorerTx(tx: RpcTx): EvmExplorerTx {
  const valueWei = BigInt(tx.value ?? "0x0");
  return {
    id: tx.hash,
    type: tx.input && tx.input !== "0x" ? "contract" : "transfer",
    from: tx.from,
    to: tx.to ?? undefined,
    amount: Number(formatUnits(valueWei, 18)),
    blockHeight: hexToNumber(tx.blockNumber),
  };
}

export async function fetchRecentTransactions(limit: number): Promise<EvmExplorerTx[]> {
  const head = await fetchLatestBlockNumber();
  const take = Math.max(1, Math.min(limit, 100));
  // Recent feed only: never rescan the entire chain on each visitor refresh.
  const heights = recentHeights(head, RECENT_SCAN_BLOCKS);
  return cachedRecent("transactions", head, take, async () => {
    const batched = await batchBlocks(heights, true).catch(() => null);
    const out: EvmExplorerTx[] = [];
    for (let index = 0; index < heights.length && out.length < take; index += 1) {
      const block = await readBlock(batched, index, heights, true);
      const txs = block?.transactions;
      if (!Array.isArray(txs)) continue;
      for (const raw of txs) {
        if (typeof raw === "string") continue;
        const tx = raw as RpcTx;
        if (!tx.hash) continue;
        out.push(toExplorerTx(tx));
        if (out.length >= take) break;
      }
    }
    return out;
  });
}

export async function fetchBlockByHeight(height: number): Promise<EvmExplorerBlock | null> {
  const block = await evmJsonRpc<RpcBlock>("eth_getBlockByNumber", [`0x${height.toString(16)}`, true]);
  if (!block?.hash) return null;
  const txs = Array.isArray(block.transactions) ? block.transactions : [];
  return {
    hash: block.hash,
    header: {
      height,
      proposer: block.miner,
      timestamp: hexToNumber(block.timestamp) * 1000,
    },
    transactions: txs as unknown[],
  };
}

export async function fetchTransaction(hash: string): Promise<EvmExplorerTx | null> {
  const tx = await evmJsonRpc<RpcTx | null>("eth_getTransactionByHash", [hash]);
  if (!tx?.hash) return null;
  const receipt = await evmJsonRpc<{ gasUsed?: string; effectiveGasPrice?: string } | null>("eth_getTransactionReceipt", [
    hash,
  ]);
  const gasUsed = BigInt(receipt?.gasUsed ?? "0x0");
  const gasPrice = BigInt(receipt?.effectiveGasPrice ?? "0x0");
  const feeWei = gasUsed * gasPrice;
  const valueWei = BigInt(tx.value ?? "0x0");
  return {
    id: tx.hash,
    type: tx.input && tx.input !== "0x" ? "contract" : "transfer",
    from: tx.from,
    to: tx.to ?? undefined,
    amount: Number(formatUnits(valueWei, 18)),
    fee: Number(formatUnits(feeWei, 18)),
    blockHeight: hexToNumber(tx.blockNumber),
  };
}
