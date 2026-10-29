"use client";

import Link from "next/link";

import type { BuyCopy } from "@/lib/buy-content";
import type { V2TxStatus } from "@/lib/sale/v2/useV2Buy";

export function V2VerificationGate({
  copy,
  signedIn,
  siteVerified,
  onChainVerified,
  accountConnected,
  status,
  onConfirm,
  onConnect,
}: {
  copy: BuyCopy["v2"]["verify"];
  signedIn: boolean;
  siteVerified: boolean;
  onChainVerified: boolean;
  accountConnected: boolean;
  status: V2TxStatus;
  onConfirm: () => void;
  onConnect: () => void;
}) {
  if (onChainVerified) {
    return (
      <p className="rounded-xl border border-value/40 bg-value/5 px-3 py-2 text-sm font-medium text-ink" data-testid="v2-verified">
        {copy.alreadyVerified}
      </p>
    );
  }

  if (!siteVerified) {
    return (
      <div className="rounded-2xl border border-line bg-surface-2 p-4" data-testid="v2-verify-gate">
        <p className="text-sm font-semibold text-ink">{copy.title}</p>
        <p className="mt-1 text-sm text-ink-2">{copy.body}</p>
        <p className="mt-1 text-xs text-ink-3" data-testid="v2-telegram-note">
          {copy.telegramNote}
        </p>
        <Link
          href={signedIn ? "/founders#verify" : "/login?callbackUrl=%2Ffounders%3Fhash%3Dverify"}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink"
          data-testid="v2-verify-cta"
        >
          {signedIn ? copy.ctaVerify : copy.ctaSignIn}
        </Link>
      </div>
    );
  }

  if (!accountConnected) {
    return (
      <div className="rounded-2xl border border-line bg-surface-2 p-4" data-testid="v2-verify-gate">
        <p className="text-sm text-ink-2">{copy.connectWallet}</p>
        <button
          type="button"
          onClick={onConnect}
          className="mt-3 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink"
        >
          {copy.ctaConfirm}
        </button>
      </div>
    );
  }

  const busy = status.step === "switching" || status.step === "signing" || status.step === "confirming";
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4" data-testid="v2-verify-gate">
      <p className="text-sm font-semibold text-ink">{copy.confirmTitle}</p>
      <p className="mt-1 text-sm text-ink-2">{copy.confirmBody}</p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="mt-3 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink disabled:cursor-not-allowed disabled:opacity-55"
        data-testid="v2-confirm-onchain"
      >
        {busy ? copy.confirming : copy.ctaConfirm}
      </button>
      {status.step === "error" ? (
        <p className="mt-2 text-sm text-warm" role="alert" data-testid="v2-verify-error">
          {copy.error}
        </p>
      ) : null}
      {status.step === "done" ? <p className="mt-2 text-sm font-medium text-ink">{copy.confirmed}</p> : null}
    </div>
  );
}
