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
  type TransactionReceipt,
} from "viem";
import { base } from "viem/chains";

import { ensureBaseChain, type EIP1193Provider } from "@/lib/evm/client";
import { SALE, SALE_HUB_CHAIN, saleContractAddress } from "@/lib/sale/config";
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
};

/** Maps a thrown wallet / RPC error to a user-facing reason. Exported for tests. */
export function classifyBuyError(err: unknown): { reason: BuyErrorReason; detail?: string } {
  const e = err as { code?: number; name?: string; message?: string; shortMessage?: string } | null;
  const message = `${e?.shortMessage ?? ""} ${e?.message ?? ""}`;
  if (e?.code === 4001 || e?.name === "UserRejectedRequestError" || /user rejected|user denied/i.test(message)) {
    return { reason: "txRejected" };
  }
  if (/minout|min_out|slippage|too little received/i.test(message)) return { reason: "priceMoved" };
  if (/limit|cooldown|too soon|exceed/i.test(message)) return { reason: "limit" };
  return { reason: "txFailed", detail: (e?.shortMessage ?? e?.message ?? "").slice(0, 120) };
}

/** minPplOut = expected minus the slippage tolerance. Exported for tests. */
export function minOutWithSlippage(expected: bigint, slippageBps: number = SALE.slippageBps): bigint {
  const bps = BigInt(slippageBps);
  return (expected * (BigInt(10000) - bps)) / BigInt(10000);
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

/**
 * Runs the Base purchase: switch to Base → approve exactly the amount (if needed) → buyWith.
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
    const switched = await ensureBaseChain(params.provider);
    if (!switched) return finish({ step: "error", reason: "switchRejected" });

    const publicClient = createPublicClient({ chain: base, transport: http(SALE_HUB_CHAIN.rpcUrl) });
    const walletClient = createWalletClient({
      chain: base,
      transport: custom(params.provider),
      account: params.account,
    });
    const decimals = await publicClient.readContract({ address: params.token, abi: erc20Abi, functionName: "decimals" });
    const amountIn = parseUnits(params.amountUsd.toFixed(2), decimals);

    const allowance = await publicClient.readContract({
      address: params.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [params.account, hub],
    });
    if (allowance < amountIn) {
      onStatus({ step: "approving" });
      const approveHash = await walletClient.writeContract({
        address: params.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [hub, amountIn],
      });
      assertReceiptSuccess(await publicClient.waitForTransactionReceipt({ hash: approveHash }));
    }

    const expected = await publicClient.readContract({
      address: hub,
      abi: pplCurveHubAbi,
      functionName: "quoteBuy",
      args: [params.token, amountIn],
    });
    const minPplOut = minOutWithSlippage(expected);

    onStatus({ step: "buying" });
    const hash = await walletClient.writeContract({
      address: hub,
      abi: pplCurveHubAbi,
      functionName: "buyWith",
      args: [params.token, amountIn, minPplOut],
    });
    onStatus({ step: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assertReceiptSuccess(receipt);
    return finish({ step: "done", txHash: hash, pplOut: pplOutFromReceipt(receipt, hub) ?? expected });
  } catch (err) {
    const { reason, detail } = classifyBuyError(err);
    console.warn("[sale] purchase did not complete:", reason);
    return finish({ step: "error", reason, detail });
  }
}

export function useBuyPpl() {
  const [status, setStatus] = useState<BuyStatus>({ step: "idle" });
  const buy = useCallback((params: BuyParams) => runBuy(params, setStatus), []);
  const reset = useCallback(() => setStatus({ step: "idle" }), []);
  return { status, buy, reset, busy: ["switching", "approving", "buying", "pending"].includes(status.step) };
}
