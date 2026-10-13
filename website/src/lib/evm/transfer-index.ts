import { getAddress, type Hex } from "viem";
import { evmJsonRpc } from "@/lib/evm/rpc-server";
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

export async function fetchTransferLogs(
  tokenAddress: string,
  fromBlock = deploymentStartBlock(),
  toBlock?: number,
): Promise<IndexedTransfer[]> {
  const token = getAddress(tokenAddress);
  const latest = toBlock ?? hexToNumber(await evmJsonRpc<string>("eth_blockNumber", []));
  // Cosmos EVM caps eth_getLogs at 10,000 blocks per query; scan in windows.
  const logs: RpcLog[] = [];
  for (let start = Math.max(0, fromBlock); start <= latest; start += 9_000) {
    const end = Math.min(latest, start + 8_999);
    const chunk = await evmJsonRpc<RpcLog[]>("eth_getLogs", [
      {
        address: token,
        topics: [TRANSFER_TOPIC],
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
      },
    ]);
    if (Array.isArray(chunk)) logs.push(...chunk);
  }
  if (!Array.isArray(logs)) return [];
  return logs
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
}

export type TokenHolderRow = { address: string; balance: bigint };

/** Full-history log scans are expensive; cache briefly to blunt anonymous scraping. */
const HOLDERS_TTL_MS = 30_000;
const holdersCache = new Map<string, { at: number; value: TokenHolderRow[] }>();

export function resetTransferIndexCacheForTests(): void {
  holdersCache.clear();
}

/** Aggregate wallet balances from Transfer logs (excludes zero-balance addresses). */
export async function aggregateHoldersFromTransfers(tokenAddress: string): Promise<TokenHolderRow[]> {
  const cacheKey = tokenAddress.trim().toLowerCase();
  const cached = holdersCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HOLDERS_TTL_MS) return cached.value;
  const transfers = await fetchTransferLogs(tokenAddress);
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
  holdersCache.set(cacheKey, { at: Date.now(), value });
  return value;
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
