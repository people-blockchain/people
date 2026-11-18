"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";

import type { EIP1193Provider } from "@/lib/evm/client";
import { approveErc20IfNeeded } from "@/lib/evm/erc20-allowance";
import { PPL_CURVE_HUB_V2_ABI } from "./abi";
import {
  buildContractCallsRequest,
  fetchLifiStatus,
  fetchOneTxQuote,
  LIFI_BASE_CHAIN_ID,
  ONE_TX_QUOTE_TTL_MS,
  proofLeavesTime,
  sourceToken,
  statusPhase,
  supportsDestinationCall,
  validateOneTxQuote,
  type HubVerification,
  type OneTxParams,
  type OneTxQuoteSummary,
} from "./lifi-route";
import { minPplOutFromQuote, usdcBalanceDelta, type V2Chain } from "./logic";
import { readUsdcBalance, waitForUsdcIncrease } from "./usdc-balance";

export type OneTxState =
  | { step: "idle" }
  | { step: "quoting" }
  | { step: "ready"; summary: OneTxQuoteSummary; params: OneTxParams; quotedAt: number; requoted?: boolean }
  | { step: "unavailable"; reason: string }
  | { step: "approving" }
  | { step: "sending" }
  | { step: "bridging"; txHash: Hex }
  | { step: "done"; txHash: Hex; pplOutWei: bigint; boughtAtMs: number }
  | { step: "refunded"; refundedUsd6: bigint }
  | { step: "error"; reason: string };

export type OneTxQuoteInput = {
  chain: V2Chain;
  account: Address;
  fromChain: number;
  symbol: "USDC" | "USDT";
  usdcIn: bigint;
  referrer?: Address | null;
  /** Buyer not yet bound on Base: run `verifyAndBuy` with this attestation. */
  verification?: HubVerification | null;
};

const POLL_MS = 8_000;
const POLL_LIMIT_MS = 45 * 60_000;

function reasonOf(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string } | null;
  if (e?.code === 4001) return "rejected";
  return (e?.shortMessage ?? e?.message ?? "failed").slice(0, 160);
}

async function switchWallet(provider: EIP1193Provider, chainId: number): Promise<boolean> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] });
    return true;
  } catch {
    return false;
  }
}

/** Quote and run the one-signature LI.FI purchase (see `lifi-route.ts`). */
export function useLifiOneTx() {
  const [state, setState] = useState<OneTxState>({ step: "idle" });
  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const set = useCallback((next: OneTxState) => {
    if (alive.current) setState(next);
  }, []);

  const reset = useCallback(() => {
    seq.current += 1;
    set({ step: "idle" });
  }, [set]);

  const requestQuote = useCallback(
    async (input: OneTxQuoteInput, requoted = false) => {
      const id = ++seq.current;
      const { chain } = input;
      if (chain.id !== LIFI_BASE_CHAIN_ID || !chain.hubAddress || !chain.usdcAddress) {
        set({ step: "unavailable", reason: "notBaseMainnet" });
        return;
      }
      if (!supportsDestinationCall(input.fromChain)) {
        set({ step: "unavailable", reason: "unsupportedSourceChain" });
        return;
      }
      const token = sourceToken(input.fromChain, input.symbol);
      if (!token) {
        set({ step: "unavailable", reason: "unsupportedToken" });
        return;
      }
      set({ step: "quoting" });
      try {
        const base = createPublicClient({ chain: chain.chain, transport: http(undefined, { timeout: 12_000 }) });
        const [quotedPplOut] = await base.readContract({
          address: chain.hubAddress as Address,
          abi: PPL_CURVE_HUB_V2_ABI,
          functionName: "quoteBuy",
          args: [input.usdcIn],
        });
        const params: OneTxParams = {
          fromChain: input.fromChain,
          fromToken: token.address,
          account: input.account,
          hub: chain.hubAddress as Address,
          usdc: chain.usdcAddress as Address,
          usdcIn: input.usdcIn,
          minPplOut: minPplOutFromQuote(quotedPplOut),
          referrer: input.referrer ?? null,
          verification: input.verification ?? null,
        };
        const quote = await fetchOneTxQuote(buildContractCallsRequest(params));
        if (id !== seq.current) return;
        const check = validateOneTxQuote(quote, params);
        if (!check.ok) {
          set({ step: "unavailable", reason: check.reason });
          return;
        }
        if (params.verification && !proofLeavesTime(params.verification.deadline, Date.now(), check.summary.executionDurationSec)) {
          set({ step: "unavailable", reason: "proofExpiring" });
          return;
        }
        set({ step: "ready", summary: check.summary, params, quotedAt: Date.now(), requoted });
      } catch (error) {
        if (id !== seq.current) return;
        set({ step: "unavailable", reason: reasonOf(error) });
      }
    },
    [set],
  );

  const execute = useCallback(
    async (ctx: { chain: V2Chain; provider: EIP1193Provider; quoteInput: OneTxQuoteInput }) => {
      if (state.step !== "ready") return null;
      const { summary, params, quotedAt } = state;
      if (Date.now() - quotedAt > ONE_TX_QUOTE_TTL_MS) {
        await requestQuote(ctx.quoteInput, true);
        return null;
      }
      const { chain, provider } = ctx;
      const account = params.account;
      if (params.verification && !proofLeavesTime(params.verification.deadline, Date.now(), summary.executionDurationSec)) {
        set({ step: "unavailable", reason: "proofExpiring" });
        return null;
      }
      try {
        if (!(await switchWallet(provider, params.fromChain))) {
          set({ step: "error", reason: "switchRejected" });
          return null;
        }
        const before = await readUsdcBalance(chain, account);
        const source = createPublicClient({ transport: custom(provider) });
        const wallet = createWalletClient({ transport: custom(provider), account });
        if (summary.approvalAddress) {
          const spender = summary.approvalAddress;
          const approved = await approveErc20IfNeeded({
            amount: summary.fromAmount,
            readAllowance: () =>
              source.readContract({
                address: params.fromToken,
                abi: erc20Abi,
                functionName: "allowance",
                args: [account, spender],
              }),
            approve: () => {
              set({ step: "approving" });
              // Exact amount only, never MaxUint256 (SPEC §12.1).
              return wallet.writeContract({
                address: params.fromToken,
                abi: erc20Abi,
                functionName: "approve",
                args: [spender, summary.fromAmount],
                account,
                chain: null,
              });
            },
            waitForReceipt: (hash) => source.waitForTransactionReceipt({ hash }),
          });
          if (!approved.ok) throw new Error(approved.reason === "reverted" ? "approval reverted" : "allowance unchanged");
        }
        set({ step: "sending" });
        const hash = await wallet.sendTransaction({
          to: summary.tx.to,
          data: summary.tx.data,
          value: summary.tx.value,
          account,
          chain: null,
        });
        const sent = await source.waitForTransactionReceipt({ hash });
        if (sent.status !== "success") throw new Error("source transaction reverted");
        set({ step: "bridging", txHash: hash });

        const startedAt = Date.now();
        let receivingHash: Hex | null = summary.crossChain ? null : hash;
        let settled = !summary.crossChain;
        while (!settled && Date.now() - startedAt < POLL_LIMIT_MS) {
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
          if (!alive.current) return null;
          const status = await fetchLifiStatus({ txHash: hash, fromChain: params.fromChain, bridge: summary.tool });
          if (statusPhase(status) === "settled") {
            settled = true;
            receivingHash = (status.receiving?.txHash as Hex | undefined) ?? null;
          }
        }
        if (!settled) {
          set({ step: "error", reason: "timeout" });
          return null;
        }

        const base = createPublicClient({ chain: chain.chain, transport: http(undefined, { timeout: 12_000 }) });
        if (receivingHash) {
          const receipt = await base.waitForTransactionReceipt({ hash: receivingHash });
          const bought = parseEventLogs({ abi: PPL_CURVE_HUB_V2_ABI, eventName: "Bought", logs: receipt.logs }).find(
            (log) =>
              log.address.toLowerCase() === params.hub.toLowerCase() &&
              log.args.recipient.toLowerCase() === account.toLowerCase(),
          );
          if (bought) {
            const done = {
              step: "done" as const,
              txHash: receivingHash,
              pplOutWei: bought.args.pplOut,
              boughtAtMs: Date.now(),
            };
            set(done);
            return done;
          }
        }
        // No Bought event: the destination call reverted and the bridge receiver sent the USDC to
        // the buyer on Base. Measure it on-chain so the top-up button spends only what arrived.
        const after = await waitForUsdcIncrease(chain, account, before);
        const refundedUsd6 = usdcBalanceDelta(before, after);
        const refunded = { step: "refunded" as const, refundedUsd6 };
        set(refundedUsd6 > BigInt(0) ? refunded : { step: "error", reason: "unknownOutcome" });
        return refundedUsd6 > BigInt(0) ? refunded : null;
      } catch (error) {
        set({ step: "error", reason: reasonOf(error) });
        return null;
      }
    },
    [state, requestQuote, set],
  );

  return { state, requestQuote, execute, reset };
}
