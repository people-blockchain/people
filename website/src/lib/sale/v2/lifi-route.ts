/**
 * One-signature PPL purchase from another network through a LI.FI destination contract call.
 *
 * The buyer signs one transaction on the source network. LI.FI swaps and bridges to USDC on
 * Base, and its Executor on Base then approves the hub and calls
 * `PplCurveHubV2.buy(usdcIn, minPplOut, recipient = buyer, referrer)`. Any USDC the call does
 * not use goes back to the buyer, and if the call reverts the bridge receiver sends all of the
 * bridged USDC to the buyer on Base (`toFallbackAddress`). See docs/v2/LIFI-ONE-TX.md.
 *
 * Everything here is pure or takes an injected `fetch`, so it is unit-tested without the network.
 *
 * @see https://docs.li.fi/api-reference/perform-multiple-contract-calls-across-blockchains-beta
 * @see https://docs.li.fi/introduction/lifi-architecture/smart-contract-addresses
 */

import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";

import { PPL_CURVE_HUB_V2_ABI, ZERO_ADDRESS } from "./abi";

export const LIFI_API_URL = "https://li.quest/v1";
export const LIFI_INTEGRATOR = "PEOPLE";
export const LIFI_BASE_CHAIN_ID = 8453;

/**
 * LI.FI `Executor` on Base (lifinance/contracts `deployments/base.json`). It is the `msg.sender`
 * of `hub.buy` for every destination call: bridge receivers (ReceiverAcrossV4, ReceiverStargateV2)
 * hand the bridged USDC to it, and same-chain Base swaps call it directly. The hub must list it as
 * a `trustedRouter` (Safe, 48 h timelock) before the one-signature path can work.
 */
export const LIFI_BASE_EXECUTOR: Address = "0x4DaC9d1769b9b304cb04741DCDEb2FC14aBdF110";

/** `hub.buy` measured at up to ~321k gas (PplCurveHubV2Gas.t.sol) plus the approval, with headroom. */
export const HUB_BUY_GAS_LIMIT = 500_000;

/** Swap/bridge slippage passed to LI.FI. The PPL floor is separate (`minPplOut`, 1%). */
export const LIFI_SLIPPAGE = 0.005;

/** A quote older than this is fetched again before the buyer signs. */
export const ONE_TX_QUOTE_TTL_MS = 60_000;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type SourceChain = {
  id: number;
  key: "eth" | "bsc" | "pol" | "arb" | "opt" | "ava" | "base" | "sol" | "trn";
  name: string;
  /** LI.FI `/quote/contractCalls` accepts this chain as the source (checked 18 Nov 2026). */
  destinationCall: boolean;
};

/**
 * Source networks offered on /buy. LI.FI answers `422 "Contract calls are not supported for
 * non-EVM chains yet"` for Solana and Tron, so those keep the two-step swap.
 */
export const SOURCE_CHAINS: readonly SourceChain[] = [
  { id: 1, key: "eth", name: "Ethereum", destinationCall: true },
  { id: 56, key: "bsc", name: "BNB Chain", destinationCall: true },
  { id: 137, key: "pol", name: "Polygon", destinationCall: true },
  { id: 42161, key: "arb", name: "Arbitrum", destinationCall: true },
  { id: 10, key: "opt", name: "Optimism", destinationCall: true },
  { id: 43114, key: "ava", name: "Avalanche", destinationCall: true },
  { id: 8453, key: "base", name: "Base", destinationCall: true },
  { id: 1151111081099710, key: "sol", name: "Solana", destinationCall: false },
  { id: 728126428, key: "trn", name: "Tron", destinationCall: false },
];

export function sourceChain(id: number): SourceChain | null {
  return SOURCE_CHAINS.find((chain) => chain.id === id) ?? null;
}

export function supportsDestinationCall(chainId: number): boolean {
  return sourceChain(chainId)?.destinationCall ?? false;
}

export type SourceToken = { chainId: number; symbol: "USDC" | "USDT"; address: Address; decimals: number };

/** Stablecoins the one-signature path accepts (EVM only; addresses match `bridge.ts`). */
export const ONE_TX_SOURCE_TOKENS: readonly SourceToken[] = [
  { chainId: 1, symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { chainId: 1, symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { chainId: 56, symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { chainId: 56, symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  { chainId: 137, symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
  { chainId: 137, symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
  { chainId: 42161, symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
  { chainId: 42161, symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  { chainId: 10, symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
  { chainId: 10, symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
  { chainId: 43114, symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
  { chainId: 43114, symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
  { chainId: 8453, symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
];

export function sourceToken(chainId: number, symbol: "USDC" | "USDT"): SourceToken | null {
  return ONE_TX_SOURCE_TOKENS.find((t) => t.chainId === chainId && t.symbol === symbol) ?? null;
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** Calldata for `hub.buy(usdcIn, minPplOut, recipient, referrer)` run by the LI.FI Executor. */
export function encodeHubBuy(input: {
  usdcIn: bigint;
  minPplOut: bigint;
  recipient: Address;
  referrer?: Address | null;
}): Hex {
  return encodeFunctionData({
    abi: PPL_CURVE_HUB_V2_ABI,
    functionName: "buy",
    args: [input.usdcIn, input.minPplOut, input.recipient, (input.referrer ?? ZERO_ADDRESS) as Address],
  });
}

export type ContractCallsRequest = {
  fromChain: number;
  fromToken: string;
  fromAddress: string;
  toChain: number;
  toToken: string;
  toAmount: string;
  contractCalls: {
    fromAmount: string;
    fromTokenAddress: string;
    toContractAddress: string;
    toContractCallData: Hex;
    toContractGasLimit: string;
    toApprovalAddress: string;
  }[];
  toFallbackAddress: string;
  integrator: string;
  slippage: number;
};

export type OneTxParams = {
  fromChain: number;
  fromToken: Address;
  /** Buyer: signs on the source network and receives the PPL (and any refund) on Base. */
  account: Address;
  hub: Address;
  usdc: Address;
  /** USDC the hub pulls; equals the amount typed in the panel and the LI.FI `toAmount`. */
  usdcIn: bigint;
  minPplOut: bigint;
  referrer?: Address | null;
  slippage?: number;
};

/**
 * Builds the `/quote/contractCalls` body. `toAmount = usdcIn`, so LI.FI quotes the source amount
 * that delivers at least `usdcIn` USDC to the Executor on Base; `hub.buy` pulls exactly `usdcIn`
 * (or less on the final partial fill) and the Executor returns the rest to the buyer.
 */
export function buildContractCallsRequest(p: OneTxParams): ContractCallsRequest {
  if (!supportsDestinationCall(p.fromChain)) throw new Error("unsupportedSourceChain");
  for (const value of [p.fromToken, p.account, p.hub, p.usdc]) {
    if (!ADDRESS_RE.test(value)) throw new Error("badAddress");
  }
  if (p.usdcIn <= BigInt(0)) throw new Error("badAmount");
  if (p.minPplOut <= BigInt(0)) throw new Error("badMinPplOut");
  const amount = p.usdcIn.toString();
  return {
    fromChain: p.fromChain,
    fromToken: p.fromToken,
    fromAddress: p.account,
    toChain: LIFI_BASE_CHAIN_ID,
    toToken: p.usdc,
    toAmount: amount,
    contractCalls: [
      {
        fromAmount: amount,
        fromTokenAddress: p.usdc,
        toContractAddress: p.hub,
        toContractCallData: encodeHubBuy({
          usdcIn: p.usdcIn,
          minPplOut: p.minPplOut,
          recipient: p.account,
          referrer: p.referrer,
        }),
        toContractGasLimit: String(HUB_BUY_GAS_LIMIT),
        toApprovalAddress: p.hub,
      },
    ],
    toFallbackAddress: p.account,
    integrator: LIFI_INTEGRATOR,
    slippage: p.slippage ?? LIFI_SLIPPAGE,
  };
}

type LifiAmount = { amountUSD?: string; included?: boolean };
type LifiToken = { address?: string; chainId?: number; symbol?: string; decimals?: number };

export type LifiStep = {
  type?: string;
  tool?: string;
  action?: {
    fromChainId?: number;
    toChainId?: number;
    fromAddress?: string;
    toAddress?: string;
    fromToken?: LifiToken;
    toToken?: LifiToken;
    toContractAddress?: string;
    toContractCallData?: string;
  };
  estimate?: { fromAmount?: string; toAmount?: string; toAmountMin?: string };
};

export type LifiQuote = {
  tool?: string;
  action?: { fromChainId?: number; toChainId?: number; fromAddress?: string; fromToken?: LifiToken };
  estimate?: {
    fromAmount?: string;
    approvalAddress?: string;
    executionDuration?: number;
    feeCosts?: LifiAmount[];
    gasCosts?: LifiAmount[];
  };
  includedSteps?: LifiStep[];
  transactionRequest?: { to?: string; data?: string; value?: string; gasLimit?: string; chainId?: number };
};

export type OneTxQuoteSummary = {
  tool: string;
  crossChain: boolean;
  fromAmount: bigint;
  fromDecimals: number;
  fromSymbol: string;
  approvalAddress: Address | null;
  /** Least USDC LI.FI guarantees to the Executor on Base (>= usdcIn). */
  minReceivedUsd6: bigint;
  executionDurationSec: number;
  feesUsd: number;
  tx: { to: Address; data: Hex; value: bigint };
};

export type OneTxQuoteCheck = { ok: true; summary: OneTxQuoteSummary } | { ok: false; reason: string };

function toBigInt(raw: string | undefined): bigint | null {
  if (raw === undefined || raw === null) return null;
  try {
    const value = BigInt(raw);
    return value >= BigInt(0) ? value : null;
  } catch {
    return null;
  }
}

function sumUsd(items: LifiAmount[] | undefined): number {
  return (items ?? []).reduce((total, item) => {
    const value = Number.parseFloat(item.amountUSD ?? "0");
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

/**
 * Refuses any quote that would not buy exactly what the buyer asked for: the hub call must run
 * from the trusted Executor with our calldata, and the step feeding it must guarantee `usdcIn`.
 */
export function validateOneTxQuote(
  quote: LifiQuote,
  p: OneTxParams,
  executor: Address = LIFI_BASE_EXECUTOR,
): OneTxQuoteCheck {
  const tx = quote.transactionRequest;
  if (!tx?.to || !ADDRESS_RE.test(tx.to) || !tx.data) return { ok: false, reason: "noTransaction" };
  if (tx.chainId !== undefined && tx.chainId !== p.fromChain) return { ok: false, reason: "wrongSourceChain" };
  if (quote.action?.fromChainId !== p.fromChain) return { ok: false, reason: "wrongSourceChain" };
  if (!sameAddress(quote.action?.fromToken?.address, p.fromToken)) return { ok: false, reason: "wrongSourceToken" };
  if (!sameAddress(quote.action?.fromAddress, p.account)) return { ok: false, reason: "wrongSender" };

  const steps = quote.includedSteps ?? [];
  const callIndex = steps.findIndex((step) => step.type === "custom");
  if (callIndex < 1 || callIndex !== steps.length - 1) return { ok: false, reason: "noContractCall" };
  const call = steps[callIndex];
  if (call.action?.toChainId !== LIFI_BASE_CHAIN_ID) return { ok: false, reason: "wrongDestination" };
  if (!sameAddress(call.action?.fromAddress, executor)) return { ok: false, reason: "unexpectedCaller" };
  if (!sameAddress(call.action?.toContractAddress, p.hub)) return { ok: false, reason: "wrongTarget" };
  if ((call.action?.toContractCallData ?? "").toLowerCase() !== encodeHubBuy({
    usdcIn: p.usdcIn,
    minPplOut: p.minPplOut,
    recipient: p.account,
    referrer: p.referrer,
  }).toLowerCase()) {
    return { ok: false, reason: "wrongCalldata" };
  }
  // Defence in depth: decode too, so a future encoding change cannot slip through.
  try {
    const decoded = decodeFunctionData({ abi: PPL_CURVE_HUB_V2_ABI, data: call.action?.toContractCallData as Hex });
    if (decoded.functionName !== "buy") return { ok: false, reason: "wrongCalldata" };
  } catch {
    return { ok: false, reason: "wrongCalldata" };
  }

  const feeder = steps[callIndex - 1];
  if (feeder.action?.toChainId !== LIFI_BASE_CHAIN_ID || !sameAddress(feeder.action?.toToken?.address, p.usdc)) {
    return { ok: false, reason: "wrongDestinationToken" };
  }
  const minReceived = toBigInt(feeder.estimate?.toAmountMin);
  if (minReceived === null || minReceived < p.usdcIn) return { ok: false, reason: "minBelowBuy" };

  const fromAmount = toBigInt(quote.estimate?.fromAmount);
  if (fromAmount === null || fromAmount <= BigInt(0)) return { ok: false, reason: "noFromAmount" };
  const approval = quote.estimate?.approvalAddress;

  return {
    ok: true,
    summary: {
      tool: quote.tool ?? "lifi",
      crossChain: p.fromChain !== LIFI_BASE_CHAIN_ID,
      fromAmount,
      fromDecimals: quote.action?.fromToken?.decimals ?? 6,
      fromSymbol: quote.action?.fromToken?.symbol ?? "",
      approvalAddress: approval && ADDRESS_RE.test(approval) ? (approval as Address) : null,
      minReceivedUsd6: minReceived,
      executionDurationSec: Math.max(0, Math.round(quote.estimate?.executionDuration ?? 0)),
      feesUsd: sumUsd(quote.estimate?.feeCosts) + sumUsd(quote.estimate?.gasCosts),
      tx: { to: tx.to as Address, data: tx.data as Hex, value: toBigInt(tx.value) ?? BigInt(0) },
    },
  };
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export async function fetchOneTxQuote(
  body: ContractCallsRequest,
  opts: { fetchImpl?: FetchLike; apiUrl?: string } = {},
): Promise<LifiQuote> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const res = await fetchImpl(`${opts.apiUrl ?? LIFI_API_URL}/quote/contractCalls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (LifiQuote & { message?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.message ? `noRoute: ${json.message}`.slice(0, 160) : `noRoute: ${res.status}`);
  return json;
}

export type LifiStatus = {
  status?: "NOT_FOUND" | "INVALID" | "PENDING" | "DONE" | "FAILED";
  substatus?: string;
  receiving?: { txHash?: string; chainId?: number };
};

export async function fetchLifiStatus(
  q: { txHash: string; fromChain: number; bridge?: string },
  opts: { fetchImpl?: FetchLike; apiUrl?: string } = {},
): Promise<LifiStatus> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const params = new URLSearchParams({
    txHash: q.txHash,
    fromChain: String(q.fromChain),
    toChain: String(LIFI_BASE_CHAIN_ID),
  });
  if (q.bridge) params.set("bridge", q.bridge);
  const res = await fetchImpl(`${opts.apiUrl ?? LIFI_API_URL}/status?${params.toString()}`);
  if (!res.ok) return { status: "PENDING" };
  return ((await res.json().catch(() => null)) as LifiStatus | null) ?? { status: "PENDING" };
}

/** `settled`: look at Base for the result (PPL bought, or USDC refunded to the buyer). */
export function statusPhase(status: LifiStatus): "pending" | "settled" {
  return status.status === "DONE" || status.status === "FAILED" ? "settled" : "pending";
}

/**
 * USDC LI.FI actually delivered in a finished two-step route (`RouteExecutionCompleted`), read from
 * the executed amount of the last step. Null when the route carries no executed amount.
 */
export function executedToAmountUsd6(route: unknown): bigint | null {
  const steps = (route as { steps?: { execution?: { toAmount?: string } }[] } | null)?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  return toBigInt(steps[steps.length - 1]?.execution?.toAmount);
}
