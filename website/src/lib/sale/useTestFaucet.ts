"use client";

import { useCallback, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, parseAbi, parseUnits, type Address } from "viem";

import { ensureSaleChain, type EIP1193Provider } from "@/lib/evm/client";
import { preflightWriteContract } from "@/lib/evm/preflight-write";
import { SALE_CHAIN, saleTokenAddress } from "@/lib/sale/config";
import { assertReceiptSuccess, classifyBuyError } from "@/lib/sale/useBuyPpl";

/** Test USDC the faucet mints per click (6 decimals, like the real token). */
export const FAUCET_AMOUNT_USDC = 1000;

export const testTokenAbi = parseAbi(["function mint(address to, uint256 amount)"]);

export type FaucetStatus =
  | { step: "idle" }
  | { step: "switching" }
  | { step: "minting" }
  | { step: "pending" }
  | { step: "done"; txHash: string }
  | { step: "error"; reason: "notConfigured" | "switchRejected" | "txRejected" | "txFailed"; detail?: string };

/** Mints test USDC to `account` on the sale chain. Only called from a user click, only in base-test. */
export async function runFaucet(
  params: { provider: EIP1193Provider; account: Address },
  onStatus: (status: FaucetStatus) => void,
): Promise<FaucetStatus> {
  const finish = (status: FaucetStatus) => {
    onStatus(status);
    return status;
  };
  const token = saleTokenAddress("USDC") as Address | null;
  if (!SALE_CHAIN.faucet || !token) return finish({ step: "error", reason: "notConfigured" });
  try {
    onStatus({ step: "switching" });
    if (!(await ensureSaleChain(params.provider))) return finish({ step: "error", reason: "switchRejected" });

    const publicClient = createPublicClient({ chain: SALE_CHAIN.viemChain, transport: http(SALE_CHAIN.rpcUrl) });
    const walletClient = createWalletClient({
      chain: SALE_CHAIN.viemChain,
      transport: custom(params.provider),
      account: params.account,
    });
    onStatus({ step: "minting" });
    const mint = {
      address: token,
      abi: testTokenAbi,
      functionName: "mint",
      args: [params.account, parseUnits(String(FAUCET_AMOUNT_USDC), 6)],
    } as const;
    const hash = await preflightWriteContract(publicClient, params.account, mint, (gas) =>
      walletClient.writeContract({ ...mint, gas }),
    );
    onStatus({ step: "pending" });
    assertReceiptSuccess(await publicClient.waitForTransactionReceipt({ hash }));
    return finish({ step: "done", txHash: hash });
  } catch (err) {
    const { reason, detail } = classifyBuyError(err);
    console.warn("[sale] test faucet did not complete:", reason);
    return finish({ step: "error", reason: reason === "txRejected" ? "txRejected" : "txFailed", detail });
  }
}

export function useTestFaucet() {
  const [status, setStatus] = useState<FaucetStatus>({ step: "idle" });
  const mint = useCallback((params: { provider: EIP1193Provider; account: Address }) => runFaucet(params, setStatus), []);
  const reset = useCallback(() => setStatus({ step: "idle" }), []);
  return { status, mint, reset, busy: ["switching", "minting", "pending"].includes(status.step) };
}
