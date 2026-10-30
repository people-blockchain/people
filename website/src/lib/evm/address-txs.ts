import { formatUnits } from "viem";
import { readEvmRpcUrl } from "@/lib/evm/config";
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
  number?: string;
  timestamp?: string;
  transactions?: Array<RpcTx | string>;
};

type RpcLog = {
  transactionHash: string;
};

const BATCH_SIZE = 50;
/** Cosmos EVM caps eth_getLogs around 10k blocks; keep two windows max per request. */
const LOG_WINDOW = 9000;
const LOG_WINDOWS = 2;
/** Native (from/to) scan of recent full blocks — always attempted before the older walk. */
const RECENT_BLOCKS = 200;
const MAX_OUTGOING_NONCES = 15;
/** Slow testnet nodes need more than a few seconds to answer nonce probes and block walks. */
export const ADDRESS_HISTORY_BUDGET_MS = 14_000;
export const ADDRESS_HISTORY_CACHE_TTL_MS = 60_000;
/** Incomplete scans must not stick around and hide a later successful read. */
export const ADDRESS_HISTORY_PARTIAL_CACHE_TTL_MS = 5_000;

export type AddressHistoryResult = {
  items: EvmExplorerTx[];
  outgoing: number;
  incoming: number;
  hasMore: boolean;
  nextBeforeBlock?: number;
  truncated?: boolean;
  /** True when the node pruned state, the deadline fired, or an RPC error cut the scan short. */
  partial?: boolean;
  /** Lowest block whose state is still available. History before it cannot be located by nonce. */
  prunedBeforeBlock?: number;
};

type Deadline = { at: number; expired: () => boolean };

type OutgoingScan = {
  txs: RpcTx[];
  partial: boolean;
  prunedBeforeBlock?: number;
  missingNonces: number[];
  timestamps: Map<number, number>;
};

type IncomingScan = {
  txs: RpcTx[];
  /** Lowest block included in the contiguous native walk. `scanHead + 1` when nothing was read. */
  scannedTo: number;
  truncated: boolean;
  timestamps: Map<number, number>;
};

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
      const part = await Promise.race([
        evmJsonRpcBatch<T>(chunk),
        new Promise<Array<T | null>>((resolve) =>
          setTimeout(() => resolve(chunk.map(() => null)), remaining),
        ),
      ]);
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

/** Null means the node did not answer (pruned state, timeout). Never treat that as nonce 0. */
function parseCount(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n : null;
}

function sameAddr(a: string | null | undefined, lower: string): boolean {
  return !!a && a.toLowerCase() === lower;
}

function addrTopic(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  return "0x" + "0".repeat(24) + lower;
}

function rememberTimestamp(timestamps: Map<number, number>, block: { number?: string; timestamp?: string } | null): void {
  if (!block?.number || !block.timestamp) return;
  timestamps.set(parseHexInt(block.number), parseHexInt(block.timestamp) * 1000);
}

function mapTx(tx: RpcTx, timestampMs?: number): EvmExplorerTx {
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
    ...(timestampMs !== undefined ? { timestamp: timestampMs } : {}),
    ...(memo ? { payload: { memo } } : {}),
  };
}

function countCall(address: string, height: number): RpcCall {
  return { method: "eth_getTransactionCount", params: [address, toHex(height)] };
}

/**
 * Lowest height whose account state still exists. A null/error count means that height is pruned,
 * so the probe moves up. `partial` is set when the deadline cuts the probe short.
 */
async function findStateFloor(
  address: string,
  head: number,
  deadline: Deadline,
): Promise<{ floor: number; partial: boolean }> {
  let lo = 0;
  let hi = head;
  let partial = false;
  for (let round = 0; round < 40 && lo < hi; round++) {
    if (deadline.expired()) {
      partial = true;
      break;
    }
    const width = hi - lo;
    const steps = Math.min(BATCH_SIZE, width);
    const candidates: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < steps; i++) {
      const height = lo + Math.floor((i * width) / steps);
      if (seen.has(height)) continue;
      seen.add(height);
      candidates.push(height);
    }
    if (candidates.length === 0) break;
    const results = await runBatch<string>(candidates.map((height) => countCall(address, height)), deadline);
    if (deadline.expired()) {
      partial = true;
      break;
    }
    let lowestOk: number | null = null;
    let highestFail = lo - 1;
    for (let i = 0; i < candidates.length; i++) {
      const height = candidates[i];
      if (parseCount(results[i]) === null) {
        if (height > highestFail) highestFail = height;
      } else if (lowestOk === null || height < lowestOk) {
        lowestOk = height;
      }
    }
    if (lowestOk === null) {
      const check = await runBatch<string>([countCall(address, hi)], deadline);
      if (parseCount(check[0]) === null) {
        return { floor: hi, partial: true };
      }
      lo = candidates[candidates.length - 1] + 1;
    } else {
      hi = lowestOk;
      if (highestFail >= lo) lo = highestFail + 1;
    }
    if (lo > hi) lo = hi;
  }
  if (lo < hi) partial = true;
  return { floor: hi, partial };
}

async function fetchOutgoing(
  address: string,
  headNonce: number,
  head: number,
  beforeBlock: number | undefined,
  limit: number,
  deadline: Deadline,
): Promise<OutgoingScan> {
  const lowerAddr = address.toLowerCase();
  const timestamps = new Map<number, number>();
  const empty = (partial: boolean, prunedBeforeBlock?: number): OutgoingScan => ({
    txs: [],
    partial,
    prunedBeforeBlock,
    missingNonces: [],
    timestamps,
  });
  const scanHead = beforeBlock !== undefined ? Math.min(beforeBlock - 1, head) : head;
  if (scanHead < 0 || headNonce <= 0) return empty(deadline.expired());
  if (deadline.expired()) return empty(true);

  const { floor: stateFloor, partial: floorPartial } = await findStateFloor(lowerAddr, scanHead, deadline);
  if (scanHead < stateFloor) {
    return empty(true, stateFloor);
  }

  const scanCountRaw = scanHead === head
    ? headNonce
    : parseCount((await runBatch<string>([countCall(lowerAddr, scanHead)], deadline))[0]);
  const floorCount = parseCount((await runBatch<string>([countCall(lowerAddr, stateFloor)], deadline))[0]);
  if (scanCountRaw === null) return empty(true, floorPartial ? stateFloor : undefined);
  const nonceAtScan = scanCountRaw;

  const targetNonces: number[] = [];
  const count = Math.min(nonceAtScan, limit, MAX_OUTGOING_NONCES);
  for (let i = 0; i < count; i++) targetNonces.push(nonceAtScan - 1 - i);
  const searchable = targetNonces.filter((k) => floorCount === null || k >= floorCount);
  const state = searchable.map((k) => ({
    k,
    lo: stateFloor,
    hi: scanHead,
    result: null as number | null,
    done: false,
    partial: false,
  }));

  let searchPartial = floorPartial || floorCount === null;
  for (let round = 0; round < 64 && state.some((s) => !s.done); round++) {
    if (deadline.expired()) {
      searchPartial = true;
      break;
    }
    const active = state.filter((s) => !s.done);
    const mids = active.map((s) => Math.floor((s.lo + s.hi) / 2));
    const results = await runBatch<string>(mids.map((mid) => countCall(lowerAddr, mid)), deadline);
    if (deadline.expired()) searchPartial = true;
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const mid = mids[i];
      const cnt = parseCount(results[i]);
      if (cnt === null) {
        // Pruned or unanswered: do not pretend the nonce was 0 (that walks the search upward forever).
        s.partial = true;
        searchPartial = true;
        s.lo = mid + 1;
      } else if (cnt > s.k) {
        s.result = mid;
        s.hi = mid - 1;
      } else {
        s.lo = mid + 1;
      }
      if (s.lo > s.hi) s.done = true;
    }
  }
  if (state.some((s) => !s.done)) searchPartial = true;

  const foundBlocks = new Map<number, number>();
  for (const s of state) {
    if (s.result !== null) foundBlocks.set(s.k, s.result);
    if (s.partial || !s.done) searchPartial = true;
  }

  const uniqueBlocks = Array.from(new Set(foundBlocks.values())).filter(
    (b) => (beforeBlock === undefined || b < beforeBlock) && b >= stateFloor,
  );
  if (floorCount !== null && floorCount > 0 && !uniqueBlocks.includes(stateFloor)) {
    uniqueBlocks.push(stateFloor);
  }
  const blockResults = uniqueBlocks.length
    ? await runBatch<RpcBlock>(
        uniqueBlocks.map((b) => ({ method: "eth_getBlockByNumber", params: [toHex(b), true] })),
        deadline,
      )
    : [];
  const blockMap = new Map<number, RpcBlock>();
  for (let i = 0; i < uniqueBlocks.length; i++) {
    const blk = blockResults[i];
    if (!blk) {
      searchPartial = true;
      continue;
    }
    blockMap.set(uniqueBlocks[i], blk);
    rememberTimestamp(timestamps, blk);
  }

  const out: RpcTx[] = [];
  const foundNonces = new Set<number>();
  const take = (tx: RpcTx) => {
    if (!sameAddr(tx.from, lowerAddr) || tx.nonce == null) return;
    const nonce = parseHexInt(tx.nonce);
    foundNonces.add(nonce);
    if (!out.some((item) => item.hash === tx.hash)) out.push(tx);
  };
  for (const [k, b] of foundBlocks.entries()) {
    const blk = blockMap.get(b);
    if (!blk?.transactions) continue;
    for (const tx of blk.transactions) {
      if (typeof tx === "string") continue;
      if (sameAddr(tx.from, lowerAddr) && parseHexInt(tx.nonce) === k) {
        take(tx);
        break;
      }
    }
  }
  const floorBlock = blockMap.get(stateFloor);
  if (floorBlock?.transactions) {
    for (const tx of floorBlock.transactions) {
      if (typeof tx === "string") continue;
      take(tx);
    }
  }

  const missingNonces: number[] = [];
  if (floorCount !== null && floorCount > 0) {
    for (let k = 0; k < floorCount; k++) {
      if (!foundNonces.has(k)) missingNonces.push(k);
    }
  }
  return {
    txs: out,
    partial: searchPartial || deadline.expired(),
    prunedBeforeBlock: missingNonces.length > 0 ? stateFloor : undefined,
    missingNonces,
    timestamps,
  };
}

function collectNative(block: RpcBlock, lowerAddr: string, hashes: Set<string>, timestamps: Map<number, number>): void {
  rememberTimestamp(timestamps, block);
  for (const tx of block.transactions ?? []) {
    if (!tx || typeof tx === "string" || !tx.hash) continue;
    if (sameAddr(tx.from, lowerAddr) || sameAddr(tx.to, lowerAddr)) hashes.add(tx.hash);
  }
}

/** Walk full blocks from `fromHeight` down through `toHeight`. Stops at the first hole so nothing is skipped. */
async function scanNativeRange(
  fromHeight: number,
  toHeight: number,
  lowerAddr: string,
  hashes: Set<string>,
  timestamps: Map<number, number>,
  deadline: Deadline,
): Promise<{ coveredDownTo: number; truncated: boolean }> {
  let covered = fromHeight + 1;
  if (fromHeight < toHeight) return { coveredDownTo: covered, truncated: false };
  let cursor = fromHeight;
  while (cursor >= toHeight) {
    if (deadline.expired()) return { coveredDownTo: covered, truncated: true };
    const batchEnd = cursor;
    const batchStart = Math.max(toHeight, batchEnd - BATCH_SIZE + 1);
    const heights: number[] = [];
    for (let height = batchEnd; height >= batchStart; height--) heights.push(height);
    const blocks = await runBatch<RpcBlock>(
      heights.map((height) => ({ method: "eth_getBlockByNumber", params: [toHex(height), true] })),
      deadline,
    );
    for (let i = 0; i < heights.length; i++) {
      const blk = blocks[i];
      if (!blk) return { coveredDownTo: covered, truncated: true };
      collectNative(blk, lowerAddr, hashes, timestamps);
      covered = heights[i];
    }
    cursor = batchStart - 1;
  }
  return { coveredDownTo: covered, truncated: deadline.expired() };
}

async function fetchIncoming(
  address: string,
  head: number,
  beforeBlock: number | undefined,
  deadline: Deadline,
): Promise<IncomingScan> {
  const lowerAddr = address.toLowerCase();
  const topic = addrTopic(lowerAddr);
  const hashes = new Set<string>();
  const timestamps = new Map<number, number>();
  let truncated = false;
  const scanHead = beforeBlock !== undefined ? Math.min(beforeBlock - 1, head) : head;
  if (scanHead < 0) return { txs: [], scannedTo: 0, truncated: false, timestamps };

  const range = LOG_WINDOW * LOG_WINDOWS;
  const startBlock = Math.max(0, scanHead - range + 1);
  let windowEnd = scanHead;
  let windows = 0;
  while (windowEnd >= startBlock && windows < LOG_WINDOWS) {
    if (deadline.expired()) {
      truncated = true;
      break;
    }
    const windowStart = Math.max(startBlock, windowEnd - LOG_WINDOW + 1);
    const fromHex = toHex(windowStart);
    const toHexStr = toHex(windowEnd);
    const results = await runBatch<RpcLog[]>(
      [
        { method: "eth_getLogs", params: [{ address: lowerAddr, fromBlock: fromHex, toBlock: toHexStr }] },
        { method: "eth_getLogs", params: [{ fromBlock: fromHex, toBlock: toHexStr, topics: [null, null, topic] }] },
      ],
      deadline,
    );
    for (const r of results) {
      if (!r) {
        truncated = true;
        continue;
      }
      for (const log of r) {
        if (log.transactionHash) hashes.add(log.transactionHash);
      }
    }
    windows += 1;
    if (windowStart === startBlock) break;
    windowEnd = windowStart - 1;
  }

  // Recent window first, then keep walking older full blocks until the deadline.
  let covered = scanHead + 1;
  if (!deadline.expired()) {
    const recentStart = Math.max(0, scanHead - RECENT_BLOCKS + 1);
    const recent = await scanNativeRange(scanHead, recentStart, lowerAddr, hashes, timestamps, deadline);
    covered = recent.coveredDownTo;
    truncated = truncated || recent.truncated;
    if (!recent.truncated && covered > 0 && !deadline.expired()) {
      const older = await scanNativeRange(covered - 1, 0, lowerAddr, hashes, timestamps, deadline);
      covered = older.coveredDownTo;
      truncated = truncated || older.truncated;
    }
  } else {
    truncated = true;
  }

  if (hashes.size === 0) return { txs: [], scannedTo: covered, truncated, timestamps };
  const hashArr = Array.from(hashes);
  const txResults = await runBatch<RpcTx>(
    hashArr.map((h) => ({ method: "eth_getTransactionByHash", params: [h] })),
    deadline,
  );
  if (deadline.expired()) truncated = true;
  const out: RpcTx[] = [];
  for (const tx of txResults) {
    if (!tx) continue;
    if (beforeBlock !== undefined && parseHexInt(tx.blockNumber) >= beforeBlock) continue;
    out.push(tx);
  }
  return { txs: out, scannedTo: covered, truncated, timestamps };
}

export function addressHistoryCacheTtlMs(result: AddressHistoryResult): number {
  if (result.partial || result.truncated || result.prunedBeforeBlock !== undefined) {
    return ADDRESS_HISTORY_PARTIAL_CACHE_TTL_MS;
  }
  return ADDRESS_HISTORY_CACHE_TTL_MS;
}

const historyCache = new Map<string, { at: number; ttl: number; pending: boolean; value: Promise<AddressHistoryResult> }>();

export function resetAddressHistoryCacheForTests(): void {
  historyCache.clear();
}

export function fetchAddressHistory(
  address: string,
  limit: number,
  opts?: { beforeBlock?: number; budgetMs?: number },
): Promise<AddressHistoryResult> {
  const safeLimit = Math.max(1, Math.min(limit || 30, 100));
  const beforeBlock = opts?.beforeBlock;
  const budgetMs = opts?.budgetMs ?? ADDRESS_HISTORY_BUDGET_MS;
  const key = `${readEvmRpcUrl() ?? ""}|${address.toLowerCase()}|${safeLimit}|${beforeBlock ?? ""}`;
  const hit = historyCache.get(key);
  if (hit && (hit.pending || Date.now() - hit.at < hit.ttl)) return hit.value;
  if (historyCache.size > 200) historyCache.clear();
  const value = loadAddressHistory(address, safeLimit, beforeBlock, budgetMs);
  const entry = { at: Date.now(), ttl: ADDRESS_HISTORY_PARTIAL_CACHE_TTL_MS, pending: true, value };
  historyCache.set(key, entry);
  value.then((result) => {
    entry.pending = false;
    entry.at = Date.now();
    entry.ttl = addressHistoryCacheTtlMs(result);
  });
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
    const nonceHex = await evmJsonRpc<string>("eth_getTransactionCount", [lowerAddr, headHex]);
    nonce = parseHexInt(nonceHex);
  } catch {
    return { items: [], outgoing: nonce, incoming: 0, hasMore: false, partial: true, truncated: true };
  }

  if (deadline.expired()) {
    return {
      items: [],
      outgoing: nonce,
      incoming: 0,
      hasMore: head > 0,
      nextBeforeBlock: beforeBlock ?? head + 1,
      truncated: true,
      partial: true,
    };
  }

  // Nonce probes first. A parallel full-block walk on this node starves them and drops every outgoing tx.
  const outgoingRes = await fetchOutgoing(lowerAddr, nonce, head, beforeBlock, limit, deadline).catch((): OutgoingScan => ({
    txs: [],
    partial: true,
    missingNonces: [],
    timestamps: new Map(),
  }));
  const incomingRes = await fetchIncoming(lowerAddr, head, beforeBlock, deadline).catch(() => ({
    txs: [] as RpcTx[],
    scannedTo: head + 1,
    truncated: true,
    timestamps: new Map<number, number>(),
  }));

  const merged = new Map<string, RpcTx>();
  for (const tx of outgoingRes.txs) {
    if (tx.hash && !merged.has(tx.hash)) merged.set(tx.hash, tx);
  }
  for (const tx of incomingRes.txs) {
    if (tx.hash && !merged.has(tx.hash)) merged.set(tx.hash, tx);
  }
  const all = Array.from(merged.values());
  all.sort((a, b) => parseHexInt(b.blockNumber) - parseHexInt(a.blockNumber));
  const sliced = all.slice(0, limit);

  const timestamps = new Map<number, number>([...outgoingRes.timestamps, ...incomingRes.timestamps]);
  const missingHeights = Array.from(new Set(sliced.map((tx) => parseHexInt(tx.blockNumber)).filter((h) => h > 0 && !timestamps.has(h))));
  if (missingHeights.length > 0 && !deadline.expired()) {
    const headers = await runBatch<{ number?: string; timestamp?: string }>(
      missingHeights.map((h) => ({ method: "eth_getBlockByNumber", params: [toHex(h), false] })),
      deadline,
    );
    for (const header of headers) rememberTimestamp(timestamps, header);
  }

  const foundNonces = new Set<number>();
  for (const tx of all) {
    if (!sameAddr(tx.from, lowerAddr) || tx.nonce == null) continue;
    foundNonces.add(parseHexInt(tx.nonce));
  }
  const stillMissing = outgoingRes.missingNonces.filter((k) => !foundNonces.has(k));
  const prunedCleared = outgoingRes.missingNonces.length > 0 && stillMissing.length === 0;
  const prunedBeforeBlock = prunedCleared ? undefined : outgoingRes.prunedBeforeBlock;
  const partial = Boolean(
    deadline.expired() || incomingRes.truncated || outgoingRes.partial || prunedBeforeBlock !== undefined,
  );
  const nativeCursor = incomingRes.scannedTo;
  const oldestItem = sliced.length > 0 ? Math.min(...sliced.map((tx) => parseHexInt(tx.blockNumber))) : undefined;
  const continueFrom = oldestItem !== undefined ? Math.max(oldestItem, nativeCursor) : nativeCursor;
  const scannedEverything = nativeCursor <= 0;
  const hasMore = sliced.length < all.length || (partial && !scannedEverything && continueFrom > 0);
  let incomingCount = 0;
  for (const tx of sliced) {
    if (!sameAddr(tx.from, lowerAddr)) incomingCount++;
  }

  return {
    items: sliced.map((tx) => mapTx(tx, timestamps.get(parseHexInt(tx.blockNumber)))),
    outgoing: nonce,
    incoming: incomingCount,
    hasMore,
    nextBeforeBlock: hasMore ? continueFrom : undefined,
    truncated: partial,
    partial,
    ...(prunedBeforeBlock !== undefined ? { prunedBeforeBlock } : {}),
  };
}
