import { formatUnits } from "viem";
import { evmJsonRpc, evmJsonRpcBatch } from "@/lib/evm/rpc-server";
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
const LOG_WINDOW = 9000;
const LOG_RANGE = 60000;
const RECENT_BLOCKS = 1000;

async function runBatch<T>(calls: RpcCall[]): Promise<Array<T | null>> {
  const chunks: RpcCall[][] = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) chunks.push(calls.slice(i, i + BATCH_SIZE));
  const parts = await Promise.all(chunks.map((c) => evmJsonRpcBatch<T>(c).catch(() => c.map(() => null))));
  return parts.flat();
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
  const type: string =
    tx.input && tx.input !== "0x" ? "contract_call" : "transfer";
  return {
    id: tx.hash,
    type,
    from: tx.from,
    to: tx.to ?? undefined,
    amount,
    blockHeight,
  };
}

async function findNonceBlock(
  address: string,
  nonce: number,
  head: number,
): Promise<number | null> {
  let lo = 0;
  let hi = head;
  let result: number | null = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const count = await evmJsonRpc<string>("eth_getTransactionCount", [
      address,
      toHex(mid),
    ]);
    if (parseHexInt(count) > nonce) {
      result = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return result;
}

async function fetchOutgoing(
  address: string,
  nonce: number,
  head: number,
  limit: number,
): Promise<RpcTx[]> {
  const targetNonces: number[] = [];
  const count = Math.min(nonce, limit);
  for (let i = 0; i < count; i++) {
    targetNonces.push(nonce - 1 - i);
  }
  if (targetNonces.length === 0) return [];

  const lowerAddr = address.toLowerCase();
  const foundBlocks = new Map<number, number>(); // nonce -> block

  // Parallel binary search rounds
  const state = targetNonces.map((k) => ({
    k,
    lo: 0,
    hi: head,
    result: null as number | null,
    done: false,
  }));

  while (state.some((s) => !s.done)) {
    const active = state.filter((s) => !s.done);
    const calls: RpcCall[] = active.map((s) => {
      const mid = Math.floor((s.lo + s.hi) / 2);
      return {
        method: "eth_getTransactionCount",
        params: [address, toHex(mid)],
      };
    });
    const results = await runBatch<string>(calls);
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const res = results[i];
      const mid = Math.floor((s.lo + s.hi) / 2);
      const cnt = parseHexInt(res);
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

  if (foundBlocks.size === 0) return [];

  const uniqueBlocks = Array.from(new Set(foundBlocks.values()));
  const blockCalls: RpcCall[] = uniqueBlocks.map((b) => ({
    method: "eth_getBlockByNumber",
    params: [toHex(b), true],
  }));
  const blockResults = await runBatch<RpcBlock>(blockCalls);

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
      if (
        tx.from.toLowerCase() === lowerAddr &&
        parseHexInt(tx.nonce) === k
      ) {
        out.push(tx);
        break;
      }
    }
  }
  return out;
}

async function fetchIncoming(
  address: string,
  head: number,
): Promise<RpcTx[]> {
  const lowerAddr = address.toLowerCase();
  const topic = addrTopic(address);
  const hashes = new Set<string>();

  // Logs windows
  const startBlock = Math.max(0, head - LOG_RANGE + 1);
  let windowEnd = head;
  while (windowEnd >= startBlock) {
    const windowStart = Math.max(startBlock, windowEnd - LOG_WINDOW + 1);
    const fromHex = toHex(windowStart);
    const toHexStr = toHex(windowEnd);
    const calls: RpcCall[] = [
      {
        method: "eth_getLogs",
        params: [
          { address, fromBlock: fromHex, toBlock: toHexStr },
        ],
      },
      {
        method: "eth_getLogs",
        params: [
          {
            fromBlock: fromHex,
            toBlock: toHexStr,
            topics: [null, null, topic],
          },
        ],
      },
    ];
    const results = await runBatch<RpcLog[]>(calls);
    for (const r of results) {
      if (r) {
        for (const log of r) {
          if (log.transactionHash) hashes.add(log.transactionHash);
        }
      }
    }
    if (windowStart === startBlock) break;
    windowEnd = windowStart - 1;
  }

  // Recent native txs
  const recentStart = Math.max(0, head - RECENT_BLOCKS + 1);
  const recentCalls: RpcCall[] = [];
  for (let b = recentStart; b <= head; b++) {
    recentCalls.push({
      method: "eth_getBlockByNumber",
      params: [toHex(b), true],
    });
  }
  const recentBlocks = await runBatch<RpcBlock>(recentCalls);
  for (const blk of recentBlocks) {
    if (!blk) continue;
    for (const tx of blk.transactions) {
      if (tx.to && tx.to.toLowerCase() === lowerAddr) {
        hashes.add(tx.hash);
      }
    }
  }

  if (hashes.size === 0) return [];

  const hashArr = Array.from(hashes);
  const txCalls: RpcCall[] = hashArr.map((h) => ({
    method: "eth_getTransactionByHash",
    params: [h],
  }));
  const txResults = await runBatch<RpcTx>(txCalls);
  const out: RpcTx[] = [];
  for (const tx of txResults) {
    if (tx) out.push(tx);
  }
  return out;
}

const historyCache = new Map<string, { at: number; value: Promise<{ items: EvmExplorerTx[]; outgoing: number; incoming: number }> }>();

export function fetchAddressHistory(address: string, limit: number) {
  const key = `${address.toLowerCase()}|${limit}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  if (historyCache.size > 200) historyCache.clear();
  const value = loadAddressHistory(address, limit);
  historyCache.set(key, { at: Date.now(), value });
  value.catch(() => historyCache.delete(key));
  return value;
}

async function loadAddressHistory(
  address: string,
  limit: number,
): Promise<{ items: EvmExplorerTx[]; outgoing: number; incoming: number }> {
  const lowerAddr = address.toLowerCase();

  let head = 0;
  let nonce = 0;
  try {
    const headHex = await evmJsonRpc<string>("eth_blockNumber", []);
    head = parseHexInt(headHex);
    const nonceHex = await evmJsonRpc<string>("eth_getTransactionCount", [
      address,
      headHex,
    ]);
    nonce = parseHexInt(nonceHex);
  } catch {
    return { items: [], outgoing: 0, incoming: 0 };
  }

  const [outgoingTxs, incomingTxs] = await Promise.all([
    fetchOutgoing(address, nonce, head, limit).catch((): RpcTx[] => []),
    fetchIncoming(address, head).catch((): RpcTx[] => []),
  ]);

  const merged = new Map<string, RpcTx>();
  for (const tx of outgoingTxs) {
    if (!merged.has(tx.hash)) merged.set(tx.hash, tx);
  }
  for (const tx of incomingTxs) {
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

  return {
    items,
    outgoing: nonce,
    incoming: incomingCount,
  };
}
