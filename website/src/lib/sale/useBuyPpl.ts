"use client";

import { useCallback, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  parseEventLogs,
  parseUnits,
  type Address,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

import { ensureSaleChain, type EIP1193Provider } from "@/lib/evm/client";
import { preflightWriteContract } from "@/lib/evm/preflight-write";
import { SALE, SALE_CHAIN, saleContractAddress } from "@/lib/sale/config";
import { scaleUsd6 } from "@/lib/sale/amount";
import { pplCurveHubAbi } from "@/lib/sale/pplCurveHub.abi";

export type BuyStatus =
  | { step: "idle" }
  | { step: "switching" }
  | { step: "approving" }
  | { step: "buying" }
  | { step: "pending" }
  | { step: "done"; txHash: string; pplOut: bigint }
  | { step: "error"; reason: BuyErrorReason; detail?: string };

export type BuyErrorReason = "switchRejected" | "txRejected" | "priceMoved" | "limit" | "txFailed";

export type BuyParams = {
  provider: EIP1193Provider;
  account: Address;
  token: Address;
  amountUsd: number;
  /** Micro-USD. When set, this is what gets approved instead of `amountUsd.toFixed`. */
  amountIn?: bigint;
};

/** Maps a thrown wallet / RPC error to a user-facing reason. Exported for tests. */
export function classifyBuyError(err: unknown): { reason: BuyErrorReason; detail?: string } {
  const e = err as { code?: number; name?: string; message?: string; shortMessage?: string } | null;
  const message = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (e?.code === 4001 || e?.name === "UserRejectedRequestError" || /user rejected|user denied/i.test(message)) {
    return { reason: "txRejected" };
  }
  if (/minout|min_out|slippage|too little received/i.test(message)) return { reason: "priceMoved" };
  if (/limit|cooldown|too soon|exceed|abovemax|belowmin/i.test(message)) return { reason: "limit" };
  return { reason: "txFailed", detail: (e?.shortMessage ?? e?.message ?? "").slice(0, 120) };
}

/** minPplOut = expected minus the slippage tolerance. Exported for tests. */
export function minOutWithSlippage(expected: bigint, slippageBps: number = SALE.slippageBps): bigint {
  const bps = BigInt(slippageBps);
  return (expected * (BigInt(10000) - bps)) / BigInt(10000);
}

/**
 * Arguments of `PplCurveHub.buyWith(token, amountIn, minPplOut, recipient)`. The connected wallet is
 * both payer and recipient: the allocation and the per-address limits are keyed on `recipient`.
 * Exported for tests.
 */
export function buyWithArgs(
  params: Pick<BuyParams, "account" | "token">,
  amountIn: bigint,
  minPplOut: bigint,
): readonly [Address, bigint, bigint, Address] {
  return [params.token, amountIn, minPplOut, params.account];
}

/** viem does not throw on a reverted receipt, so check the status explicitly. Exported for tests. */
export function assertReceiptSuccess(receipt: Pick<TransactionReceipt, "status">): void {
  if (receipt.status !== "success") throw new Error("transaction reverted");
}

/** The PPL actually minted, read from the hub's `Bought` event; null when the log is absent. */
export function pplOutFromReceipt(receipt: TransactionReceipt, hub: Address): bigint | null {
  const logs = parseEventLogs({ abi: pplCurveHubAbi, eventName: "Bought", logs: receipt.logs });
  const own = logs.find((log) => log.address.toLowerCase() === hub.toLowerCase());
  return own ? own.args.pplOut : null;
}

/** Hub state needed to decide, before any allowance is granted, whether `buyWith` can succeed. */
export type PreflightState = {
  /** Block timestamp (seconds). */
  now: bigint;
  openedAt: bigint;
  closesAt: bigint;
  graduated: boolean;
  paused: boolean;
  treasury: Address;
  tokenAllowed: boolean;
  /** USD6 value of `amountIn` (1 token = 1 USD), rounded down like the hub does. */
  requestedUsd6: bigint;
  minBuyUsd6: bigint;
  maxBuyUsd6: bigint;
  dailyCapUsd6: bigint;
  /** USD6 the recipient already bought inside the rolling window. */
  dailyUsedUsd6: bigint;
  /** What is left to raise; a request above it is partially filled. */
  remainingRaiseUsd6: bigint;
  /** Earliest time the recipient may buy again (0 if never). */
  nextBuyAt: bigint;
  /** `quoteBuy(token, amountIn)`. */
  quotedPpl: bigint;
};

export type PreflightFailure = { reason: BuyErrorReason; detail?: string };

/** Token units to USD6 exactly like the hub's `_toUsd6`. Exported for tests. */
export function toUsd6(amountIn: bigint, decimals: number): bigint {
  return decimals > 6 ? amountIn / BigInt(10) ** BigInt(decimals - 6) : amountIn * BigInt(10) ** BigInt(6 - decimals);
}

/**
 * Pure mirror of the checks `buyWith` makes that do not depend on the allowance: sale open / not ended /
 * not sold out / not paused, token enabled, min / max, rolling daily cap, cooldown, and the treasury
 * guard (the hub measures the treasury balance delta, so a payer or recipient equal to the treasury can
 * never complete: `TransferMismatch`). Returns the first failure, or null when `buyWith` should pass.
 * Exported for tests.
 */
export function evaluatePreflight(
  params: Pick<BuyParams, "account">,
  s: PreflightState,
): PreflightFailure | null {
  const recipient = params.account;
  if (s.treasury.toLowerCase() === recipient.toLowerCase()) {
    return { reason: "txFailed", detail: "treasury_address" };
  }
  if (s.openedAt === BigInt(0)) return { reason: "txFailed", detail: "sale_not_open" };
  if (s.paused) return { reason: "txFailed", detail: "sale_paused" };
  if (s.graduated) return { reason: "txFailed", detail: "sold_out" };
  if (s.now >= s.closesAt) return { reason: "txFailed", detail: "sale_ended" };
  if (!s.tokenAllowed) return { reason: "txFailed", detail: "token_not_allowed" };
  if (s.requestedUsd6 < s.minBuyUsd6 || s.requestedUsd6 > s.maxBuyUsd6) return { reason: "limit" };
  if (s.nextBuyAt > s.now) return { reason: "limit" };
  const charged = s.requestedUsd6 > s.remainingRaiseUsd6 ? s.remainingRaiseUsd6 : s.requestedUsd6;
  if (s.dailyUsedUsd6 + charged > s.dailyCapUsd6) return { reason: "limit" };
  if (s.quotedPpl === BigInt(0)) return { reason: "priceMoved" };
  return null;
}

/** Clients the purchase flow needs; injected so the call order can be tested without a network. */
export type BuyClients = {
  publicClient: Pick<PublicClient, "readContract" | "simulateContract" | "waitForTransactionReceipt" | "getBlock" | "call" | "estimateGas">;
  walletClient: Pick<WalletClient, "writeContract">;
};

async function readPreflightState(
  publicClient: BuyClients["publicClient"],
  hub: Address,
  params: BuyParams,
  amountIn: bigint,
  decimals: number,
): Promise<PreflightState> {
  const read = <T,>(functionName: string, args?: readonly unknown[]) =>
    publicClient.readContract({ address: hub, abi: pplCurveHubAbi, functionName, args } as never) as Promise<T>;
  const [
    block, openedAt, closesAt, graduated, paused, treasury, info,
    minBuyUsd6, maxBuyUsd6, dailyCapUsd6, dailyUsedUsd6, remainingRaiseUsd6, nextBuyAt,
  ] = await Promise.all([
    publicClient.getBlock(),
    read<bigint>("openedAt"),
    read<bigint>("closesAt"),
    read<boolean>("graduated"),
    read<boolean>("paused"),
    read<Address>("treasury"),
    read<readonly [boolean, number]>("tokenInfo", [params.token]),
    read<bigint>("MIN_BUY_USD6"),
    read<bigint>("MAX_BUY_USD6"),
    read<bigint>("DAILY_CAP_USD6"),
    read<bigint>("dailyUsed", [params.account]),
    read<bigint>("remainingRaiseUsd6"),
    read<bigint>("nextBuyAt", [params.account]),
  ]);
  const tokenAllowed = info[0];
  // quoteBuy reverts for a disabled token, so it is only asked for an enabled one.
  const quotedPpl = tokenAllowed ? await read<bigint>("quoteBuy", [params.token, amountIn]) : BigInt(0);
  return {
    now: block.timestamp, openedAt, closesAt, graduated, paused, treasury, tokenAllowed,
    requestedUsd6: toUsd6(amountIn, decimals),
    minBuyUsd6, maxBuyUsd6, dailyCapUsd6, dailyUsedUsd6, remainingRaiseUsd6, nextBuyAt, quotedPpl,
  };
}

/**
 * The purchase flow, in this order (an approval is never requested for a purchase that cannot succeed):
 *   1. read decimals, then `quoteBuy` + every check that does not need the allowance (`evaluatePreflight`);
 *   2. approve exactly `amountIn`, only if the allowance is short;
 *   3. full `simulateContract(buyWith)` — now that the allowance exists it is a faithful dry run;
 *   4. `buyWith`, sent from the simulated request.
 * Any failure in 1 or 3 aborts before the next wallet prompt.
 */
export async function executeBuy(
  clients: BuyClients,
  hub: Address,
  params: BuyParams,
  onStatus: (status: BuyStatus) => void,
): Promise<BuyStatus> {
  const { publicClient, walletClient } = clients;
  const finish = (status: BuyStatus) => {
    onStatus(status);
    return status;
  };
  try {
    const decimals = await publicClient.readContract({ address: params.token, abi: erc20Abi, functionName: "decimals" });
    const amountIn = params.amountIn !== undefined ? scaleUsd6(params.amountIn, decimals) : parseUnits(params.amountUsd.toFixed(2), decimals);

    // 1. quote + checks that do not depend on the allowance
    const state = await readPreflightState(publicClient, hub, params, amountIn, decimals);
    const failure = evaluatePreflight(params, state);
    if (failure) return finish({ step: "error", ...failure });
    const minPplOut = minOutWithSlippage(state.quotedPpl);

    // 2. approve (only if needed)
    const allowance = await publicClient.readContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [params.account, hub],
    });
    if (allowance < amountIn) {
      onStatus({ step: "approving" });
      const approve = {
        address: params.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [hub, amountIn],
      } as const;
      const approveHash = await preflightWriteContract(publicClient, params.account, approve, (gas) =>
        walletClient.writeContract({ ...approve, gas, account: params.account, chain: SALE_CHAIN.viemChain }),
      );
      assertReceiptSuccess(await publicClient.waitForTransactionReceipt({ hash: approveHash }));
    }

    // 3. full simulation with the allowance in place
    const { request } = await publicClient.simulateContract({
      address: hub,
      abi: pplCurveHubAbi,
      functionName: "buyWith",
      args: buyWithArgs(params, amountIn, minPplOut),
      account: params.account,
    });

    // 4. send
    onStatus({ step: "buying" });
    const hash = await preflightWriteContract(publicClient, params.account, request as never, (gas) =>
      walletClient.writeContract({ ...request, gas } as never),
    );
    onStatus({ step: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assertReceiptSuccess(receipt);
    return finish({ step: "done", txHash: hash, pplOut: pplOutFromReceipt(receipt, hub) ?? state.quotedPpl });
  } catch (err) {
    const { reason, detail } = classifyBuyError(err);
    console.warn("[sale] purchase did not complete:", reason);
    return finish({ step: "error", reason, detail });
  }
}

/**
 * Runs the purchase on the sale chain (Base): switch chain, then `executeBuy` (checks → approve →
 * simulate → buyWith, recipient = the connected wallet).
 * Only ever called from a user click, and only when the sale is open.
 */
export async function runBuy(
  params: BuyParams,
  onStatus: (status: BuyStatus) => void,
): Promise<BuyStatus> {
  const hub = saleContractAddress() as Address | null;
  const finish = (status: BuyStatus) => {
    onStatus(status);
    return status;
  };
  if (!hub) return finish({ step: "error", reason: "txFailed", detail: "sale_not_configured" });
  try {
    onStatus({ step: "switching" });
    const switched = await ensureSaleChain(params.provider);
    if (!switched) return finish({ step: "error", reason: "switchRejected" });
  } catch (err) {
    const { reason, detail } = classifyBuyError(err);
    console.warn("[sale] purchase did not complete:", reason);
    return finish({ step: "error", reason, detail });
  }
  const publicClient = createPublicClient({ chain: SALE_CHAIN.viemChain, transport: http(SALE_CHAIN.rpcUrl) });
  const walletClient = createWalletClient({
    chain: SALE_CHAIN.viemChain,
    transport: custom(params.provider),
    account: params.account,
  });
  return executeBuy({ publicClient, walletClient }, hub, params, onStatus);
}

export function useBuyPpl() {
  const [status, setStatus] = useState<BuyStatus>({ step: "idle" });
  const buy = useCallback((params: BuyParams) => runBuy(params, setStatus), []);
  const reset = useCallback(() => setStatus({ step: "idle" }), []);
  return { status, buy, reset, busy: ["switching", "approving", "buying", "pending"].includes(status.step) };
}
