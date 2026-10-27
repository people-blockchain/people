"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";

import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { buyCopy } from "@/lib/buy-content";
import { fillCopy, intlLocale, ppl, pricePerPpl, usd } from "@/lib/sale/format";
import { V2_PHASES, V2_SALE } from "@/lib/sale/v2/constants";
import {
  estimatePplOut,
  isV2PreviewEnabled,
  minPplOutFromEstimate,
  parseV2PreviewState,
  partialTopUpAmount,
  phaseView,
  pplWeiToNumber,
  readV2Env,
  resolveV2Chain,
  sellBackUnlockMs,
  spotPriceWadToUsd,
  validateV2BuyAmount,
} from "@/lib/sale/v2/logic";
import { useV2Sale, useV2Refresh } from "@/lib/sale/v2/useV2Sale";
import { useV2Buy, type V2TxStatus } from "@/lib/sale/v2/useV2Buy";

import { V2PhaseBanner } from "./PhaseBanner";
import { V2VerificationGate } from "./VerificationGate";

const BuyLifiBridge = dynamic(
  () => import("../BuyLifiBridge").then((mod) => mod.BuyLifiBridge),
  { ssr: false, loading: () => <div className="min-h-[360px] rounded-2xl border border-line bg-surface-2" /> },
);

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";
const LABEL = "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3";

type NetworkChoice = "base" | "other";
type TokenChoice = "USDC" | "USDT";

type Purchase = { txHash: string; pplOutWei: bigint; boughtAtMs: number };

function txUrl(explorer: string | null, hash: string): string | null {
  return explorer ? `${explorer}/tx/${hash}` : null;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function amountText(value: number, lang: string): string {
  return value.toLocaleString(intlLocale(lang), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SellbackLine({ line, linkText }: { line: string; linkText: string }) {
  const index = linkText ? line.lastIndexOf(linkText) : -1;
  if (index < 0) {
    return (
      <Link href="/buy#faq" className="underline">
        {line}
      </Link>
    );
  }
  return (
    <span>
      {line.slice(0, index)}
      <Link href="/buy#faq" className="font-medium underline" data-testid="v2-sellback-link">
        {linkText}
      </Link>
      {line.slice(index + linkText.length)}
    </span>
  );
}

function StatusError({ status, fallback }: { status: V2TxStatus; fallback: string }) {
  if (status.step !== "error") return null;
  return (
    <p className="text-sm text-warm" role="alert" data-testid="v2-tx-error">
      {fallback}
    </p>
  );
}

/**
 * The PplCurveHubV2 purchase panel. Rendered instead of the legacy form only
 * when `NEXT_PUBLIC_PPL_V2_BUY_ENABLED` is on.
 */
export function BuyV2Panel({ testId = "buy-v2-panel" }: { testId?: string }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].v2;
  const searchParams = useSearchParams();
  const env = useMemo(() => readV2Env(), []);
  const chain = useMemo(() => resolveV2Chain(env), [env]);
  const previewEnabled = isV2PreviewEnabled(env);
  const previewState = previewEnabled ? parseV2PreviewState(searchParams.get("v2state")) : null;

  const { session } = useWallet();
  const externalWallet = useExternalWalletOptional();
  const { openWalletModal } = useWalletModal();
  const { refreshKey, refresh } = useV2Refresh();
  const account = (session?.address ?? externalWallet?.signer?.address ?? null) as Address | null;
  const provider = externalWallet?.signer?.provider;
  const walletChainId = externalWallet?.chainId ?? null;

  const { snapshot, error, verification, preview } = useV2Sale({
    chain,
    account,
    previewState,
    refreshKey,
  });
  const { verifyStatus, buyStatus, confirmOnChain, buyPpl, busy } = useV2Buy();

  const [amount, setAmount] = useState("100");
  const [network, setNetwork] = useState<NetworkChoice>("base");
  const [token, setToken] = useState<TokenChoice>("USDC");
  const [swapReady, setSwapReady] = useState<number | null>(null);
  const [localPurchase, setLocalPurchase] = useState<Purchase | null>(null);
  const [partial, setPartial] = useState<{ receivedUsdc: number } | null>(null);

  const [nowMs, setNowMs] = useState(preview?.nowMs ?? 0);
  useEffect(() => {
    if (!preview) setNowMs(Date.now());
  }, [preview]);
  const view = phaseView(snapshot?.phase ?? V2_PHASES.NotOpen, snapshot?.openedAtSec ?? 0, nowMs);
  const showVerification = view.whitelist && !snapshot?.personId;
  const verifiedOnChain = Boolean(snapshot?.personId);
  const canBuy = view.buyable && (!view.whitelist || verifiedOnChain);

  const parsedAmount = Number.parseFloat(amount.replace(",", "."));
  const validation = validateV2BuyAmount({ amountUsd: parsedAmount });
  const spotPriceWad = snapshot?.spotPriceWad ?? BigInt(0);
  const spotPriceUsd = spotPriceWadToUsd(spotPriceWad);
  const estimate =
    validation.ok && spotPriceWad > BigInt(0)
      ? estimatePplOut(BigInt(Math.round(validation.amountUsd * 1_000_000)), spotPriceWad)
      : BigInt(0);
  const minimum = minPplOutFromEstimate(estimate);

  const needsSwap = network === "other" || token === "USDT";
  const purchase = preview?.purchase ?? localPurchase;
  const partialState = preview?.partial ?? partial;
  const topUp = partialTopUpAmount({
    swapSucceeded: true,
    buyFailed: Boolean(partialState),
    receivedUsdc: partialState?.receivedUsdc ?? 0,
  });

  const wrongNetwork =
    canBuy && account && provider && walletChainId !== null && walletChainId !== chain.id;
  const canSign = Boolean(provider);

  const amountError =
    validation.ok || !Number.isFinite(parsedAmount) || amount.trim() === ""
      ? null
      : validation.reason === "below_min"
        ? fillCopy(t.form.belowMin, { min: usd(V2_SALE.minPerBuyUsd, lang) })
        : validation.reason === "over_max"
          ? fillCopy(t.form.overMax, { max: usd(V2_SALE.maxPerBuyUsd, lang) })
          : validation.reason === "over_day"
            ? fillCopy(t.form.overDay, { max: usd(V2_SALE.maxPerDayUsd, lang) })
            : t.form.invalid;

  const onConnect = () => openWalletModal();

  const onConfirm = async () => {
    if (!provider || !account) {
      onConnect();
      return;
    }
    const ok = await confirmOnChain({ chain, provider, account });
    if (ok) refresh();
  };

  const runPurchase = async (value: number) => {
    if (!provider || !account) {
      onConnect();
      return;
    }
    if (!snapshot) return;
    const result = await buyPpl({
      chain,
      provider,
      account,
      amountUsd: value,
      spotPriceWad: snapshot.spotPriceWad,
    });
    if (result) {
      setLocalPurchase({
        txHash: result.txHash,
        pplOutWei: result.pplOutWei,
        boughtAtMs: result.boughtAtMs,
      });
      setPartial(null);
      refresh();
    } else if (needsSwap) {
      setPartial({ receivedUsdc: value });
    }
  };

  const onBuy = async () => {
    if (!canBuy) return;
    if (!account) {
      onConnect();
      return;
    }
    if (needsSwap) {
      if (swapReady === null) return;
      await runPurchase(swapReady);
      return;
    }
    if (!validation.ok) return;
    await runPurchase(validation.amountUsd);
  };

  const onTopUp = async () => {
    if (!topUp) return;
    await runPurchase(topUp);
  };

  const ctaDisabled =
    !canBuy ||
    (!account && !preview) ||
    (Boolean(account) && !canSign && !preview) ||
    busy ||
    (needsSwap ? swapReady === null : !validation.ok);

  const ctaLabel = !canBuy ? t.form.needVerification : !account ? t.form.connect : t.form.cta;

  return (
    <div
      className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-2)] sm:p-6"
      data-testid={testId}
      data-preview={previewState ?? undefined}
    >
      <div className="space-y-4">
        <V2PhaseBanner view={view} copy={t.banner} />

        {showVerification ? (
          <V2VerificationGate
            copy={t.verify}
            signedIn={verification.signedIn}
            siteVerified={verification.verifiedHuman}
            onChainVerified={false}
            accountConnected={Boolean(account)}
            status={verifyStatus}
            onConfirm={() => void onConfirm()}
            onConnect={onConnect}
          />
        ) : verifiedOnChain ? (
          <p className="rounded-xl border border-value/40 bg-value/5 px-3 py-2 text-sm font-medium text-ink" data-testid="v2-verified">
            {t.verify.alreadyVerified}
          </p>
        ) : null}

        {purchase ? (
          <div className="rounded-2xl border border-value/40 bg-value/5 p-4" data-testid="v2-success">
            <p className="text-base font-bold text-ink">{t.success.title}</p>
            <p className="mt-1 text-sm text-ink-2">
              {fillCopy(t.success.credited, {
                ppl: ppl(pplWeiToNumber(purchase.pplOutWei), lang),
                address: shortAddress(account ?? "0x0000000000000000000000000000000000000000"),
              })}
            </p>
            <p className="mt-1 text-sm text-ink-2" data-testid="v2-unlock">
              {fillCopy(t.success.unlock, {
                date: new Intl.DateTimeFormat(intlLocale(lang), {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(sellBackUnlockMs(purchase.boughtAtMs))),
              })}
            </p>
            {txUrl(chain.explorer, purchase.txHash) ? (
              <a
                href={txUrl(chain.explorer, purchase.txHash) as string}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-brand underline"
              >
                {t.success.tx}
              </a>
            ) : null}
            {!preview ? (
              <button
                type="button"
                onClick={() => {
                  setLocalPurchase(null);
                  setSwapReady(null);
                }}
                className="mt-3 block min-h-11 text-sm font-semibold text-brand underline"
              >
                {t.success.again}
              </button>
            ) : null}
          </div>
        ) : null}

        {partialState ? (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" data-testid="v2-partial">
            <p className="text-base font-bold text-ink">{t.partial.title}</p>
            <p className="mt-1 text-sm text-ink-2">
              {fillCopy(t.partial.body, { amount: usd(partialState.receivedUsdc, lang) })}
            </p>
            <button
              type="button"
              onClick={() => void onTopUp()}
              disabled={!topUp || busy || Boolean(preview)}
              className="mt-3 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink disabled:cursor-not-allowed disabled:opacity-55"
              data-testid="v2-topup"
            >
              {t.partial.topUp.replace("{amount}", amountText(topUp ?? partialState.receivedUsdc, lang))}
            </button>
            <p className="mt-2 text-xs text-ink-3">{t.partial.hint}</p>
          </div>
        ) : null}

        {!purchase ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={LABEL} htmlFor={`${testId}-network`}>
                  {t.form.network}
                </label>
                <select
                  id={`${testId}-network`}
                  data-testid="v2-network"
                  value={network}
                  onChange={(event) => {
                    setNetwork(event.target.value as NetworkChoice);
                    setSwapReady(null);
                  }}
                  className={FIELD}
                  disabled={!canBuy}
                >
                  <option value="base">{t.form.networkBase}</option>
                  <option value="other">{t.form.networkOther}</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor={`${testId}-token`}>
                  {t.form.token}
                </label>
                <select
                  id={`${testId}-token`}
                  data-testid="v2-token"
                  value={token}
                  onChange={(event) => {
                    setToken(event.target.value as TokenChoice);
                    setSwapReady(null);
                  }}
                  className={FIELD}
                  disabled={!canBuy}
                >
                  <option value="USDC">{t.form.tokenUsdc}</option>
                  <option value="USDT">{t.form.tokenUsdt}</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor={`${testId}-amount`}>
                  {t.form.amount}
                </label>
                <input
                  id={`${testId}-amount`}
                  data-testid="v2-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setSwapReady(null);
                  }}
                  className={`${FIELD} font-mono`}
                  disabled={!canBuy}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface-2 p-4" data-testid="v2-quote">
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-2">{t.form.estimate}</dt>
                  <dd className="font-mono font-semibold text-ink" data-testid="v2-estimate">
                    {estimate > BigInt(0) ? `${ppl(pplWeiToNumber(estimate), lang)} PPL` : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-2">{t.form.minimum}</dt>
                  <dd className="font-mono font-semibold text-ink" data-testid="v2-minimum">
                    {minimum > BigInt(0) ? `${ppl(pplWeiToNumber(minimum), lang)} PPL` : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-2">{t.form.price}</dt>
                  <dd className="font-mono font-semibold text-ink">
                    {spotPriceUsd > 0 ? pricePerPpl(spotPriceUsd, lang) : "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3" data-testid="v2-fees">
                  <dt className="text-ink-2">{fillCopy(t.form.fees, { fees: usd(0.01, lang) })}</dt>
                </div>
                {network === "other" ? (
                  <div className="flex items-baseline justify-between gap-3" data-testid="v2-eta">
                    <dt className="text-ink-2">
                      {fillCopy(t.form.eta, { eta: "1–20 min" })}
                    </dt>
                  </div>
                ) : null}
              </dl>
              <details className="mt-2 text-xs text-ink-3">
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-2">
                  {t.form.feesToggle}
                </summary>
                <p className="pb-1">{t.form.feesBody}</p>
              </details>
            </div>

            {amountError ? (
              <p className="text-sm text-warm" role="alert" data-testid="v2-amount-error">
                {amountError}
              </p>
            ) : null}

            {needsSwap && canBuy ? (
              <div className="space-y-2" data-testid="v2-lifi">
                <p className="text-xs text-ink-3">{t.form.bridgeHint}</p>
                {account ? (
                  <BuyLifiBridge
                    variant={network === "other" ? "cross-chain" : "base-usdt"}
                    lang={lang}
                    recipient={account}
                    toAddressName={t.form.networkBase}
                    onBridgeComplete={() => {
                      setSwapReady(validation.ok ? validation.amountUsd : null);
                      setPartial(null);
                    }}
                    testId="v2-lifi-widget"
                  />
                ) : null}
              </div>
            ) : null}

            <p className="text-xs text-ink-3" data-testid="v2-lifi-line">
              {t.form.lifiLine}
            </p>

            {previewState ? <p className="text-xs text-ink-3">{t.form.preview}</p> : null}
            {!canSign && account && !preview ? (
              <p className="text-sm text-warm" role="status">
                {t.verify.connectWallet}
              </p>
            ) : null}
            {wrongNetwork ? (
              <p className="text-sm text-warm" role="status" data-testid="v2-wrong-network">
                {t.form.wrongNetwork}
              </p>
            ) : null}
            {error && !preview ? (
              <p className="text-sm text-warm" role="status">
                {t.verify.error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void onBuy()}
              disabled={ctaDisabled}
              className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
              data-testid="v2-buy-cta"
            >
              {busy ? t.form.buying : ctaLabel}
            </button>

            <p className="text-center text-xs text-ink-3" data-testid="v2-sellback">
              <SellbackLine line={t.form.sellbackLine} linkText={t.form.sellbackLink} />
            </p>

            <StatusError status={buyStatus} fallback={t.form.error} />
            <StatusError status={verifyStatus} fallback={t.verify.error} />
          </>
        ) : null}
      </div>
    </div>
  );
}

