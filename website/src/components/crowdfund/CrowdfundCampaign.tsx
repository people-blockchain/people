"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useExternalWallet, writeViaActiveSigner, readPublicClient } from "@/context/ExternalWalletContext";
import { Eyebrow } from "@/components/ui/primitives";
import { ConnectWalletMenu } from "@/components/wallet/ConnectWalletMenu";
import { describePreflightError } from "@/lib/tx-preflight-copy";
import { crowdfundCopy } from "@/lib/crowdfund/campaign-copy";
import {
  CampaignReadError,
  buildCampaignRequest,
  deriveCampaign,
  formatCountdown,
  formatPpl,
  parseContribution,
  readCampaign,
  type CampaignAction,
  type CampaignReadClient,
  type CampaignSnapshot,
} from "@/lib/crowdfund/campaign";

const STATUS_KEY = {
  open: "statusOpen",
  reached: "statusReached",
  claimed: "statusClaimed",
  failed: "statusFailed",
} as const;

export function CrowdfundCampaign({ address }: { address: string }) {
  const { lang } = useLanguage();
  const t = crowdfundCopy[lang];
  const { signer } = useExternalWallet();
  const account = signer?.address ?? null;

  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadError, setLoadError] = useState<CampaignReadError["reason"] | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState<CampaignAction | null>(null);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await readCampaign(readPublicClient() as unknown as CampaignReadClient, address, account);
      setSnapshot(next);
      setLoadedAt(Date.now());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof CampaignReadError ? err.reason : "load_failed");
    }
  }, [address, account]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  // The chain clock was read at `loadedAt`; the countdown keeps running from the local clock.
  const live = useMemo<CampaignSnapshot | null>(
    () => (snapshot ? { ...snapshot, now: snapshot.now + BigInt(Math.max(0, Math.floor((tick - loadedAt) / 1000))) } : null),
    [snapshot, tick, loadedAt],
  );
  const view = useMemo(() => (live ? deriveCampaign(live, account) : null), [live, account]);

  const send = async (action: CampaignAction) => {
    if (!signer || !snapshot) return;
    setError("");
    setTxHash("");
    let amountWei: bigint | undefined;
    if (action === "contribute") {
      const parsed = parseContribution(amountText);
      if (!parsed) {
        setError(t.invalidAmount);
        return;
      }
      amountWei = parsed;
    }
    setBusy(action);
    try {
      // Simulation + gas estimate run inside writeViaActiveSigner; a call that would revert is never sent.
      const hash = await writeViaActiveSigner(signer, buildCampaignRequest(action, snapshot.address, amountWei));
      setTxHash(hash);
      await readPublicClient().waitForTransactionReceipt({ hash });
      if (action === "contribute") setAmountText("");
      await load();
    } catch (err) {
      setError(describePreflightError(err, lang)?.text ?? (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(null);
    }
  };

  const units = { dayShort: t.dayShort, hourShort: t.hourShort, minShort: t.minShort, secShort: t.secShort };
  const buttonClass =
    "rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-canvas disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6" data-testid="crowdfund-campaign">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-lead text-ink-2">{t.about}</p>

      {loadError ? (
        <p className="mt-8 rounded-xl border border-line bg-surface-2 p-4 text-sm" role="alert">
          {loadError === "load_failed" ? t.loadError : t.notCampaign}
        </p>
      ) : !snapshot || !live || !view ? (
        <p className="mt-8 text-sm text-ink-3">{t.loading}</p>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink-2" data-testid="crowdfund-status">
              {t[STATUS_KEY[view.status]]}
            </p>
            <p className="mt-2 text-2xl font-bold" data-testid="crowdfund-raised">
              {formatPpl(snapshot.raised)} / {formatPpl(snapshot.goal)} PPL
            </p>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.barPercent}
            >
              <div className="h-full bg-ink" style={{ width: `${view.barPercent}%` }} />
            </div>
            <p className="mt-2 text-sm text-ink-3">{t.progress.replace("{pct}", String(view.percent))}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-3">{t.deadline}</dt>
                <dd className="font-mono text-ink">{new Date(Number(snapshot.deadline) * 1000).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-ink-3">{t.timeLeft}</dt>
                <dd className="font-mono text-ink" data-testid="crowdfund-countdown">
                  {view.ended ? t.ended : formatCountdown(view.secondsLeft, units)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink-3">{t.creator}</dt>
                <dd className="break-all font-mono text-ink">
                  <Link className="underline" href={`/explorer/address/${snapshot.owner}`}>
                    {snapshot.owner}
                  </Link>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-ink-3">{t.contract}</dt>
                <dd className="break-all font-mono text-ink">
                  <Link className="underline" href={`/explorer/contract/${snapshot.address}`}>
                    {snapshot.address}
                  </Link>
                </dd>
              </div>
              {account ? (
                <div className="sm:col-span-2">
                  <dt className="text-ink-3">{t.yourContribution}</dt>
                  <dd className="font-mono text-ink">{formatPpl(snapshot.contribution)} PPL</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {signer ? (
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
              <label htmlFor="crowdfund-amount" className="block text-sm text-ink-2">
                {t.amountLabel}
                <input
                  id="crowdfund-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  disabled={!view.canContribute}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!view.canContribute || busy !== null}
                  onClick={() => void send("contribute")}
                  data-testid="crowdfund-contribute"
                >
                  {t.contribute}
                </button>
                {view.isCreator ? (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!view.canClaim || busy !== null}
                    onClick={() => void send("claim")}
                    data-testid="crowdfund-claim"
                  >
                    {t.claim}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={buttonClass}
                  disabled={!view.canRefund || busy !== null}
                  onClick={() => void send("refund")}
                  data-testid="crowdfund-refund"
                >
                  {t.refund}
                </button>
              </div>
              <ul className="space-y-1 text-xs text-ink-3">
                {!view.canContribute ? <li>{t.closedHint}</li> : null}
                {view.isCreator && !view.canClaim ? <li>{t.claimHint}</li> : null}
                {!view.canRefund ? <li>{t.refundHint}</li> : null}
              </ul>
              {busy ? <p className="text-sm text-ink-2">{t.pending}</p> : null}
              {error ? (
                <p className="text-sm text-warm" role="alert">
                  {error}
                </p>
              ) : null}
              {txHash && !busy && !error ? (
                <p className="text-sm text-ink-2">
                  {t.done}{" "}
                  <Link className="underline" href={`/explorer/tx/${encodeURIComponent(txHash)}`}>
                    {t.viewTx}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5 text-center">
              <p className="text-ink-2">{t.connect}</p>
              <div className="mt-4 flex justify-center">
                <ConnectWalletMenu />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-sm">
        <Link className="underline" href="/create/contract?template=crowdfund">
          {t.createOwn}
        </Link>
      </p>
    </section>
  );
}
