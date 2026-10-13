import {
  decodeEventLog,
  encodeEventTopics,
  encodeFunctionData,
  decodeFunctionResult,
  formatUnits,
  getAddress,
  type Hex,
} from "viem";
import { readEvmDeployments } from "@/lib/evm/config";
import { evmJsonRpc, evmJsonRpcBatch } from "@/lib/evm/rpc-server";
import { fetchLogsWindowed } from "@/lib/evm/chain-catalog";
import type { MarketTrade } from "@/lib/market-chart";
import { curveLiquidityNative, curveProgressPercent, marketCapNative, poolLiquidityNative } from "@/lib/market-chart";

const curveEventsAbi = [
  {
    type: "event",
    name: "CurveBuy",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "nativeIn", type: "uint256", indexed: false },
      { name: "tokensOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CurveSell",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "tokensIn", type: "uint256", indexed: false },
      { name: "nativeOut", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
] as const;

const swapEventAbi = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "amount0In", type: "uint256", indexed: false },
      { name: "amount1In", type: "uint256", indexed: false },
      { name: "amount0Out", type: "uint256", indexed: false },
      { name: "amount1Out", type: "uint256", indexed: false },
      { name: "to", type: "address", indexed: true },
    ],
  },
] as const;

/** `curves(address)` auto-generated getter for `BondingCurveMarket.curves`, flattening the nested `CurveMath.State`. */
const curveStateAbi = [
  {
    type: "function",
    name: "curves",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "virtualTokenReserve", type: "uint256" },
      { name: "virtualNativeReserve", type: "uint256" },
      { name: "actualNativeReserve", type: "uint256" },
      { name: "currentTokenReserve", type: "uint256" },
      { name: "invariantK", type: "uint256" },
      { name: "migrationThreshold", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "migrated", type: "bool" },
      { name: "liquidityReserve", type: "uint256" },
      { name: "ecosystemReserve", type: "uint256" },
      { name: "curveInventory", type: "uint256" },
    ],
  },
] as const;

const pairViewAbi = [
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
] as const;

const getPairAbi = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "address" }],
  },
] as const;

const erc20ViewAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

async function ethCall(to: string, data: Hex): Promise<Hex> {
  const out = await evmJsonRpc<string>("eth_call", [{ to, data }, "latest"]).catch(() => "0x");
  return (out || "0x") as Hex;
}

function timestampMsFromBlock(block: { timestamp?: string } | null | undefined): number {
  const seconds = block?.timestamp ? Number.parseInt(block.timestamp, 16) : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

/**
 * Timestamps for every distinct block in one batched request. Trade history can span hundreds of
 * blocks and the previous per-block fan-out opened that many parallel HTTP requests; a node that
 * rejects batches falls back to the per-block path so timestamps still resolve.
 */
async function blockTimestampsMs(blockNumberHexes: Iterable<string>): Promise<Map<string, number>> {
  const unique = [...new Set(blockNumberHexes)];
  if (!unique.length) return new Map();
  const batch = await evmJsonRpcBatch<{ timestamp?: string }>(
    unique.map((hex) => ({ method: "eth_getBlockByNumber", params: [hex, false] })),
  ).catch(() => null);
  if (batch && batch.some((block) => block?.timestamp)) {
    return new Map(unique.map((hex, index) => [hex, timestampMsFromBlock(batch[index])] as const));
  }
  const entries = await Promise.all(
    unique.map(async (hex) => {
      const block = await evmJsonRpc<{ timestamp?: string }>("eth_getBlockByNumber", [hex, false]).catch(() => null);
      return [hex, timestampMsFromBlock(block)] as const;
    }),
  );
  return new Map(entries);
}

type CurveState = {
  virtualTokenReserve: bigint;
  virtualNativeReserve: bigint;
  actualNativeReserve: bigint;
  currentTokenReserve: bigint;
  active: boolean;
  migrated: boolean;
  curveInventory: bigint;
  migrationThreshold: bigint;
};

async function readCurveState(bondingCurve: string, token: string): Promise<CurveState | null> {
  const data = encodeFunctionData({ abi: curveStateAbi, functionName: "curves", args: [getAddress(token)] });
  const raw = await ethCall(bondingCurve, data);
  if (raw === "0x") return null;
  try {
    const [
      virtualTokenReserve,
      virtualNativeReserve,
      actualNativeReserve,
      currentTokenReserve,
      ,
      migrationThreshold,
      active,
      migrated,
      ,
      ,
      curveInventory,
    ] = decodeFunctionResult({ abi: curveStateAbi, functionName: "curves", data: raw });
    return { virtualTokenReserve, virtualNativeReserve, actualNativeReserve, currentTokenReserve, active, migrated, curveInventory, migrationThreshold };
  } catch {
    return null;
  }
}

async function readPairAddress(ammFactory: string, token: string, wppl: string): Promise<string | null> {
  const data = encodeFunctionData({ abi: getPairAbi, functionName: "getPair", args: [getAddress(token), getAddress(wppl)] });
  const raw = await ethCall(ammFactory, data);
  if (raw === "0x") return null;
  try {
    const pair = decodeFunctionResult({ abi: getPairAbi, functionName: "getPair", data: raw });
    return pair && pair !== "0x0000000000000000000000000000000000000000" ? pair : null;
  } catch {
    return null;
  }
}

async function readPairReserves(pair: string): Promise<{ nativeReserve: bigint; tokenReserve: bigint } | null> {
  const [reservesRaw, token0Raw] = await Promise.all([
    ethCall(pair, encodeFunctionData({ abi: pairViewAbi, functionName: "getReserves" })),
    ethCall(pair, encodeFunctionData({ abi: pairViewAbi, functionName: "token0" })),
  ]);
  if (reservesRaw === "0x" || token0Raw === "0x") return null;
  try {
    const [reserve0, reserve1] = decodeFunctionResult({ abi: pairViewAbi, functionName: "getReserves", data: reservesRaw });
    const token0 = decodeFunctionResult({ abi: pairViewAbi, functionName: "token0", data: token0Raw });
    const dep = readEvmDeployments();
    const wppl = dep.contracts.wppl ?? "";
    const wpplIsToken0 = typeof token0 === "string" && wppl !== "" && token0.toLowerCase() === wppl.toLowerCase();
    return wpplIsToken0
      ? { nativeReserve: reserve0, tokenReserve: reserve1 }
      : { nativeReserve: reserve1, tokenReserve: reserve0 };
  } catch {
    return null;
  }
}

async function readErc20(token: string): Promise<{ totalSupply: bigint; decimals: number }> {
  const [supplyRaw, decimalsRaw] = await Promise.all([
    ethCall(token, encodeFunctionData({ abi: erc20ViewAbi, functionName: "totalSupply" })),
    ethCall(token, encodeFunctionData({ abi: erc20ViewAbi, functionName: "decimals" })),
  ]);
  let totalSupply = BigInt(0);
  let decimals = 18;
  try {
    if (supplyRaw !== "0x") totalSupply = decodeFunctionResult({ abi: erc20ViewAbi, functionName: "totalSupply", data: supplyRaw });
  } catch {
    /* keep default */
  }
  try {
    if (decimalsRaw !== "0x") decimals = decodeFunctionResult({ abi: erc20ViewAbi, functionName: "decimals", data: decimalsRaw });
  } catch {
    /* keep default */
  }
  return { totalSupply, decimals };
}

async function curveTrades(bondingCurve: string, token: string): Promise<MarketTrade[]> {
  const tokenTopic = `0x${token.slice(2).toLowerCase().padStart(64, "0")}`;
  const [buyTopic] = encodeEventTopics({ abi: curveEventsAbi, eventName: "CurveBuy" });
  const [sellTopic] = encodeEventTopics({ abi: curveEventsAbi, eventName: "CurveSell" });
  const [buyLogs, sellLogs] = await Promise.all([
    fetchLogsWindowed(bondingCurve, [buyTopic, tokenTopic]),
    fetchLogsWindowed(bondingCurve, [sellTopic, tokenTopic]),
  ]);
  const blockHexes = [...buyLogs, ...sellLogs].map((log) => log.blockNumber).filter((v): v is string => Boolean(v));
  const timestamps = await blockTimestampsMs(blockHexes);

  const trades: MarketTrade[] = [];
  for (const log of buyLogs) {
    if (!log.data || !log.topics) continue;
    try {
      const decoded = decodeEventLog({ abi: curveEventsAbi, eventName: "CurveBuy", data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      const nativeIn = Number(decoded.args.nativeIn) / 1e18;
      const tokensOut = Number(decoded.args.tokensOut) / 1e18;
      if (tokensOut > 0) {
        trades.push({ ts: timestamps.get(log.blockNumber ?? "") ?? 0, price: nativeIn / tokensOut, volumeNative: nativeIn });
      }
    } catch {
      /* skip undecodable log */
    }
  }
  for (const log of sellLogs) {
    if (!log.data || !log.topics) continue;
    try {
      const decoded = decodeEventLog({ abi: curveEventsAbi, eventName: "CurveSell", data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      const tokensIn = Number(decoded.args.tokensIn) / 1e18;
      const nativeOut = Number(decoded.args.nativeOut) / 1e18;
      if (tokensIn > 0) {
        trades.push({ ts: timestamps.get(log.blockNumber ?? "") ?? 0, price: nativeOut / tokensIn, volumeNative: nativeOut });
      }
    } catch {
      /* skip undecodable log */
    }
  }
  return trades;
}

async function ammTrades(pair: string, decimals: number): Promise<MarketTrade[]> {
  const dep = readEvmDeployments();
  const wppl = dep.contracts.wppl ?? "";
  const token0Raw = await ethCall(pair, encodeFunctionData({ abi: pairViewAbi, functionName: "token0" }));
  if (token0Raw === "0x") return [];
  let wpplIsToken0: boolean;
  try {
    const token0 = decodeFunctionResult({ abi: pairViewAbi, functionName: "token0", data: token0Raw });
    wpplIsToken0 = typeof token0 === "string" && wppl !== "" && token0.toLowerCase() === wppl.toLowerCase();
  } catch {
    return [];
  }

  const [swapTopic] = encodeEventTopics({ abi: swapEventAbi, eventName: "Swap" });
  const logs = await fetchLogsWindowed(pair, [swapTopic]);
  const timestamps = await blockTimestampsMs(logs.map((log) => log.blockNumber).filter((v): v is string => Boolean(v)));

  const trades: MarketTrade[] = [];
  for (const log of logs) {
    if (!log.data || !log.topics) continue;
    try {
      const decoded = decodeEventLog({ abi: swapEventAbi, eventName: "Swap", data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
      const { amount0In, amount1In, amount0Out, amount1Out } = decoded.args;
      const nativeRaw = wpplIsToken0 ? (amount0In > BigInt(0) ? amount0In : amount0Out) : (amount1In > BigInt(0) ? amount1In : amount1Out);
      const tokenRaw = wpplIsToken0 ? (amount1In > BigInt(0) ? amount1In : amount1Out) : (amount0In > BigInt(0) ? amount0In : amount0Out);
      const nativeAmount = Number(nativeRaw) / 1e18;
      const tokenAmount = Number(tokenRaw) / 10 ** decimals;
      if (tokenAmount > 0 && nativeAmount > 0) {
        trades.push({ ts: timestamps.get(log.blockNumber ?? "") ?? 0, price: nativeAmount / tokenAmount, volumeNative: nativeAmount });
      }
    } catch {
      /* skip undecodable log */
    }
  }
  return trades;
}

export type TokenMarketSnapshot =
  | { hasMarket: false }
  | {
      hasMarket: true;
      migrated: boolean;
      priceNative: number;
      marketCapNative: number;
      liquidityNative: number;
      progressPercent: number;
      totalSupply: number;
      decimals: number;
      trades: MarketTrade[];
      fetchedAt: number;
    };

/** Builds the market snapshot (price/cap/liquidity/progress + trade history) for one EVM token. */
export async function fetchTokenMarketSnapshot(tokenAddress: string): Promise<TokenMarketSnapshot> {
  const dep = readEvmDeployments();
  const bondingCurve = dep.contracts.bondingCurve;
  const ammFactory = dep.contracts.ammFactory;
  const wppl = dep.contracts.wppl;
  if (!bondingCurve || !ammFactory || !wppl) return { hasMarket: false };

  const token = getAddress(tokenAddress);
  const curveState = await readCurveState(bondingCurve, token);
  if (!curveState || !(curveState.active || curveState.migrated)) return { hasMarket: false };

  const { totalSupply: supplyRaw, decimals } = await readErc20(token);
  const totalSupply = Number(formatUnits(supplyRaw, decimals));

  const curveHistory = await curveTrades(bondingCurve, token);
  let ammHistory: MarketTrade[] = [];
  let pairReserves: { nativeReserve: bigint; tokenReserve: bigint } | null = null;
  if (curveState.migrated) {
    const pair = await readPairAddress(ammFactory, token, wppl);
    if (pair) {
      ammHistory = await ammTrades(pair, decimals);
      pairReserves = await readPairReserves(pair);
    }
  }

  const trades = [...curveHistory, ...ammHistory].sort((a, b) => a.ts - b.ts);

  let priceNative: number;
  let liquidityNative: number;
  if (curveState.migrated && pairReserves) {
    const nativeReserve = Number(formatUnits(pairReserves.nativeReserve, 18));
    const tokenReserve = Number(formatUnits(pairReserves.tokenReserve, decimals));
    priceNative = tokenReserve > 0 ? nativeReserve / tokenReserve : 0;
    liquidityNative = poolLiquidityNative(nativeReserve);
  } else {
    const virtualToken = Number(formatUnits(curveState.virtualTokenReserve, decimals));
    const virtualNative = Number(formatUnits(curveState.virtualNativeReserve, 18));
    priceNative = virtualToken > 0 ? virtualNative / virtualToken : 0;
    liquidityNative = curveLiquidityNative(Number(formatUnits(curveState.actualNativeReserve, 18)));
  }

  const progressPercent = curveState.migrated
    ? 100
    : curveProgressPercent(
        Number(formatUnits(curveState.currentTokenReserve, decimals)),
        Number(formatUnits(curveState.migrationThreshold, decimals)),
        Number(formatUnits(curveState.curveInventory, decimals)),
      );

  return {
    hasMarket: true,
    migrated: curveState.migrated,
    priceNative,
    marketCapNative: marketCapNative(priceNative, totalSupply),
    liquidityNative,
    progressPercent,
    totalSupply,
    decimals,
    trades,
    fetchedAt: Date.now(),
  };
}

const MARKET_TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: TokenMarketSnapshot }>();

export async function fetchTokenMarketSnapshotCached(tokenAddress: string): Promise<TokenMarketSnapshot> {
  const key = tokenAddress.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MARKET_TTL_MS) return hit.value;
  const value = await fetchTokenMarketSnapshot(tokenAddress);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function resetTokenMarketCacheForTests(): void {
  cache.clear();
}
