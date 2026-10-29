"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { FactoryCopyContent } from "@/lib/factory-content";
import type { IconPresetId } from "@/lib/factory-icon-config";
import { signFactoryTx } from "@/lib/people-sign";
import { signWalletMessage } from "@/lib/partner/wallet";
import { buildIconQuotaProofMessage } from "@/lib/factory-icon-proof";
import { networkJson } from "@/lib/network-client";
import { useWallet } from "@/context/WalletContext";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { formatPpl } from "@/lib/asset-amounts";
import { fill } from "@/lib/ux-copy";
import { checkUploadSize, postUploadForm, uploadErrorMessage } from "@/lib/upload-response";

type QuotaState = {
  enabled: boolean;
  freeRemaining?: number;
  /** M20-4: false when the connected wallet is not a verified founder; null before a wallet is known. */
  freeEligible?: boolean | null;
  paidFeePpl?: number;
  paymentRequired?: boolean;
  turnstileSiteKey?: string | null;
  feeRecipient?: string | null;
};

type Variant = { index: number; preview: string };

/** How often to re-check the node for a payment tx's finality, and how long to keep trying. */
const PAYMENT_FINALITY_POLL_MS = 1_500;
const PAYMENT_FINALITY_DEADLINE_MS = 24_000;

/**
 * M2: the server only accepts a payment tx once the node marks it finalized. A tx just accepted
 * into the mempool is not yet spendable here, so wait for the flag instead of sending the id
 * straight away and getting a `payment_tx_not_finalized` 402.
 */
async function waitForPaymentFinalized(txId: string): Promise<void> {
  const deadline = Date.now() + PAYMENT_FINALITY_DEADLINE_MS;
  while (Date.now() < deadline) {
    try {
      const tx = await networkJson<{ finalized?: boolean }>(
        `transactions/${encodeURIComponent(txId)}`
      );
      if (tx.finalized === true) return;
    } catch {
      // Not indexed by the node yet — keep polling until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_FINALITY_POLL_MS));
  }
  throw new Error("payment_not_finalized");
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export function FactoryIconGenerator({
  copy,
  onPicked,
}: {
  copy: FactoryCopyContent;
  onPicked: (uri: string, preview: string) => void;
}) {
  const ic = copy.iconGen;
  const { session } = useWallet();
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaState>({ enabled: false });
  const [preset, setPreset] = useState<IconPresetId>("flat");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const refreshQuota = useCallback(async () => {
    const wallet = session?.address ?? "";
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : "";
    const res = await fetch(`/api/factory/icon/quota${qs}`);
    const data = (await res.json()) as QuotaState;
    setQuota(data);
    return data;
  }, [session?.address]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  useEffect(() => {
    if (!open || !quota.turnstileSiteKey || !turnstileRef.current) return;
    const sitekey = quota.turnstileSiteKey;
    const mount = () => {
      if (!window.turnstile || !turnstileRef.current) return;
      if (widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
        return;
      }
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey,
        callback: (token: string) => setTurnstileToken(token),
      });
    };
    if (window.turnstile) {
      mount();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, [open, quota.turnstileSiteKey]);

  if (!quota.enabled) {
    return null;
  }

  const payForGeneration = async (): Promise<string | undefined> => {
    if (!session || !quota.paidFeePpl) return undefined;
    const health = await networkJson<{ chainId: string }>("health");
    const live = await networkJson<{ nonce?: number }>(`address/${session.address}`);
    const recipient = quota.feeRecipient;
    if (!recipient) {
      throw new Error("fee_recipient_unconfigured");
    }
    const tx = signFactoryTx(session.privateKey, {
      chainId: health.chainId,
      id: `${session.address}-iconGenPay-${Date.now()}`,
      from: session.address,
      to: recipient,
      amount: quota.paidFeePpl,
      fee: 0.004875,
      nonce: Number(live.nonce ?? 0),
      timestamp: Date.now(),
      type: "transfer",
      payload: { memo: "icon-gen" },
    });
    const sent = await networkJson<{ accepted?: boolean; error?: string }>("tx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tx),
    });
    if (!sent.accepted) {
      throw new Error(sent.error ?? "payment_rejected");
    }
    await waitForPaymentFinalized(tx.id);
    return tx.id;
  };

  const generate = async () => {
    if (!session) {
      setError(ic.connectWallet);
      return;
    }
    setBusy(true);
    setError("");
    setVariants([]);
    try {
      // L1: prove ownership of the wallet so the free quota can't be spent by naming a public
      // address. One proof covers both attempts; it stays fresh well past the payment poll.
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const issuedAt = Date.now();
      const signed = signWalletMessage(
        session.privateKey,
        buildIconQuotaProofMessage({ wallet: session.address, nonce, issuedAt })
      );
      const proofPayload = {
        proofNonce: nonce,
        proofIssuedAt: issuedAt,
        proofPublicKey: signed.publicKey,
        proofSignature: signed.signature,
      };
      let paymentTxId: string | undefined;
      const attempt = async (withPayment?: string) => {
        const res = await fetch("/api/factory/icon/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wallet: session.address,
            preset,
            subject,
            turnstileToken,
            paymentTxId: withPayment,
            ...proofPayload,
          }),
        });
        return res;
      };
      let res = await attempt();
      if (res.status === 402) {
        paymentTxId = await payForGeneration();
        res = await attempt(paymentTxId);
      }
      const data = (await res.json()) as {
        variants?: Variant[];
        error?: string;
        freeRemaining?: number;
      };
      if (!res.ok || !data.variants) {
        setError(data.error ?? ic.errorGeneric);
        return;
      }
      setVariants(data.variants);
      if (typeof data.freeRemaining === "number") {
        setQuota((q) => ({ ...q, freeRemaining: data.freeRemaining }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ic.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  const pickVariant = async (variant: Variant) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(variant.preview);
      if (!res.ok) throw new Error("variant_fetch");
      const blob = await res.blob();
      const tooBig = checkUploadSize(blob.size);
      if (tooBig) {
        setError(uploadErrorMessage(tooBig, copy.upload));
        return;
      }
      const body = new FormData();
      body.set("file", new File([blob], "icon.png", { type: "image/png" }));
      const up = await postUploadForm<{ uri?: string; previewUrl?: string }>("/api/factory/media", body);
      if (!up.ok || !up.data.uri) {
        setError(uploadErrorMessage(up.ok ? "upload_failed" : up.code, copy.upload));
        return;
      }
      const preview = up.data.previewUrl ?? up.data.uri;
      onPicked(up.data.uri, preview);
      setOpen(false);
      setVariants([]);
    } catch (err) {
      console.error("icon variant upload failed", err);
      setError(ic.errorGeneric);
    } finally {
      setBusy(false);
    }
  };

  // M20-4: a wallet that isn't a verified founder gets no free quota, so show why instead of
  // a misleading "0 free today".
  const freeLine =
    quota.freeEligible === false
      ? ic.verifiedOnly
      : typeof quota.freeRemaining === "number"
        ? fill(ic.remainingFree, { count: String(quota.freeRemaining) })
        : null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-surface"
      >
        <Sparkles className="h-4 w-4 text-brand" aria-hidden />
        {ic.button}
      </button>
      {open ? (
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
          <p className="text-sm text-ink-2">{ic.lead}</p>
          {freeLine ? <p className="text-xs font-medium text-ink">{freeLine}</p> : null}
          {quota.paidFeePpl !== undefined ? (
            <p className="text-xs text-ink-3">{fill(ic.paidNote, { fee: formatPpl(quota.paidFeePpl) })}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["flat", ic.presetFlat],
                ["badge", ic.presetBadge],
                ["mascot", ic.presetMascot],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreset(id)}
                className={`rounded-xl px-3 py-2 text-sm ${preset === id ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block text-sm text-ink">
            {ic.subjectLabel}
            <input
              value={subject}
              maxLength={100}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={ic.subjectPlaceholder}
              className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2"
            />
          </label>
          {quota.turnstileSiteKey ? <div ref={turnstileRef} className="min-h-[65px]" /> : null}
          {!session ? (
            <div className="space-y-2">
              <p className="text-sm text-warm">{ic.connectWallet}</p>
              <ConnectWalletButton className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink" />
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy || !session || subject.trim().length < 2}
            onClick={() => void generate()}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40"
          >
            {busy ? ic.busy : ic.generate}
          </button>
          {variants.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-ink-2">{ic.pickHint}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {variants.map((v) => (
                  <button
                    key={v.index}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickVariant(v)}
                    className="overflow-hidden rounded-xl border border-line hover:ring-2 hover:ring-brand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.preview} alt="" className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-warm">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
