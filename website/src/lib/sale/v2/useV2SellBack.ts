"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

import { createBrowserPublicClient, ensurePeopleChain, peopleViemChain, browserEvmRpcUrl, type EIP1193Provider } from "@/lib/evm/client";
import { PPL_CURVE_HUB_V2_ABI } from "./abi";
import type { V2Chain } from "./logic";
import { PPL_RETURN_BURN_ABI, PEOPLE_MAINNET_CHAIN_ID, decodeReturnBurned } from "./return-burn";
import { sellBackErrorKey, sellBackFeeBand, minUsdcOutFromPayout, type SellLot } from "./sellback";
import { ensureV2Chain } from "./useV2Buy";

export type SellBackStatus =
  | { step: "idle" }
  | { step: "burning" }
  | { step: "attesting" }
  | { step: "selling" }
  | { step: "done"; txHash: Hex; payoutUsd6: bigint }
  | { step: "error"; reason: string };

export type SellBackView = {
  loading: boolean;
  unlockedPpl: bigint;
  nextUnlockSec: number | null;
  personalRemainingUsd6: bigint;
  globalRemainingUsd6: bigint;
  feeLowRemainingUsd6: bigint;
  grossUsd6: bigint;
  feeUsd6: bigint;
  payoutUsd6: bigint;
  feeBand: "low" | "high" | "mixed";
};

const EMPTY_VIEW: SellBackView = {
  loading: false,
  unlockedPpl: BigInt(0),
  nextUnlockSec: null,
  personalRemainingUsd6: BigInt(0),
  globalRemainingUsd6: BigInt(0),
  feeLowRemainingUsd6: BigInt(0),
  grossUsd6: BigInt(0),
  feeUsd6: BigInt(0),
  payoutUsd6: BigInt(0),
  feeBand: "low",
};

function publicClient(chain: V2Chain["chain"]) {
  return createPublicClient({ chain, transport: http(undefined, { timeout: 12_000 }) });
}

export function useV2SellBackView(input: {
  chain: V2Chain;
  account: Address | null;
  pplIn: bigint;
  enabled: boolean;
  refreshKey?: number;
}): SellBackView {
  const { chain, account, pplIn, enabled, refreshKey = 0 } = input;
  const [view, setView] = useState<SellBackView>({ ...EMPTY_VIEW, loading: enabled });

  useEffect(() => {
    if (!enabled || !chain.hubAddress || !account) {
      setView(EMPTY_VIEW);
      return;
    }
    let active = true;
    setView((prev) => ({ ...prev, loading: true }));
    const client = publicClient(chain.chain);
    const hub = chain.hubAddress as Address;
    void (async () => {
      try {
        const [unlockedPpl, personalRemainingUsd6, cap, head, count] = await Promise.all([
          client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellableNow", args: [account] }),
          client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellRemaining24h", args: [account] }),
          client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellBackCapToday" }),
          client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "lotHead", args: [account] }),
          client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "lotCount", args: [account] }),
        ]);
        const span = count > head ? count - head : BigInt(0);
        const take = span > BigInt(50) ? BigInt(50) : span;
        const rawLots =
          take > BigInt(0)
            ? await client.readContract({
                address: hub,
                abi: PPL_CURVE_HUB_V2_ABI,
                functionName: "lots",
                args: [account, head, take],
              })
            : [];
        const lots: SellLot[] = rawLots.map((lot) => ({
          boughtAtSec: Number(lot.boughtAt),
          pplRemaining: lot.pplRemaining,
        }));
        const now = Math.floor(Date.now() / 1000);
        let nextUnlockSec: number | null = null;
        for (const lot of lots) {
          if (lot.pplRemaining <= BigInt(0)) continue;
          const unlock = lot.boughtAtSec + 30 * 24 * 60 * 60;
          if (unlock > now) {
            nextUnlockSec = unlock;
            break;
          }
        }
        const quoteIn = pplIn > BigInt(0) ? pplIn : BigInt(0);
        const [gross, fee, payout] =
          quoteIn > BigInt(0)
            ? await client.readContract({
                address: hub,
                abi: PPL_CURVE_HUB_V2_ABI,
                functionName: "quoteSellBack",
                args: [account, quoteIn],
              })
            : [BigInt(0), BigInt(0), BigInt(0)];
        if (!active) return;
        setView({
          loading: false,
          unlockedPpl,
          nextUnlockSec,
          personalRemainingUsd6,
          globalRemainingUsd6: cap[0],
          feeLowRemainingUsd6: cap[1],
          grossUsd6: gross,
          feeUsd6: fee,
          payoutUsd6: payout,
          feeBand: sellBackFeeBand(gross, cap[1]),
        });
      } catch {
        if (active) setView({ ...EMPTY_VIEW, loading: false });
      }
    })();
    return () => {
      active = false;
    };
  }, [account, chain.chain, chain.hubAddress, enabled, pplIn, refreshKey]);

  return view;
}

export function parsePplInput(raw: string): bigint | null {
  const value = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,18})?$/.test(value) || value === ".") return null;
  try {
    const parsed = parseUnits(value, 18);
    return parsed > BigInt(0) ? parsed : null;
  } catch {
    return null;
  }
}

export function formatPplInput(value: bigint): string {
  return formatUnits(value, 18);
}

function attestationReason(error: string | undefined): string {
  switch (error) {
    case "signer_unavailable":
    case "not_configured":
    case "verifier_mismatch":
    case "onchain_unavailable":
      return "notConfigured";
    case "return_not_found":
      return "badSignature";
    default:
      return "error";
  }
}

type Attestation = {
  personId: Hex;
  seller: Address;
  pplAmount: string;
  returnId: Hex;
  deadline: number;
  signature: Hex;
  hub: Address;
};

export function useV2SellBack() {
  const [status, setStatus] = useState<SellBackStatus>({ step: "idle" });

  const reset = useCallback(() => setStatus({ step: "idle" }), []);

  const sellBack = useCallback(
    async (ctx: {
      chain: V2Chain;
      provider: EIP1193Provider;
      account: Address;
      personId: Hex;
      pplIn: bigint;
      burnAddress: Address;
    }) => {
      const { chain, provider, account, personId, pplIn, burnAddress } = ctx;
      try {
        if (!chain.hubAddress) {
          setStatus({ step: "error", reason: "notConfigured" });
          return null;
        }
        setStatus({ step: "burning" });
        try {
          await ensurePeopleChain(provider);
        } catch (error) {
          if ((error as { code?: number })?.code === 4001) {
            setStatus({ step: "error", reason: "switchRejected" });
            return null;
          }
          throw error;
        }
        const peopleChain = peopleViemChain(browserEvmRpcUrl());
        if (peopleChain.id !== PEOPLE_MAINNET_CHAIN_ID) {
          setStatus({ step: "error", reason: "notConfigured" });
          return null;
        }
        const peopleWallet = createWalletClient({ chain: peopleChain, transport: custom(provider), account });
        const peoplePublic = createBrowserPublicClient();
        const burnHash = await peopleWallet.writeContract({
          address: burnAddress,
          abi: PPL_RETURN_BURN_ABI,
          functionName: "burnForReturn",
          args: [chain.hubAddress as Address, personId, account],
          value: pplIn,
          account,
          chain: peopleChain,
        });
        const burnReceipt = await peoplePublic.waitForTransactionReceipt({ hash: burnHash });
        if (burnReceipt.status !== "success") throw new Error("transaction reverted");
        const burned = decodeReturnBurned(burnReceipt.logs, {
          burn: burnAddress,
          hub: chain.hubAddress as Address,
        });
        if (!burned || burned.amount !== pplIn || burned.seller.toLowerCase() !== account.toLowerCase()) {
          throw new Error("ReturnBurned");
        }

        setStatus({ step: "attesting" });
        const res = await fetch("/api/sale/return-attestation", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txHash: burnHash, returnId: burned.returnId }),
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setStatus({ step: "error", reason: attestationReason(payload?.error) });
          return null;
        }
        const proof = (await res.json()) as Attestation;
        if (proof.pplAmount !== pplIn.toString() || proof.returnId.toLowerCase() !== burned.returnId.toLowerCase()) {
          setStatus({ step: "error", reason: "badSignature" });
          return null;
        }

        setStatus({ step: "selling" });
        if (!(await ensureV2Chain(provider, chain))) {
          setStatus({ step: "error", reason: "switchRejected" });
          return null;
        }
        const basePublic = publicClient(chain.chain);
        const baseWallet = createWalletClient({ chain: chain.chain, transport: custom(provider), account });
        const hub = chain.hubAddress as Address;
        const [, , payout] = await basePublic.readContract({
          address: hub,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "quoteSellBack",
          args: [account, pplIn],
        });
        const minUsdcOut = minUsdcOutFromPayout(payout);
        if (payout <= BigInt(0) || minUsdcOut <= BigInt(0)) throw new Error("ZeroOut");
        const hash = await baseWallet.writeContract({
          address: hub,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "sellBack",
          args: [pplIn, minUsdcOut, proof.returnId, BigInt(proof.deadline), proof.signature],
          account,
          chain: chain.chain,
        });
        const receipt = await basePublic.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("transaction reverted");
        const done = { step: "done" as const, txHash: hash, payoutUsd6: payout };
        setStatus(done);
        return done;
      } catch (error) {
        setStatus({ step: "error", reason: sellBackErrorKey(error) });
        return null;
      }
    },
    [],
  );

  return {
    status,
    sellBack,
    reset,
    busy: !["idle", "done", "error"].includes(status.step),
  };
}
