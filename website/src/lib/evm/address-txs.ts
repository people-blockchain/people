import { formatUnits } from "viem";
import { evmJsonRpc, evmJsonRpcBatch } from "@/lib/evm/rpc-server";
import { transactionMemo } from "@/lib/evm/transaction-memo";
import type { EvmExplorerTx } from "@/lib/evm/explorer-blocks";

type RpcCall = { method: string; params: unknown[] };

type RpcTx = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string | null;
  input: string;
  nonce: string;
};

type RpcBlock = {
  number: string;
  transactions: RpcTx[];
};

type RpcLog = {
  transactionHash: string;
};

const BATCH_SIZE = 50;
/** Cosmos EVM caps eth_getLogs around 10k blocks; keep two windows max per request. */
const LOG_WINDOW = 9000;
const LOG_WINDOWS = 2;
/** Native (from/to) scan of recent full blocks — keep small so a request stays under ~3s. */
const RECENT_BLOCKS = 200;
const MAX_OUTGOING_NONCES = 15;
const DEFAULT_BUDGET_MS = 3000;
const CACHE_TTL_MS = 60_000;

export type AddressHistoryResult = {
  items: EvmExplorerTx[];
  outgoing: number;
  incoming: number;
  hasMore: boolean;
  nextBeforeBlock?: number;
  truncated?: boolean;
};

type Deadline = { at: number; expired: () => boolean };

function makeDeadline(budgetMs: number): Deadline {
  const at = Date.now() + Math.max(250, budgetMs);
  return { at, expired: () => Date.now() >= at };
}

async function runBatch<T>(calls: RpcCall[], deadline: Deadline): Promise<Array<T | null>> {
  const out: Array<T | null> = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    if (deadline.expired()) {
      for (let j = i; j < calls.length; j++) out.push(null);
      break;
    }
    const chunk = calls.slice(i, i + BATCH_SIZE);
    const remaining = Math.max(200, deadline.at - Date.now());
    try {
      // The timeout aborts the in-flight batch; a race that only stops waiting would leave the fetch running.
      const part = await evmJsonRpcBatch<T>(chunk, { timeoutMs: remaining });
      out.push(...part);
    } catch {
      out.push(...chunk.map(() => null));
    }
  }
  return out;
}

function toHex(n: number): string {
  return "0x" + n.toString(16);
}

function parseHexInt(s: string | null | undefined): number {
  if (!s) return 0;
  return parseInt(s, 16);
}

function addrTopic(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  return "0x" + "0".repeat(24) + lower;
}

function mapTx(tx: RpcTx): EvmExplorerTx {
  const value = tx.value || "0x0";
  const amount = Number(formatUnits(BigInt(value), 18));
  const blockHeight = parseHexInt(tx.blockNumber);
  const memo = transactionMemo(tx);
  const type: string = tx.input && tx.input !== "0x" && !memo ? "contract_call" : "transfer";
  return {
    id: tx.hash,
    type,
    from: tx.from,
    to: tx.to ?? undefined,
    amount,
    blockHeight,
    ...(memo ? { payload: { memo } } : {}),
  };
}

async function fetchOutgoing(
  address: string,
  nonce: number,
  head: number,
  beforeBlock: number | undefined,
  limit: number,
  deadline: Deadline,
): Promise<{ txs: RpcTx[]; scannedTo: number }> {
  const targetNonces: number[] = [];
  const count = Math.min(nonce, limit, MAX_OUTGOING_NONCES);
  for (let i = 0; i < count; i++) targetNonces.push(nonce - 1 - i);
  if (targetNonces.length === 0 || deadline.expired()) {
    return { txs: [], scannedTo: beforeBlock ?? head };
  }

  const scanHead = beforeBlock !== undefined ? Math.min(beforeBlock - 1, head) : head;
  if (scanHead < 0) return { txs: [], scannedTo: 0 };

  const lowerAddr = address.toLowerCase();
  const foundBlocks = new Map<number, number>();
  const state = targetNonces.map((k) => ({
    k,
    lo: 0,
    hi: scanHead,
    result: null as number | null,
    done: false,
  }));

  while (state.some((s) => !s.done)) {
    if (deadline.expired()) break;
    const active = state.filter((s) => !s.done);
    const calls: RpcCall[] = active.map((s) => {
      const mid = Math.floor((s.lo + s.hi) / 2);
      return { method: "eth_getTransactionCount", params: [address, toHex(mid)] };
    });
    const results = await runBatch<string>(calls, deadline);
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const mid = Math.floor((s.lo + s.hi) / 2);
      const cnt = parseHexInt(results[i]);
      if (cnt > s.k) {
        s.result = mid;
        s.hi = mid - 1;
      } else {
        s.lo = mid + 1;
      }
      if (s.lo > s.hi) {
        s.done = true;
        if (s.result !== null) foundBlocks.set(s.k, s.result);
      }
    }
  }

  if (foundBlocks.size === 0) return { txs: [], scannedTo: Math.max(0, scanHead - RECENT_BLOCKS) };

  const uniqueBlocks = Array.from(new Set(foundBlocks.values())).filter(
    (b) => beforeBlock === undefined || b < beforeBlock,
  );
  const blockCalls: RpcCall[] = uniqueBlocks.map((b) => ({
    method: "eth_getBlockByNumber",
    params: [toHex(b), true],
  }));
  const blockResults = await runBatch<RpcBlock>(blockCalls, deadline);
  const blockMap = new Map<number, RpcBlock>();
  for (let i = 0; i < uniqueBlocks.length; i++) {
    const blk = blockResults[i];
    if (blk) blockMap.set(uniqueBlocks[i], blk);
  }

  const out: RpcTx[] = [];
  for (const [k, b] of foundBlocks.entries()) {
    const blk = blockMap.get(b);
    if (!blk) continue;
    for (const tx of blk.transactions) {
      if (tx.from.toLowerCase() === lowerAddr && parseHexInt(tx.nonce) === k) {
        out.push(tx);
        break;
      }
    }
  }
  const scannedTo =
    uniqueBlocks.length > 0 ? Math.min(...uniqueBlocks) : Math.max(0, scanHead - RECENT_BLOCKS);
  return { txs: out, scannedTo };
}

async function fetchIncoming(
  address: string,
  head: number,
  beforeBlock: number | undefined,
  deadline: Deadline,
): Promise<{ txs: RpcTx[]; scannedTo: number; truncated: boolean }> {
  const lowerAddr = address.toLowerCase();
  const topic = addrTopic(address);
  const hashes = new Set<string>();
  let truncated = false;

  const scanHead = beforeBlock !== undefined ? Math.min(beforeBlock - 1, head) : head;
  if (scanHead < 0) return { txs: [], scannedTo: 0, truncated: false };

  const range = LOG_WINDOW * LOG_WINDOWS;
  const startBlock = Math.max(0, scanHead - range + 1);
  let windowEnd = scanHead;
  let windows = 0;
  let scannedTo = scanHead;

  while (windowEnd >= startBlock && windows < LOG_WINDOWS) {
    if (deadline.expired()) {
      truncated = true;
      break;
    }
    const windowStart = Math.max(startBlock, windowEnd - LOG_WINDOW + 1);
    scannedTo = windowStart;
    const fromHex = toHex(windowStart);
    const toHexStr = toHex(windowEnd);
    const calls: RpcCall[] = [
      { method: "eth_getLogs", params: [{ address, fromBlock: fromHex, toBlock: toHexStr }] },
      {
        method: "eth_getLogs",
        params: [{ fromBlock: fromHex, toBlock: toHexStr, topics: [null, null, topic] }],
      },
    ];
    const results = await runBatch<RpcLog[]>(calls, deadline);
    for (const r of results) {
      if (r) {
        for (const log of r) {
          if (log.transactionHash) hashes.add(log.transactionHash);
        }
      }
    }
    windows += 1;
    if (windowStart === startBlock) break;
    windowEnd = windowStart - 1;
  }

  // Recent native txs in a bounded window (from/to match).
  if (!deadline.expired()) {
    const recentEnd = scanHead;
    const recentStart = Math.max(0, recentEnd - RECENT_BLOCKS + 1);
    scannedTo = Math.min(scannedTo, recentStart);
    const recentCalls: RpcCall[] = [];
    for (let b = recentStart; b <= recentEnd; b++) {
      recentCalls.push({ method: "eth_getBlockByNumber", params: [toHex(b), true] });
    }
    const recentBlocks = await runBatch<RpcBlock>(recentCalls, deadline);
    if (deadline.expired()) truncated = true;
    for (const blk of recentBlocks) {
      if (!blk) continue;
      for (const tx of blk.transactions) {
        if (tx.to && tx.to.toLowerCase() === lowerAddr) hashes.add(tx.hash);
        if (tx.from && tx.from.toLowerCase() === lowerAddr) hashes.add(tx.hash);
      }
    }
  } else {
    truncated = true;
  }

  if (hashes.size === 0) return { txs: [], scannedTo, truncated };

  const hashArr = Array.from(hashes);
  const txCalls: RpcCall[] = hashArr.map((h) => ({
    method: "eth_getTransactionByHash",
    params: [h],
  }));
  const txResults = await runBatch<RpcTx>(txCalls, deadline);
  const out: RpcTx[] = [];
  for (const tx of txResults) {
    if (!tx) continue;
    if (beforeBlock !== undefined && parseHexInt(tx.blockNumber) >= beforeBlock) continue;
    out.push(tx);
  }
  return { txs: out, scannedTo, truncated };
}

const historyCache = new Map<
  string,
  { at: number; value: Promise<AddressHistoryResult> }
>();

export function fetchAddressHistory(
  address: string,
  limit: number,
  opts?: { beforeBlock?: number; budgetMs?: number },
): Promise<AddressHistoryResult> {
  const safeLimit = Math.max(1, Math.min(limit || 30, 100));
  const beforeBlock = opts?.beforeBlock;
  const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS;
  const key = `${address.toLowerCase()}|${safeLimit}|${beforeBlock ?? ""}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  if (historyCache.size > 200) historyCache.clear();
  const value = loadAddressHistory(address, safeLimit, beforeBlock, budgetMs);
  historyCache.set(key, { at: Date.now(), value });
  value.catch(() => historyCache.delete(key));
  return value;
}

async function loadAddressHistory(
  address: string,
  limit: number,
  beforeBlock: number | undefined,
  budgetMs: number,
): Promise<AddressHistoryResult> {
  const lowerAddr = address.toLowerCase();
  const deadline = makeDeadline(budgetMs);

  let head = 0;
  let nonce = 0;
  try {
    const headHex = await evmJsonRpc<string>("eth_blockNumber", []);
    head = parseHexInt(headHex);
    const nonceHex = await evmJsonRpc<string>("eth_getTransactionCount", [address, headHex]);
    nonce = parseHexInt(nonceHex);
  } catch {
    return { items: [], outgoing: nonce, incoming: 0, hasMore: false };
  }

  if (deadline.expired()) {
    return {
      items: [],
      outgoing: nonce,
      incoming: 0,
      hasMore: head > 0,
      nextBeforeBlock: beforeBlock ?? head,
      truncated: true,
    };
  }

  const [outgoingRes, incomingRes] = await Promise.all([
    fetchOutgoing(address, nonce, head, beforeBlock, limit, deadline).catch(() => ({
      txs: [] as RpcTx[],
      scannedTo: 0,
    })),
    fetchIncoming(address, head, beforeBlock, deadline).catch(() => ({
      txs: [] as RpcTx[],
      scannedTo: 0,
      truncated: true,
    })),
  ]);

  const merged = new Map<string, RpcTx>();
  for (const tx of outgoingRes.txs) {
    if (!merged.has(tx.hash)) merged.set(tx.hash, tx);
  }
  for (const tx of incomingRes.txs) {
    if (!merged.has(tx.hash)) merged.set(tx.hash, tx);
  }

  const all = Array.from(merged.values());
  all.sort((a, b) => parseHexInt(b.blockNumber) - parseHexInt(a.blockNumber));

  const sliced = all.slice(0, limit);
  const items = sliced.map(mapTx);

  let incomingCount = 0;
  for (const tx of sliced) {
    if (tx.from.toLowerCase() !== lowerAddr) incomingCount++;
  }

  const scannedFloor = Math.min(
    outgoingRes.scannedTo || head,
    incomingRes.scannedTo || head,
  );
  const truncated = deadline.expired() || incomingRes.truncated;
  const oldest =
    sliced.length > 0
      ? Math.min(...sliced.map((t) => parseHexInt(t.blockNumber)))
      : scannedFloor;
  // Offer "load more" when we stopped early or there is older chain left to scan.
  const hasMore =
    oldest > 1 && (truncated || all.length > limit || scannedFloor > 1);
  const nextBeforeBlock = hasMore ? oldest : undefined;

  return {
    items,
    outgoing: nonce,
    incoming: incomingCount,
    hasMore,
    nextBeforeBlock,
    truncated,
  };
}
