"use client";

import { useCallback, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  type Address,
  type Hex,
} from "viem";

import type { EIP1193Provider } from "@/lib/evm/client";
import { approveErc20IfNeeded } from "@/lib/evm/erc20-allowance";
import { SITE_URL } from "@/lib/site";
import { PPL_CURVE_HUB_V2_ABI, ZERO_ADDRESS } from "./abi";
import { V2_SALE } from "./constants";
import {
  estimatePplOut,
  minPplOutFromEstimate,
  type V2Chain,
} from "./logic";
import { buildV2OwnershipMessage, saleDomain } from "./ownership";

export type V2TxStatus =
  | { step: "idle" }
  | { step: "switching" }
  | { step: "signing" }
  | { step: "confirming" }
  | { step: "buying" }
  | { step: "done"; txHash: Hex; pplOutWei: bigint; boughtAtMs: number }
  | { step: "error"; reason: string };

function errorText(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; code?: number } | null;
  if (e?.code === 4001) return "rejected";
  return (e?.shortMessage ?? e?.message ?? "failed").slice(0, 160);
}

function messageFor(error: unknown): string {
  const raw = errorText(error);
  if (raw === "rejected") return raw;
  return raw || "failed";
}

export async function ensureV2Chain(provider: EIP1193Provider, chain: V2Chain): Promise<boolean> {
  const hexId = `0x${chain.id.toString(16)}`;
  const switchTo = () =>
    provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  try {
    await switchTo();
    return true;
  } catch (error) {
    if ((error as { code?: number })?.code === 4001) return false;
  }
  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: chain.chain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [chain.chain.rpcUrls.default.http[0]],
          blockExplorerUrls: chain.explorer ? [chain.explorer] : [],
        },
      ],
    });
    await switchTo();
    return true;
  } catch {
    return false;
  }
}

export type V2BuyContext = {
  chain: V2Chain;
  provider: EIP1193Provider;
  account: Address;
};

export function useV2Buy() {
  const [verifyStatus, setVerifyStatus] = useState<V2TxStatus>({ step: "idle" });
  const [buyStatus, setBuyStatus] = useState<V2TxStatus>({ step: "idle" });

  const reset = useCallback(() => {
    setVerifyStatus({ step: "idle" });
    setBuyStatus({ step: "idle" });
  }, []);

  const confirmOnChain = useCallback(async (ctx: V2BuyContext) => {
    const { chain, provider, account } = ctx;
    try {
      setVerifyStatus({ step: "switching" });
      if (!(await ensureV2Chain(provider, chain))) {
        setVerifyStatus({ step: "error", reason: "switchRejected" });
        return false;
      }
      if (!chain.hubAddress) {
        setVerifyStatus({ step: "error", reason: "notConfigured" });
        return false;
      }
      setVerifyStatus({ step: "signing" });
      const walletClient = createWalletClient({
        chain: chain.chain,
        transport: custom(provider),
        account,
      });
      const nonceRes = await fetch("/api/founders/passport-wallet/nonce", { credentials: "include" });
      if (!nonceRes.ok) {
        setVerifyStatus({ step: "error", reason: "verifyFailed" });
        return false;
      }
      const challenge = (await nonceRes.json()) as { nonce?: string; issuedAt?: string; expiresAt?: string };
      if (!challenge.nonce || !challenge.issuedAt || !challenge.expiresAt) {
        setVerifyStatus({ step: "error", reason: "verifyFailed" });
        return false;
      }
      const message = buildV2OwnershipMessage({
        domain: saleDomain(SITE_URL),
        account,
        chainId: chain.id,
        hub: chain.hubAddress,
        nonceCode: challenge.nonce,
        issuedAt: challenge.issuedAt,
        expiresAt: challenge.expiresAt,
      });
      const ownershipSignature = await walletClient.signMessage({ account, message });
      const res = await fetch("/api/sale/verify-signature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ account, ownershipSignature, nonceCode: challenge.nonce }),
      });
      if (!res.ok) {
        setVerifyStatus({ step: "error", reason: (await res.json().catch(() => null))?.error ?? "verifyFailed" });
        return false;
      }
      const proof = (await res.json()) as {
        personId: Hex;
        deadline: number;
        signature: Hex;
        hub: Address;
      };
      setVerifyStatus({ step: "confirming" });
      const publicClient = createPublicClient({
        chain: chain.chain,
        transport: http(undefined, { timeout: 12_000 }),
      });
      const hash = await walletClient.writeContract({
        address: proof.hub,
        abi: PPL_CURVE_HUB_V2_ABI,
        functionName: "verify",
        args: [proof.personId, BigInt(proof.deadline), proof.signature],
        account,
        chain: chain.chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction reverted");
      setVerifyStatus({ step: "done", txHash: hash, pplOutWei: BigInt(0), boughtAtMs: Date.now() });
      return true;
    } catch (error) {
      setVerifyStatus({ step: "error", reason: messageFor(error) });
      return false;
    }
  }, []);

  const buyPpl = useCallback(
    async (ctx: V2BuyContext & { amountIn: bigint; spotPriceWad: bigint }) => {
      const { chain, provider, account, amountIn, spotPriceWad } = ctx;
      try {
        setBuyStatus({ step: "switching" });
        if (!(await ensureV2Chain(provider, chain))) {
          setBuyStatus({ step: "error", reason: "switchRejected" });
          return null;
        }
        if (!chain.hubAddress || !chain.usdcAddress) {
          setBuyStatus({ step: "error", reason: "notConfigured" });
          return null;
        }
        const publicClient = createPublicClient({
          chain: chain.chain,
          transport: http(undefined, { timeout: 12_000 }),
        });
        const walletClient = createWalletClient({
          chain: chain.chain,
          transport: custom(provider),
          account,
        });
        if (amountIn <= BigInt(0)) {
          setBuyStatus({ step: "error", reason: "notConfigured" });
          return null;
        }
        const usdc = chain.usdcAddress as Address;
        const hub = chain.hubAddress as Address;
        const approved = await approveErc20IfNeeded({
          amount: amountIn,
          readAllowance: () =>
            publicClient.readContract({
              address: usdc,
              abi: erc20Abi,
              functionName: "allowance",
              args: [account, hub],
            }),
          approve: () => {
            setBuyStatus({ step: "signing" });
            return walletClient.writeContract({
              address: usdc,
              abi: erc20Abi,
              functionName: "approve",
              args: [hub, amountIn],
              account,
              chain: chain.chain,
            });
          },
          waitForReceipt: (hash) => publicClient.waitForTransactionReceipt({ hash }),
        });
        if (!approved.ok) {
          throw new Error(approved.reason === "reverted" ? "approval reverted" : "allowance unchanged");
        }
        const expected = estimatePplOut(amountIn, spotPriceWad);
        const minPplOut = minPplOutFromEstimate(expected, V2_SALE.slippageBps);
        setBuyStatus({ step: "buying" });
        const hash = await walletClient.writeContract({
          address: hub,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "buy",
          args: [amountIn, minPplOut, account, ZERO_ADDRESS],
          account,
          chain: chain.chain,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("transaction reverted");
        const done = {
          step: "done" as const,
          txHash: hash,
          pplOutWei: expected,
          boughtAtMs: Date.now(),
        };
        setBuyStatus(done);
        return done;
      } catch (error) {
        setBuyStatus({ step: "error", reason: messageFor(error) });
        return null;
      }
    },
    [],
  );

  return {
    verifyStatus,
    buyStatus,
    confirmOnChain,
    buyPpl,
    reset,
    busy:
      !["idle", "done", "error"].includes(verifyStatus.step) ||
      !["idle", "done", "error"].includes(buyStatus.step),
  };
}
