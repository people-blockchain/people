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

import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hex,
  type Log,
} from "viem";

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
/**
 * LI.FI Diamond: the only contract the buyer's source transaction may call and the only spender
 * the buyer may approve. Same address on every source chain in `ONE_TX_SOURCE_TOKENS`
 * (lifinance/contracts `deployments/{mainnet,bsc,polygon,arbitrum,optimism,avalanche,base}.json`,
 * checked 18 Nov 2026).
 */
export const LIFI_DIAMOND: Address = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
/**
 * Most the source amount may exceed `usdcIn` (in token units, normalised to 6 decimals) to cover
 * LI.FI, bridge and swap fees. Live stablecoin quotes on 18 Nov 2026 were 0.3–0.9% above.
 */
export const MAX_SOURCE_OVERPAY_BPS = 300;
/** `PplCurveHubV2.ROUTER_MIN_BUY_USD6`: smallest buy a trusted router (the LI.FI Executor) may make. */
export const ROUTER_MIN_BUY_USD6 = BigInt(40_000_000);

/** `hub.buy` measured at up to ~321k gas (PplCurveHubV2Gas.t.sol) plus the approval, with headroom. */
export const HUB_BUY_GAS_LIMIT = 500_000;
/** `verifyAndBuy` adds an ecrecover and up to four fresh storage slots to `buy`. */
export const HUB_VERIFY_AND_BUY_GAS_LIMIT = 650_000;

/** Verification attestation deadline for a direct `verify` transaction (server side). */
export const DIRECT_VERIFICATION_DEADLINE_SECONDS = 15 * 60;
/** Longer deadline when the attestation rides inside a cross-chain call (Stargate can take ~20 min). */
export const ROUTED_VERIFICATION_DEADLINE_SECONDS = 60 * 60;

export function verificationDeadlineSeconds(routed: boolean): number {
  return routed ? ROUTED_VERIFICATION_DEADLINE_SECONDS : DIRECT_VERIFICATION_DEADLINE_SECONDS;
}

/**
 * The attestation must still be valid when the destination call runs on Base: at least 10 minutes
 * and three times LI.FI's estimated duration must remain. Otherwise ask for a fresh one.
 */
export function proofLeavesTime(deadlineSec: number, nowMs: number, executionDurationSec = 0): boolean {
  const needMs = Math.max(10 * 60_000, executionDurationSec * 3_000);
  return deadlineSec * 1000 - nowMs >= needMs;
}

/** Verifier attestation for a buyer not yet bound on Base (`verifyAndBuy`). */
export type HubVerification = { personId: Hex; deadline: number; signature: Hex };

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

/**
 * Calldata run by the LI.FI Executor: `hub.buy(usdcIn, minPplOut, recipient, referrer)`, or for a
 * buyer not yet bound on Base `hub.verifyAndBuy(..., personId, deadline, sig)` so the first
 * purchase needs no separate verify transaction.
 */
export function encodeHubBuy(input: {
  usdcIn: bigint;
  minPplOut: bigint;
  recipient: Address;
  referrer?: Address | null;
  verification?: HubVerification | null;
}): Hex {
  const v = input.verification;
  if (v) {
    return encodeFunctionData({
      abi: PPL_CURVE_HUB_V2_ABI,
      functionName: "verifyAndBuy",
      args: [
        input.usdcIn,
        input.minPplOut,
        input.recipient,
        (input.referrer ?? ZERO_ADDRESS) as Address,
        v.personId,
        BigInt(v.deadline),
        v.signature,
      ],
    });
  }
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
  /** Present for a buyer not yet bound on Base: the call becomes `verifyAndBuy`. */
  verification?: HubVerification | null;
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
  // Below the hub's router minimum the destination call would revert (BelowMin) and only refund.
  if (p.usdcIn < ROUTER_MIN_BUY_USD6) throw new Error("belowRouterMin");
  if (p.minPplOut <= BigInt(0)) throw new Error("badMinPplOut");
  if (p.verification && (!/^0x[0-9a-fA-F]{64}$/.test(p.verification.personId) || !(p.verification.deadline > 0))) {
    throw new Error("badVerification");
  }
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
          verification: p.verification,
        }),
        toContractGasLimit: String(p.verification ? HUB_VERIFY_AND_BUY_GAS_LIMIT : HUB_BUY_GAS_LIMIT),
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
  action?: { fromChainId?: number; toChainId?: number; fromAddress?: string; fromAmount?: string; fromToken?: LifiToken };
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
  // The buyer signs this transaction, so pin where it goes and what it carries (audit M2).
  // Cross-chain: the Diamond is both target and spender. Base -> Base: LI.FI calls the Executor
  // directly and the Executor pulls the token through its ERC20Proxy.
  const sameChain = p.fromChain === LIFI_BASE_CHAIN_ID;
  const target = sameChain ? executor : LIFI_DIAMOND;
  const spender = sameChain ? LIFI_BASE_ERC20_PROXY : LIFI_DIAMOND;
  if (!sameAddress(tx.to, target)) return { ok: false, reason: "unexpectedTarget" };
  if ((toBigInt(tx.value ?? "0") ?? BigInt(-1)) !== BigInt(0)) return { ok: false, reason: "unexpectedValue" };
  if (!sameAddress(quote.estimate?.approvalAddress, spender)) return { ok: false, reason: "unexpectedApproval" };
  const token = ONE_TX_SOURCE_TOKENS.find((t) => t.chainId === p.fromChain && sameAddress(t.address, p.fromToken));
  if (!token) return { ok: false, reason: "wrongSourceToken" };
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
    verification: p.verification,
  }).toLowerCase()) {
    return { ok: false, reason: "wrongCalldata" };
  }
  // Defence in depth: decode too, so a future encoding change cannot slip through.
  try {
    const decoded = decodeFunctionData({ abi: PPL_CURVE_HUB_V2_ABI, data: call.action?.toContractCallData as Hex });
    if (decoded.functionName !== (p.verification ? "verifyAndBuy" : "buy")) return { ok: false, reason: "wrongCalldata" };
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
  // The amount the Diamond pulls is `action.fromAmount`; it must be the amount we show and approve.
  if (quote.action?.fromAmount !== undefined && toBigInt(quote.action.fromAmount) !== fromAmount) {
    return { ok: false, reason: "noFromAmount" };
  }
  if (!sourceAmountWithinMargin(fromAmount, token.decimals, p.usdcIn)) return { ok: false, reason: "overpay" };
  const receiverCheck = checkSourceCalldata(
    tx.data as Hex,
    p,
    steps[callIndex].action?.toContractCallData as Hex,
    fromAmount,
  );
  if (receiverCheck) return { ok: false, reason: receiverCheck };

  return {
    ok: true,
    summary: {
      tool: quote.tool ?? "lifi",
      crossChain: p.fromChain !== LIFI_BASE_CHAIN_ID,
      fromAmount,
      fromDecimals: token.decimals,
      fromSymbol: quote.action?.fromToken?.symbol ?? "",
      approvalAddress: spender,
      minReceivedUsd6: minReceived,
      executionDurationSec: Math.max(0, Math.round(quote.estimate?.executionDuration ?? 0)),
      feesUsd: sumUsd(quote.estimate?.feeCosts) + sumUsd(quote.estimate?.gasCosts),
      tx: { to: tx.to as Address, data: tx.data as Hex, value: toBigInt(tx.value) ?? BigInt(0) },
    },
  };
}

/** `fromAmount` (source token units) <= `usdcIn` (6 dp) x (1 + MAX_SOURCE_OVERPAY_BPS). Stablecoins only. */
export function sourceAmountWithinMargin(fromAmount: bigint, decimals: number, usdcIn: bigint): boolean {
  const scale = BigInt(10) ** BigInt(decimals);
  return fromAmount * BigInt(1_000_000) * BigInt(10_000) <= usdcIn * scale * BigInt(10_000 + MAX_SOURCE_OVERPAY_BPS);
}

/**
 * LI.FI periphery on Base (lifinance/contracts `deployments/base.json`, checked 18 Nov 2026).
 * `ReceiverAcrossV4` receives the Across fill and runs the destination message through the
 * Executor; `ERC20Proxy` is the spender for a same-chain Base purchase (`Executor.swapAndExecute`
 * pulls the source token through it), so on Base the buyer approves the proxy, not the Diamond.
 */
export const LIFI_BASE_RECEIVER_ACROSS_V4: Address = "0x33b255b5db44A78c34381f89f1a454bc0Ef49871";
export const LIFI_BASE_ERC20_PROXY: Address = "0x74a55CaDb12501A3707E9F3C5dfd8b563C6A5940";

/**
 * The only LI.FI entry points a one-signature transaction may use. Everything else (Stargate,
 * Relay, Mayan, packed facets, ...) is refused with `unsupportedFacet`: its calldata is not
 * decoded here, so the receiver and destination call could not be checked.
 */
export const LIFI_ONE_TX_ABI = parseAbi([
  "struct BridgeData { bytes32 transactionId; string bridge; string integrator; address referrer; address sendingAssetId; address receiver; uint256 minAmount; uint256 destinationChainId; bool hasSourceSwaps; bool hasDestinationCall; }",
  "struct SwapData { address callTo; address approveTo; address sendingAssetId; address receivingAssetId; uint256 fromAmount; bytes callData; bool requiresDeposit; }",
  "struct AcrossV4Data { bytes32 receiverAddress; bytes32 refundAddress; bytes32 sendingAssetId; bytes32 receivingAssetId; uint256 outputAmount; uint128 outputAmountMultiplier; bytes32 exclusiveRelayer; uint32 quoteTimestamp; uint32 fillDeadline; uint32 exclusivityParameter; bytes message; }",
  // Diamond, AcrossFacetV4 (cross-chain)
  "function startBridgeTokensViaAcrossV4(BridgeData _bridgeData, AcrossV4Data _acrossData)",
  "function swapAndStartBridgeTokensViaAcrossV4(BridgeData _bridgeData, SwapData[] _swapData, AcrossV4Data _acrossData)",
  // Executor on Base (same-chain Base -> Base)
  "function swapAndExecute(bytes32 _transactionId, SwapData[] _swapData, address _transferredAssetId, address _receiver, uint256 _amount)",
]);

/** `ReceiverAcrossV4.handleV3AcrossMessage` payload: `abi.decode(message, (bytes32, SwapData[], address))`. */
const ACROSS_MESSAGE_PARAMS = [
  { name: "transactionId", type: "bytes32" },
  {
    name: "swapData",
    type: "tuple[]",
    components: [
      { name: "callTo", type: "address" },
      { name: "approveTo", type: "address" },
      { name: "sendingAssetId", type: "address" },
      { name: "receivingAssetId", type: "address" },
      { name: "fromAmount", type: "uint256" },
      { name: "callData", type: "bytes" },
      { name: "requiresDeposit", type: "bool" },
    ],
  },
  { name: "receiver", type: "address" },
] as const;

type SwapStep = {
  callTo: Address;
  approveTo: Address;
  sendingAssetId: Address;
  receivingAssetId: Address;
  fromAmount: bigint;
  callData: Hex;
  requiresDeposit: boolean;
};

function addressWord(a: string): Hex {
  return `0x${a.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as Hex;
}

function sameWord(word: Hex, a: string): boolean {
  return word.toLowerCase() === addressWord(a);
}

/** The hub call LI.FI runs on Base: exactly one step, our hub, our USDC, our calldata, enough USDC. */
function checkHubStep(step: SwapStep | undefined, p: OneTxParams, hubCallData: string): string | null {
  if (!step) return "noContractCall";
  if (!sameAddress(step.callTo, p.hub) || !sameAddress(step.approveTo, p.hub)) return "wrongTarget";
  if (!sameAddress(step.sendingAssetId, p.usdc)) return "wrongDestinationToken";
  if (step.callData.toLowerCase() !== hubCallData) return "calldataMismatch";
  if (step.fromAmount < p.usdcIn) return "minBelowBuy";
  return null;
}

/**
 * Checks the source transaction itself, not only the quote summary (audit M2), by fully ABI-decoding
 * it (no substring search). The calldata must also be in canonical ABI encoding (re-encoding the
 * decoded values gives the same bytes), so every field sits at its 32-byte-aligned position and no
 * other parser (the LI.FI contracts' `abi.decode`) can read it differently.
 * - Cross-chain: `AcrossFacetV4.{start,swapAndStart}BridgeTokensViaAcrossV4` only. BridgeData names the
 *   buyer as receiver, Base as destination and a destination call; Across sends to LI.FI
 *   `ReceiverAcrossV4` on Base, in Base USDC, with the buyer as the source-chain refund address; the
 *   destination message is exactly one step (our hub calldata) with the buyer as the receiver of
 *   leftovers and of the full amount if the hub call reverts.
 * - Base -> Base: `Executor.swapAndExecute` only. It pulls exactly the quoted amount of the source
 *   token, the buyer receives every leftover, and the last step is our hub call.
 * Returns a reason string, or null when the calldata is acceptable.
 */
export function checkSourceCalldata(
  data: Hex,
  p: OneTxParams,
  hubCallData: Hex | undefined,
  fromAmount?: bigint | null,
): string | null {
  const call = (hubCallData ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{8,}$/.test(call)) return "calldataMismatch";
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: LIFI_ONE_TX_ABI, data });
  } catch {
    return "unsupportedFacet";
  }
  try {
    const canonical = encodeFunctionData({ abi: LIFI_ONE_TX_ABI, functionName: decoded.functionName, args: decoded.args } as Parameters<typeof encodeFunctionData>[0]);
    if (canonical.toLowerCase() !== data.toLowerCase()) return "nonCanonicalCalldata";
  } catch {
    return "nonCanonicalCalldata";
  }

  if (p.fromChain === LIFI_BASE_CHAIN_ID) {
    if (decoded.functionName !== "swapAndExecute") return "unsupportedFacet";
    const [, swaps, transferredAssetId, receiver, amount] = decoded.args;
    if (!sameAddress(receiver, p.account)) return "wrongReceiver";
    if (!sameAddress(transferredAssetId, p.fromToken)) return "wrongSourceToken";
    if (fromAmount !== undefined && fromAmount !== null && amount !== fromAmount) return "noFromAmount";
    if (swaps.length < 1) return "noContractCall";
    const last = swaps[swaps.length - 1];
    // the hub may be called only once, as the final step
    if (swaps.slice(0, -1).some((s) => sameAddress(s.callTo, p.hub) || sameAddress(s.approveTo, p.hub))) {
      return "wrongTarget";
    }
    return checkHubStep(last as SwapStep, p, call);
  }

  if (decoded.functionName === "swapAndExecute") return "unsupportedFacet";
  const bridge = decoded.args[0];
  const across = decoded.functionName === "swapAndStartBridgeTokensViaAcrossV4" ? decoded.args[2] : decoded.args[1];
  if (!sameAddress(bridge.receiver, p.account)) return "wrongReceiver";
  if (bridge.destinationChainId !== BigInt(LIFI_BASE_CHAIN_ID)) return "wrongDestination";
  if (!bridge.hasDestinationCall) return "noContractCall";
  if (decoded.functionName === "swapAndStartBridgeTokensViaAcrossV4") {
    const swaps = decoded.args[1];
    if (!bridge.hasSourceSwaps || swaps.length < 1) return "wrongSourceToken";
    if (!sameAddress(swaps[0].sendingAssetId, p.fromToken)) return "wrongSourceToken";
    if (!sameAddress(swaps[swaps.length - 1].receivingAssetId, bridge.sendingAssetId)) return "wrongSourceToken";
  } else {
    if (bridge.hasSourceSwaps || !sameAddress(bridge.sendingAssetId, p.fromToken)) return "wrongSourceToken";
    // no source swap: the facet uses outputAmount as given
    if (across.outputAmount < p.usdcIn) return "minBelowBuy";
  }
  if (!sameWord(across.receiverAddress, LIFI_BASE_RECEIVER_ACROSS_V4)) return "unexpectedBridgeReceiver";
  if (!sameWord(across.refundAddress, p.account)) return "wrongRefundReceiver";
  if (!sameWord(across.sendingAssetId, bridge.sendingAssetId)) return "wrongSourceToken";
  if (!sameWord(across.receivingAssetId, p.usdc)) return "wrongDestinationToken";

  let message;
  try {
    message = decodeAbiParameters(ACROSS_MESSAGE_PARAMS, across.message);
    if (encodeAbiParameters(ACROSS_MESSAGE_PARAMS, message).toLowerCase() !== across.message.toLowerCase()) {
      return "nonCanonicalCalldata";
    }
  } catch {
    return "calldataMismatch";
  }
  const [, steps, refundReceiver] = message;
  if (!sameAddress(refundReceiver, p.account)) return "wrongRefundReceiver";
  if (steps.length !== 1) return "wrongTarget";
  return checkHubStep(steps[0] as SwapStep, p, call);
}

export type ReceivingOutcome = {
  /** `Bought` for the buyer from the hub in the receiving transaction, if any. */
  pplOutWei: bigint | null;
  /** USDC sent to the buyer in the receiving transaction: leftover after a buy, or the refund. */
  toBuyerUsd6: bigint;
  /** USDC the Executor sent anywhere other than the hub, the hub treasury or the buyer. */
  misroutedUsd6: bigint;
};

/**
 * Reads the outcome from the Base receiving transaction's logs instead of a balance delta, so an
 * unrelated transfer to the buyer cannot be mistaken for a refund (audit L2), and checks that the
 * Executor's leftover went to the buyer (audit L1).
 */
export function receivingOutcome(
  logs: Log[],
  p: { usdc: Address; hub: Address; buyer: Address; treasury?: Address | null; executor?: Address },
): ReceivingOutcome {
  const executor = p.executor ?? LIFI_BASE_EXECUTOR;
  const bought = parseEventLogs({ abi: PPL_CURVE_HUB_V2_ABI, eventName: "Bought", logs }).find(
    (log) => sameAddress(log.address, p.hub) && sameAddress(log.args.recipient, p.buyer),
  );
  let toBuyerUsd6 = BigInt(0);
  let misroutedUsd6 = BigInt(0);
  for (const log of parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs })) {
    if (!sameAddress(log.address, p.usdc)) continue;
    if (sameAddress(log.args.to, p.buyer)) toBuyerUsd6 += log.args.value;
    else if (
      sameAddress(log.args.from, executor) &&
      !sameAddress(log.args.to, p.hub) &&
      !(p.treasury && sameAddress(log.args.to, p.treasury))
    ) {
      misroutedUsd6 += log.args.value;
    }
  }
  return { pplOutWei: bought ? bought.args.pplOut : null, toBuyerUsd6, misroutedUsd6 };
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
