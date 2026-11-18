"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Address } from "viem";

import type { EIP1193Provider } from "@/lib/evm/client";
import { fillCopy, intlLocale, usdCents } from "@/lib/sale/format";
import { sourceChain, sourceToken, type HubVerification } from "@/lib/sale/v2/lifi-route";
import type { V2Chain } from "@/lib/sale/v2/logic";
import { useLifiOneTx } from "@/lib/sale/v2/useLifiOneTx";

export type OneTxCopy = {
  oneTxCta: string;
  oneTxPay: string;
  oneTxFees: string;
  oneTxHint: string;
  oneTxQuoting: string;
  oneTxBridging: string;
  oneTxNoRoute: string;
  oneTxRequote: string;
  oneTxError: string;
  oneTxVerifyCta: string;
  oneTxVerifyHint: string;
  eta: string;
  etaDuration: string;
  preview: string;
};

type Props = {
  chain: V2Chain;
  account: Address | null;
  provider?: EIP1193Provider;
  fromChain: number;
  symbol: "USDC" | "USDT";
  /** USDC the hub should receive: the amount typed in the panel, already validated. */
  usdcIn: bigint | null;
  lang: string;
  copy: OneTxCopy;
  preview: boolean;
  disabled?: boolean;
  /** Buyer is not bound on Base yet: get an attestation first and buy with `verifyAndBuy`. */
  needsVerification?: boolean;
  getProof?: () => Promise<HubVerification | null>;
  onSuccess: (purchase: { txHash: string; pplOutWei: bigint; boughtAtMs: number }) => void;
  onRefunded: (refundedUsd6: bigint) => void;
};

/** Rounds a source-token amount up to cents so the shown figure is never below what is charged. */
function payText(amount: bigint, decimals: number, lang: string): string {
  const value = Math.ceil(Number(formatUnits(amount, decimals)) * 100) / 100;
  return value.toLocaleString(intlLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fixed sample for preview screenshots; never sent anywhere. */
const PREVIEW_PAY = { amount: BigInt("100620000"), decimals: 6, feesUsd: 0.31 };

export function LifiOneTx({
  chain,
  account,
  provider,
  fromChain,
  symbol,
  usdcIn,
  lang,
  copy,
  preview,
  disabled,
  needsVerification = false,
  getProof,
  onSuccess,
  onRefunded,
}: Props) {
  const { state, requestQuote, execute, reset } = useLifiOneTx();
  const [proof, setProof] = useState<HubVerification | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofFailed, setProofFailed] = useState(false);
  const waitingForProof = needsVerification && !proof;
  const chainName = sourceChain(fromChain)?.name ?? "";
  const quoteInput = useMemo(
    () =>
      account && usdcIn && usdcIn > BigInt(0) && sourceToken(fromChain, symbol) && !(needsVerification && !proof)
        ? { chain, account, fromChain, symbol, usdcIn, verification: needsVerification ? proof : null }
        : null,
    [chain, account, fromChain, symbol, usdcIn, needsVerification, proof],
  );

  // An attestation that would expire before the bridge lands is dropped; the buyer signs again.
  useEffect(() => {
    if (state.step === "unavailable" && state.reason === "proofExpiring") setProof(null);
  }, [state]);

  const onGetProof = async () => {
    if (!getProof) return;
    setProofBusy(true);
    setProofFailed(false);
    try {
      const got = await getProof();
      setProof(got);
      setProofFailed(!got);
    } catch {
      setProofFailed(true);
    } finally {
      setProofBusy(false);
    }
  };

  useEffect(() => {
    if (preview) return;
    if (!quoteInput) {
      reset();
      return;
    }
    const timer = setTimeout(() => void requestQuote(quoteInput), 600);
    return () => clearTimeout(timer);
  }, [preview, quoteInput, requestQuote, reset]);

  useEffect(() => {
    if (state.step === "done") onSuccess({ txHash: state.txHash, pplOutWei: state.pplOutWei, boughtAtMs: state.boughtAtMs });
    if (state.step === "refunded") onRefunded(state.refundedUsd6);
    // Fire once per terminal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const busy = ["quoting", "approving", "sending", "bridging"].includes(state.step);
  const ready = state.step === "ready";
  const summary = ready ? state.summary : null;
  const pay = preview
    ? payText(PREVIEW_PAY.amount, PREVIEW_PAY.decimals, lang)
    : summary
      ? payText(summary.fromAmount, summary.fromDecimals, lang)
      : null;
  const feesUsd = preview ? PREVIEW_PAY.feesUsd : summary?.feesUsd ?? null;
  const crossChain = fromChain !== 8453;

  return (
    <div className="space-y-2 rounded-2xl border border-brand/40 bg-brand/5 p-4" data-testid="v2-onetx">
      {pay ? (
        <dl className="space-y-1 text-sm">
          <div className="font-semibold text-ink" data-testid="v2-onetx-pay">
            {fillCopy(copy.oneTxPay, { amount: pay, token: symbol, chain: chainName })}
          </div>
          {feesUsd !== null ? (
            <div className="text-ink-2" data-testid="v2-onetx-fees">
              {fillCopy(copy.oneTxFees, { fees: usdCents(feesUsd, lang) })}
            </div>
          ) : null}
          {crossChain ? <div className="text-ink-2">{fillCopy(copy.eta, { eta: copy.etaDuration })}</div> : null}
        </dl>
      ) : null}
      {state.step === "quoting" ? <p className="text-sm text-ink-2">{copy.oneTxQuoting}</p> : null}
      {state.step === "unavailable" ? (
        <p className="text-sm text-warm" role="status" data-testid="v2-onetx-noroute">
          {copy.oneTxNoRoute}
        </p>
      ) : null}
      {ready && state.requoted ? <p className="text-sm text-warm">{copy.oneTxRequote}</p> : null}
      <p className="text-xs text-ink-3">{copy.oneTxHint}</p>
      {waitingForProof ? (
        <div className="space-y-1" data-testid="v2-onetx-verify">
          <p className="text-xs text-ink-2">{copy.oneTxVerifyHint}</p>
          <button
            type="button"
            onClick={() => void onGetProof()}
            disabled={preview || disabled || proofBusy || !account || !getProof}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-brand px-5 text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="v2-onetx-verify-cta"
          >
            {copy.oneTxVerifyCta}
          </button>
          {proofFailed ? (
            <p className="text-sm text-warm" role="alert">
              {copy.oneTxError}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!provider || !quoteInput) return;
          void execute({ chain, provider, quoteInput });
        }}
        disabled={preview || disabled || waitingForProof || !ready || !provider || busy}
        className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        data-testid="v2-onetx-cta"
      >
        {state.step === "bridging" ? fillCopy(copy.oneTxBridging, { eta: copy.etaDuration }) : copy.oneTxCta}
      </button>
      {preview ? <p className="text-xs text-ink-3">{copy.preview}</p> : null}
      {state.step === "error" ? (
        <p className="text-sm text-warm" role="alert" data-testid="v2-onetx-error">
          {copy.oneTxError}
        </p>
      ) : null}
    </div>
  );
}
