"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

import { createBrowserPublicClient, ensurePeopleChain, peopleViemChain, browserEvmRpcUrl, type EIP1193Provider } from "@/lib/evm/client";
import { PPL_CURVE_HUB_V2_ABI } from "./abi";
import type { V2Chain } from "./logic";
import {
  browserPendingStorage,
  forgetPending,
  pendingForAccount,
  readPendingPayouts,
  reconcilePending,
  rememberPending,
  writePendingPayouts,
  type PendingPayout,
  type SeenReturn,
} from "./pending-payout";
import { RETURN_BURNED_EVENT, PPL_RETURN_BURN_ABI, PEOPLE_MAINNET_CHAIN_ID, decodeReturnBurned } from "./return-burn";
import { choosePayableSlice, minUsdcOutFromPayout, sellBackErrorKey, sellBackFeeBand, sellBackPreflight, type SellLot } from "./sellback";
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
    case "awaiting_confirmations":
      return "confirming";
    default:
      return "error";
  }
}

const CONFIRMATION_POLLS = 30;
const CONFIRMATION_WAIT_MS = 2_000;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Attestation = {
  personId: Hex;
  hub: Address;
  seller: Address;
  pplAmount: string;
  sourceChainId: number;
  destChainId: number;
  returnId: Hex;
  deadline: number;
  signature: Hex;
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
      pplIn?: bigint;
      burnAddress: Address;
      /** When false, a pending payout blocks another burn. */
      allowAnotherBurn?: boolean;
      /** Skip the burn and pay this sale. */
      pending?: PendingPayout;
    }) => {
      const { chain, provider, account, personId, burnAddress, pending } = ctx;
      const pplIn = ctx.pplIn ?? (pending ? BigInt(pending.amount) : BigInt(0));
      try {
        if (!pending && ctx.allowAnotherBurn === false) {
          setStatus({ step: "error", reason: "error" });
          return null;
        }
        if (!chain.hubAddress) {
          setStatus({ step: "error", reason: "notConfigured" });
          return null;
        }
        const hub = chain.hubAddress as Address;
        const basePublic = publicClient(chain.chain);
        let burnHash: Hex;
        let burned: { returnId: Hex; amount: bigint; seller: Address; personId: Hex; destChainId: bigint };
        if (pending) {
          if (
            pending.account.toLowerCase() !== account.toLowerCase() ||
            pending.seller.toLowerCase() !== account.toLowerCase() ||
            pending.hub.toLowerCase() !== hub.toLowerCase() ||
            pending.destChainId !== chain.chain.id
          ) {
            setStatus({ step: "error", reason: "badSignature" });
            return null;
          }
          burnHash = pending.burnTx;
          burned = {
            returnId: pending.returnId,
            amount: BigInt(pending.amount),
            seller: pending.seller,
            personId: pending.personId,
            destChainId: BigInt(pending.destChainId),
          };
        } else {
        const [paused, liquidityReleased, openedAt, returnVerifier, sellablePpl, personalRemainingUsd6, cap, quote] =
          await Promise.all([
            basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "paused" }),
            basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "liquidityReleased" }),
            basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "openedAt" }),
            basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "returnVerifier" }),
            basePublic.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "sellableNow",
              args: [account],
            }),
            basePublic.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "sellRemaining24h",
              args: [account],
            }),
            basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellBackCapToday" }),
            basePublic.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "quoteSellBack",
              args: [account, pplIn],
            }),
          ]);
        const gate = sellBackPreflight({
          opened: openedAt > BigInt(0),
          paused,
          liquidityReleased,
          returnVerifier,
          sellablePpl,
          pplIn,
          grossUsd6: quote[0],
          payoutUsd6: quote[2],
          personalRemainingUsd6,
          globalRemainingUsd6: cap[0],
        });
        if (!gate.ok) {
          setStatus({ step: "error", reason: gate.reason });
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
        burnHash = await peopleWallet.writeContract({
          address: burnAddress,
          abi: PPL_RETURN_BURN_ABI,
          functionName: "burnForReturn",
          args: [chain.hubAddress as Address, personId, account, BigInt(chain.chain.id)],
          value: pplIn,
          account,
          chain: peopleChain,
        });
        const burnReceipt = await peoplePublic.waitForTransactionReceipt({ hash: burnHash });
        if (burnReceipt.status !== "success") throw new Error("transaction reverted");
        const decoded = decodeReturnBurned(burnReceipt.logs, {
          burn: burnAddress,
          hub: chain.hubAddress as Address,
          destChainId: BigInt(chain.chain.id),
        });
        if (
          !decoded ||
          decoded.amount !== pplIn ||
          decoded.seller.toLowerCase() !== account.toLowerCase() ||
          decoded.destChainId !== BigInt(chain.chain.id)
        ) {
          throw new Error("ReturnBurned");
        }
        burned = {
          returnId: decoded.returnId,
          amount: decoded.amount,
          seller: decoded.seller,
          personId: decoded.personId,
          destChainId: decoded.destChainId,
        };
        const pendingItem: PendingPayout = {
          returnId: burned.returnId,
          amount: burned.amount.toString(),
          burnTx: burnHash,
          status: "pending",
          account,
          seller: burned.seller,
          hub,
          personId: burned.personId,
          destChainId: chain.chain.id,
        };
        const storage = browserPendingStorage();
        if (storage) rememberPending(storage, pendingItem);
        }

        setStatus({ step: "attesting" });
        let proof: Attestation | null = null;
        for (let attempt = 0; attempt < CONFIRMATION_POLLS; attempt++) {
          const res = await fetch("/api/sale/return-attestation", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ txHash: burnHash, returnId: burned.returnId }),
          });
          if (res.status === 202) {
            await wait(CONFIRMATION_WAIT_MS);
            continue;
          }
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as { error?: string } | null;
            setStatus({ step: "error", reason: attestationReason(payload?.error) });
            return null;
          }
          proof = (await res.json()) as Attestation;
          break;
        }
        if (!proof) {
          setStatus({ step: "error", reason: "confirming" });
          return null;
        }
        if (
          proof.pplAmount !== burned.amount.toString() ||
          proof.returnId.toLowerCase() !== burned.returnId.toLowerCase() ||
          proof.seller.toLowerCase() !== account.toLowerCase() ||
          proof.hub.toLowerCase() !== hub.toLowerCase() ||
          proof.destChainId !== chain.chain.id ||
          proof.sourceChainId !== PEOPLE_MAINNET_CHAIN_ID
        ) {
          setStatus({ step: "error", reason: "badSignature" });
          return null;
        }

        setStatus({ step: "selling" });
        if (!(await ensureV2Chain(provider, chain))) {
          setStatus({ step: "error", reason: "switchRejected" });
          return null;
        }
        const baseWallet = createWalletClient({ chain: chain.chain, transport: custom(provider), account });
        const signed = BigInt(proof.pplAmount);
        const claimed = await basePublic.readContract({
          address: hub,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "returnClaimedPpl",
          args: [proof.returnId],
        });
        const left = signed > claimed ? signed - claimed : BigInt(0);
        const [personalNow, capNow] = await Promise.all([
          basePublic.readContract({
            address: hub,
            abi: PPL_CURVE_HUB_V2_ABI,
            functionName: "sellRemaining24h",
            args: [account],
          }),
          basePublic.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellBackCapToday" }),
        ]);
        const { payable, payout } = await choosePayableSlice(
          left,
          async (amount) => {
            const row = await basePublic.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "quoteSellBack",
              args: [account, amount],
            });
            return { gross: row[0], payout: row[2] };
          },
          personalNow,
          capNow[0],
        );
        if (payable <= BigInt(0)) {
          setStatus({ step: "error", reason: personalNow <= capNow[0] ? "personalCap" : "globalCap" });
          return null;
        }
        const minUsdcOut = minUsdcOutFromPayout(payout);
        if (payout <= BigInt(0) || minUsdcOut <= BigInt(0)) throw new Error("ZeroOut");
        const hash = await baseWallet.writeContract({
          address: hub,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "sellBack",
          args: [payable, minUsdcOut, proof.returnId, BigInt(proof.deadline), signed, proof.signature],
          account,
          chain: chain.chain,
        });
        const receipt = await basePublic.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("transaction reverted");
        const [claimedNow, usedNow] = await Promise.all([
          basePublic.readContract({
            address: hub,
            abi: PPL_CURVE_HUB_V2_ABI,
            functionName: "returnClaimedPpl",
            args: [proof.returnId],
          }),
          basePublic.readContract({
            address: hub,
            abi: PPL_CURVE_HUB_V2_ABI,
            functionName: "returnUsed",
            args: [proof.returnId],
          }),
        ]);
        const store = browserPendingStorage();
        if (store && (usedNow || claimedNow >= signed)) forgetPending(store, proof.returnId);
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

  const resumePayout = useCallback(
    async (ctx: {
      chain: V2Chain;
      provider: EIP1193Provider;
      account: Address;
      personId: Hex;
      burnAddress: Address;
      pending: PendingPayout;
    }) => sellBack({ ...ctx, pending: ctx.pending, allowAnotherBurn: true }),
    [sellBack],
  );

  return {
    status,
    sellBack,
    resumePayout,
    reset,
    busy: !["idle", "done", "error"].includes(status.step),
  };
}

export function usePendingPayouts(input: {
  chain: V2Chain;
  account: Address | null;
  burnAddress: string | null;
  enabled: boolean;
  refreshKey?: number;
}): { pending: PendingPayout[]; loading: boolean } {
  const { chain, account, burnAddress, enabled, refreshKey = 0 } = input;
  const [pending, setPending] = useState<PendingPayout[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !account) {
      setPending([]);
      return;
    }
    const storage = browserPendingStorage();
    const stored = storage ? pendingForAccount(readPendingPayouts(storage), account) : [];
    setPending(stored);
    if (!chain.hubAddress || !burnAddress) return;
    let active = true;
    setLoading(true);
    const hub = chain.hubAddress as Address;
    const burn = getAddress(burnAddress);
    void (async () => {
      try {
        const people = createBrowserPublicClient();
        const logs = await people.getLogs({
          address: burn,
          event: RETURN_BURNED_EVENT,
          args: { from: account, hub },
          fromBlock: BigInt(0),
          toBlock: "latest",
        });
        const base = publicClient(chain.chain);
        const seen: SeenReturn[] = [];
        const noticed = new Set<string>();
        for (const log of logs) {
          const decoded = decodeReturnBurned(
            [{ address: log.address, topics: log.topics, data: log.data }],
            { burn, hub, destChainId: BigInt(chain.chain.id) },
          );
          if (!decoded || !log.transactionHash) continue;
          if (decoded.seller.toLowerCase() !== account.toLowerCase() && decoded.from.toLowerCase() !== account.toLowerCase()) {
            continue;
          }
          const [claimedPpl, used] = await Promise.all([
            base.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "returnClaimedPpl",
              args: [decoded.returnId],
            }),
            base.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "returnUsed",
              args: [decoded.returnId],
            }),
          ]);
          noticed.add(decoded.returnId.toLowerCase());
          seen.push({
            returnId: decoded.returnId,
            claimedPpl,
            used,
            amount: decoded.amount,
            burnTx: log.transactionHash,
            account,
            seller: decoded.seller,
            hub,
            personId: decoded.personId,
            destChainId: Number(decoded.destChainId),
          });
        }
        for (const item of stored) {
          if (noticed.has(item.returnId.toLowerCase())) continue;
          if (item.hub.toLowerCase() !== hub.toLowerCase() || item.destChainId !== chain.chain.id) continue;
          const [claimedPpl, used] = await Promise.all([
            base.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "returnClaimedPpl",
              args: [item.returnId],
            }),
            base.readContract({
              address: hub,
              abi: PPL_CURVE_HUB_V2_ABI,
              functionName: "returnUsed",
              args: [item.returnId],
            }),
          ]);
          seen.push({ returnId: item.returnId, claimedPpl, used, amount: BigInt(item.amount) });
        }
        if (!active) return;
        const next = pendingForAccount(reconcilePending(stored, seen), account);
        if (storage) {
          const others = readPendingPayouts(storage).filter((item) => item.account.toLowerCase() !== account.toLowerCase());
          writePendingPayouts(storage, [...others, ...next]);
        }
        setPending(next);
      } catch {
        if (active) setPending(stored);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [account, burnAddress, chain.chain, chain.hubAddress, enabled, refreshKey]);

  return { pending, loading };
}
