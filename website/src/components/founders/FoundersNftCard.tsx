"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { readPublicClient, signViaActiveSigner, useExternalWalletOptional, writeViaActiveSigner } from "@/context/ExternalWalletContext";
import { useLanguage } from "@/context/LanguageContext";
import { fillFounderNftTemplate, founderNftCopy, type FounderNftCopy } from "@/lib/founder-nft-content";
import { readFounderNftPublicConfig } from "@/lib/founders/founder-nft-config";
import { buildFounderNftWalletAuthMessage } from "@/lib/founders/founder-nft-wallet-auth";
import type { FounderNftSignature, FounderNftStatus } from "@/lib/founders/founder-nft-service";
import {
  buildFounderNftCancelRequest,
  buildFounderNftExecuteRequest,
  buildFounderNftMintRequest,
  buildFounderNftRequestRebindRequest,
  formatFounderNftNumber,
  formatRebindCountdown,
  founderNftApiErrorKey,
  founderNftWriteErrorKey,
  rebindCountdown,
  shortAddress,
  type FounderNftErrorKey,
} from "@/lib/founders/founder-nft-ui";

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink shadow-[0_10px_30px_-12px_rgba(3,105,161,0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40";

type Phase = "idle" | "loading" | "ready" | "wallet" | "confirming";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatus(value: unknown): value is FounderNftStatus {
  return isRecord(value) && typeof value.state === "string";
}

function isSignature(value: unknown): value is FounderNftSignature {
  return (
    isRecord(value) &&
    typeof value.personId === "string" &&
    typeof value.address === "string" &&
    typeof value.nonce === "string" &&
    typeof value.deadline === "string" &&
    typeof value.signature === "string"
  );
}

function countdownText(executeAfter: number, now: number, copy: FounderNftCopy): string {
  return formatRebindCountdown(rebindCountdown(executeAfter, now), {
    d: copy.unitDay,
    h: copy.unitHour,
    m: copy.unitMinute,
  });
}

/**
 * Founder NFT actions. Hidden when the contract address is unset, the visitor is
 * signed out, or the status route answers 401/403. Does not render Founder's Seal copy.
 */
export function FoundersNftCard({ signedIn }: { signedIn: boolean }) {
  const config = readFounderNftPublicConfig();
  const contract = config?.address ?? null;
  const { lang } = useLanguage();
  const copy = founderNftCopy[lang];
  const wallet = useExternalWalletOptional();
  const signer = wallet?.signer ?? null;
  const connectInjected = wallet?.connectInjected;
  const address = signer?.address ?? null;
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<FounderNftStatus | null>(null);
  const [signerReady, setSignerReady] = useState(true);
  const [errorKey, setErrorKey] = useState<FounderNftErrorKey | null>(null);
  const [notice, setNotice] = useState<"done" | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [connecting, setConnecting] = useState(false);

  const pendingAfter =
    status?.state === "holder"
      ? status.pending?.executeAfter
      : status?.state === "rebind_pending"
        ? status.pending.executeAfter
        : undefined;

  useEffect(() => {
    if (pendingAfter === undefined) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pendingAfter]);

  useEffect(() => {
    if (!contract || !signedIn || !address) return;
    const requested = address;
    let cancelled = false;
    setPhase("loading");
    setErrorKey(null);
    void (async () => {
      try {
        const response = await fetch(`/api/founders/nft/status?address=${encodeURIComponent(requested)}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setHidden(true);
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const code = isRecord(body) && typeof body.error === "string" ? body.error : undefined;
          setStatus(null);
          setSignerReady(false);
          setErrorKey(founderNftApiErrorKey(response.status, code));
          setPhase("ready");
          return;
        }
        const next = isRecord(body) && isStatus(body.status) ? body.status : null;
        if (!next) {
          setStatus(null);
          setErrorKey("errGeneric");
          setPhase("ready");
          return;
        }
        setHidden(false);
        setStatus(next);
        setSignerReady(isRecord(body) && body.signerReady === true);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setErrorKey("errUnavailable");
          setPhase("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, contract, revision, signedIn]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  async function requestSignature(action: "mint" | "rebind"): Promise<FounderNftSignature | null> {
    if (!address || !signer) return null;
    const nonceResponse = await fetch("/api/founders/nft/auth-nonce", { cache: "no-store", credentials: "same-origin" });
    const nonceBody: unknown = await nonceResponse.json().catch(() => null);
    if (!nonceResponse.ok || !isRecord(nonceBody)) {
      const code = isRecord(nonceBody) && typeof nonceBody.error === "string" ? nonceBody.error : undefined;
      setErrorKey(founderNftApiErrorKey(nonceResponse.status, code));
      setPhase("ready");
      return null;
    }
    const nonce = nonceBody.nonce;
    const expiresAt = nonceBody.expiresAt;
    const chainId = nonceBody.chainId;
    if (typeof nonce !== "string" || typeof expiresAt !== "string" || typeof chainId !== "number") {
      setErrorKey("errGeneric");
      setPhase("ready");
      return null;
    }
    setPhase("wallet");
    const walletSignature = await signViaActiveSigner(
      signer,
      buildFounderNftWalletAuthMessage({ address, nonce, chainId, expiresAt }),
    );
    const response = await fetch("/api/founders/nft/signature", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, address, nonce, chainId, walletSignature }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code = isRecord(body) && typeof body.error === "string" ? body.error : undefined;
      setErrorKey(founderNftApiErrorKey(response.status, code));
      setPhase("ready");
      return null;
    }
    if (!isSignature(body)) {
      setErrorKey("errGeneric");
      setPhase("ready");
      return null;
    }
    return body;
  }

  async function send(request: Record<string, unknown>) {
    if (!signer) return;
    setNotice(null);
    setErrorKey(null);
    setPhase("wallet");
    try {
      const hash = await writeViaActiveSigner(signer, request);
      setPhase("confirming");
      const receipt = await readPublicClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("reverted");
      setNotice("done");
      setPhase("ready");
      reload();
    } catch (error) {
      setErrorKey(founderNftWriteErrorKey(error));
      setPhase("ready");
    }
  }

  async function onConnect() {
    if (!connectInjected) return;
    setConnecting(true);
    setErrorKey(null);
    try {
      await connectInjected();
    } catch (error) {
      setErrorKey(founderNftWriteErrorKey(error));
    } finally {
      setConnecting(false);
    }
  }

  if (!config || !wallet || !signedIn || hidden) return null;

  const busy = phase === "wallet" || phase === "confirming" || phase === "loading" || connecting;
  const needsSigner = status?.state === "can_mint" || status?.state === "rebind_available";
  const showDisabled = errorKey === "errNotConfigured" || (status !== null && needsSigner && !signerReady);
  const number = status && "tokenId" in status ? formatFounderNftNumber(status.tokenId) : "";

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" aria-labelledby="founders-founder-nft-title" data-testid="founders-founder-nft">
      <div className="rounded-[28px] border border-line bg-surface p-6 shadow-[var(--elev-1)] sm:p-8">
        <h2 id="founders-founder-nft-title" className="text-2xl font-bold text-ink">
          {copy.title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-2">{copy.lead}</p>

        {!address ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink-2">{copy.connectHint}</p>
            <button type="button" className={primaryBtn} disabled={connecting} onClick={() => void onConnect()} data-testid="founders-founder-nft-connect">
              {connecting ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
              {copy.connectButton}
            </button>
          </div>
        ) : null}

        {address && phase === "loading" && !status ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-ink-2" role="status">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {copy.checking}
          </p>
        ) : null}

        {notice === "done" ? (
          <p className="mt-4 text-sm text-value" role="status">
            {copy.done}
          </p>
        ) : null}
        {phase === "wallet" ? <p className="mt-4 text-sm text-ink-2" role="status">{copy.mintBusy}</p> : null}
        {phase === "confirming" ? <p className="mt-4 text-sm text-ink-2" role="status">{copy.txPending}</p> : null}
        {errorKey && !showDisabled ? (
          <p className="mt-4 text-sm text-warm" role="alert">
            {copy[errorKey]}
          </p>
        ) : null}

        {address && showDisabled ? <p className="mt-5 text-sm text-ink-2">{copy.disabled}</p> : null}

        {address && status && !showDisabled && status.state === "can_mint" ? (
          <div className="mt-5">
            <button
              type="button"
              className={primaryBtn}
              disabled={busy || !signerReady}
              data-testid="founders-founder-nft-mint"
              onClick={() => {
                if (!signer) return;
                void (async () => {
                  setPhase("loading");
                  setErrorKey(null);
                  setNotice(null);
                  try {
                    const signature = await requestSignature("mint");
                    if (!signature) return;
                    await send(buildFounderNftMintRequest(config, signature) as unknown as Record<string, unknown>);
                  } catch (error) {
                    setErrorKey(founderNftWriteErrorKey(error));
                    setPhase("ready");
                  }
                })();
              }}
            >
              {copy.mintButton}
            </button>
          </div>
        ) : null}

        {address && status && status.state === "holder" ? (
          <div className="mt-5 space-y-3">
            <p className="text-lg font-semibold text-ink" data-testid="founders-founder-nft-yours">
              {fillFounderNftTemplate(copy.yourNft, { n: number })}
            </p>
            <p className="text-sm text-ink-2">{copy.yourNftHint}</p>
            {status.pending && pendingAfter !== undefined && now < status.pending.executeAfter ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">{copy.holderPendingTitle}</p>
                <p className="text-sm text-ink-2">
                  {fillFounderNftTemplate(copy.holderPendingBody, {
                    n: number,
                    holder: shortAddress(status.pending.newHolder),
                    time: countdownText(status.pending.executeAfter, now, copy),
                  })}
                </p>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busy}
                  data-testid="founders-founder-nft-cancel"
                  onClick={() => void send(buildFounderNftCancelRequest(config, status.personId) as unknown as Record<string, unknown>)}
                >
                  {copy.cancelButton}
                </button>
              </div>
            ) : null}
            {status.pending && pendingAfter !== undefined && now >= status.pending.executeAfter ? (
              <p className="text-sm text-ink-2">
                {fillFounderNftTemplate(copy.holderPendingReady, { holder: shortAddress(status.pending.newHolder) })}
              </p>
            ) : null}
          </div>
        ) : null}

        {address && status && !showDisabled && status.state === "rebind_available" ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-ink" data-testid={status.dedup ? "founders-founder-nft-dedup" : undefined}>
              {status.dedup ? copy.dedupTitle : copy.rebindTitle}
            </p>
            <p className="text-sm text-ink-2">
              {fillFounderNftTemplate(status.dedup ? copy.dedupLead : copy.rebindLead, {
                n: number,
                holder: shortAddress(status.oldHolder),
              })}
            </p>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy}
              data-testid="founders-founder-nft-rebind"
              onClick={() => {
                void (async () => {
                  setPhase("loading");
                  setErrorKey(null);
                  setNotice(null);
                  try {
                    const signature = await requestSignature("rebind");
                    if (!signature) return;
                    await send(buildFounderNftRequestRebindRequest(config, signature) as unknown as Record<string, unknown>);
                  } catch (error) {
                    setErrorKey(founderNftWriteErrorKey(error));
                    setPhase("ready");
                  }
                })();
              }}
            >
              {fillFounderNftTemplate(copy.rebindButton, { n: number })}
            </button>
          </div>
        ) : null}

        {address && status && status.state === "rebind_pending" ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-semibold text-ink">{copy.rebindPendingTitle}</p>
            {now < status.pending.executeAfter ? (
              <p className="text-sm text-ink-2" data-testid="founders-founder-nft-countdown">
                {fillFounderNftTemplate(copy.rebindPendingWait, {
                  time: countdownText(status.pending.executeAfter, now, copy),
                })}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-2">{copy.rebindReady}</p>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy}
                  data-testid="founders-founder-nft-execute"
                  onClick={() => void send(buildFounderNftExecuteRequest(config, status.personId) as unknown as Record<string, unknown>)}
                >
                  {copy.executeButton}
                </button>
              </>
            )}
          </div>
        ) : null}

        {address && status?.state === "minted_elsewhere" ? <p className="mt-5 text-sm text-ink-2">{copy.mintedElsewhere}</p> : null}
        {address && status?.state === "mint_closed" ? <p className="mt-5 text-sm text-ink-2">{copy.mintClosed}</p> : null}
        {address && status?.state === "not_eligible" ? <p className="mt-5 text-sm text-ink-2">{copy.hpOnly}</p> : null}
      </div>
    </section>
  );
}
