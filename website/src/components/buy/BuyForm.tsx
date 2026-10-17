"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useState } from "react";
import type { Address } from "viem";

import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { buyCopy } from "@/lib/buy-content";
import { hubPaymentToken, LIFI_BRIDGE_SOURCE_CHAINS_EN } from "@/lib/sale/bridge";
import { SALE, type SaleStableSymbol, saleContractConfigured } from "@/lib/sale/config";
import { quoteBuy } from "@/lib/sale/curve";
import { fillCopy, pplCompact, pricePerPpl, usd } from "@/lib/sale/format";

const BuyLifiBridge = dynamic(
  () => import("./BuyLifiBridge").then((mod) => mod.BuyLifiBridge),
  { ssr: false, loading: () => <div className="min-h-[420px] rounded-2xl border border-line bg-surface-2" /> },
);

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

const LABEL = "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3";

type PayMode = "base" | "bridge";

/**
 * Single buy widget for `/buy`. State is local; curve parameters come from config.
 */
export function BuyForm({
  soldPpl,
  variant = "panel",
  testId,
}: {
  soldPpl: number | null;
  variant?: "panel" | "bare";
  testId?: string;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const { session } = useWallet();
  const externalWallet = useExternalWalletOptional();
  const { openWalletModal } = useWalletModal();

  const evmAddress = (session?.address ?? externalWallet?.signer?.address ?? "") as Address | "";
  const connected = Boolean(evmAddress);

  const [amount, setAmount] = useState(String(SALE.maxPerBuyUsd / 5));
  const [stable, setStable] = useState<SaleStableSymbol>("USDC");
  const [payMode, setPayMode] = useState<PayMode>("base");
  const [conversionReady, setConversionReady] = useState(false);

  const amountFieldId = useId();
  const stableFieldId = useId();

  const usdAmount = Number(amount.replace(",", "."));
  const amountValid = Number.isFinite(usdAmount) && usdAmount > 0;
  const overLimit = amountValid && usdAmount > SALE.maxPerBuyUsd;

  const quote = useMemo(
    () => (amountValid ? quoteBuy(soldPpl ?? 0, Math.min(usdAmount, SALE.maxPerBuyUsd)) : null),
    [amountValid, soldPpl, usdAmount],
  );

  const showBuyCta =
    payMode === "base" && stable === "USDC" ? true : conversionReady;

  const showConnect = !connected;
  // hubPaymentToken(stable) is the on-chain stable for buyWith when the sale opens (USDC only).
  const hubStable = hubPaymentToken(stable);
  void hubStable;
  const buttonDisabled = !showConnect || !amountValid || overLimit || !saleContractConfigured() || !showBuyCta;

  const rows: { label: string; value: string }[] = quote
    ? [
        { label: t.form.youGet, value: `${pplCompact(quote.pplOut, lang)} PPL` },
        { label: t.form.avgPrice, value: pricePerPpl(quote.avgPriceUsd, lang) },
        { label: t.form.priceAfter, value: pricePerPpl(quote.priceAfterUsd, lang) },
      ]
    : [];

  const bridgeChains =
    t.form.supportedBridgeChains?.trim() || LIFI_BRIDGE_SOURCE_CHAINS_EN;

  const resetConversion = () => setConversionReady(false);

  const body = (
    <div className="space-y-4" data-testid={testId}>
      <div>
        <span className={LABEL}>{t.form.payModeLabel}</span>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            data-testid="pay-mode-base"
            onClick={() => {
              setPayMode("base");
              resetConversion();
            }}
            className={`rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
              payMode === "base"
                ? "border-brand bg-brand/10 text-ink"
                : "border-line bg-surface-2 text-ink-2 hover:border-brand/40"
            }`}
          >
            {t.form.payOnBase}
          </button>
          <button
            type="button"
            data-testid="pay-mode-bridge"
            onClick={() => {
              setPayMode("bridge");
              resetConversion();
            }}
            className={`rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
              payMode === "bridge"
                ? "border-brand bg-brand/10 text-ink"
                : "border-line bg-surface-2 text-ink-2 hover:border-brand/40"
            }`}
          >
            {t.form.payFromOther}
          </button>
        </div>
        {payMode === "bridge" ? (
          <p className="mt-1.5 text-xs text-ink-3">
            {fillCopy(t.form.bridgeHint, { chains: bridgeChains })}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-ink-3">{t.form.basePayHint}</p>
        )}
        {payMode === "bridge" ? (
          <p className="mt-1 text-xs text-ink-3">{t.form.bridgeUsdtHint}</p>
        ) : null}
      </div>

      {payMode === "bridge" ? (
        <div className="space-y-3" data-testid="buy-bridge-panel">
          <p className="text-sm font-semibold text-ink">{t.form.bridgePanelTitle}</p>
          {!connected ? (
            <p className="text-sm text-ink-2">{t.form.bridgeNeedWallet}</p>
          ) : (
            <BuyLifiBridge
              variant="cross-chain"
              recipient={evmAddress as Address}
              onBridgeComplete={() => setConversionReady(true)}
              testId="buy-lifi-widget"
            />
          )}
          {conversionReady ? (
            <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-medium text-ink">
              {t.form.bridgeReady}
            </p>
          ) : null}
        </div>
      ) : null}

      {payMode === "base" && stable === "USDT" ? (
        <div className="space-y-3" data-testid="buy-usdt-swap-panel">
          <p className="text-sm font-semibold text-ink">{t.form.usdtSwapTitle}</p>
          {!connected ? (
            <p className="text-sm text-ink-2">{t.form.bridgeNeedWallet}</p>
          ) : (
            <BuyLifiBridge
              variant="base-usdt"
              recipient={evmAddress as Address}
              onBridgeComplete={() => setConversionReady(true)}
              testId="buy-lifi-widget-usdt"
            />
          )}
          {conversionReady ? (
            <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-medium text-ink">
              {t.form.usdtSwapReady}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <label className={LABEL} htmlFor={amountFieldId}>
            {t.form.amountLabel}
          </label>
          <div className="relative">
            <input
              id={amountFieldId}
              type="number"
              inputMode="decimal"
              min={1}
              max={SALE.maxPerBuyUsd}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-describedby={`${amountFieldId}-hint`}
              className={`${FIELD} pr-16 font-mono text-base`}
            />
            <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-3">
              {stable}
            </span>
          </div>
          <p id={`${amountFieldId}-hint`} className="mt-1.5 text-xs text-ink-3">
            {t.form.amountHint}
          </p>
        </div>
        <div>
          <label className={LABEL} htmlFor={stableFieldId}>
            {t.form.stableLabel}
          </label>
          <select
            id={stableFieldId}
            data-testid="buy-stable-select"
            value={stable}
            onChange={(event) => {
              setStable(event.target.value as SaleStableSymbol);
              resetConversion();
            }}
            className={FIELD}
          >
            <option value="USDC">USDC</option>
            <option value="USDT">{t.form.stableUsdtOption}</option>
          </select>
          {stable === "USDT" ? (
            <p data-testid="buy-usdt-note" className="mt-1.5 text-xs text-ink-3">
              {t.form.usdtConvertHint}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        {quote && !overLimit ? (
          <dl className="space-y-2">
            {rows.map((row, index) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-ink-2">{row.label}</dt>
                <dd
                  className={
                    index === 0
                      ? "font-mono text-lg font-bold text-brand"
                      : "font-mono text-sm font-semibold text-ink"
                  }
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-2">
            {overLimit
              ? fillCopy(t.form.overLimit, { amount: usd(SALE.maxPerBuyUsd, lang) })
              : t.form.belowMin}
          </p>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-3">
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.limitPerBuy, { amount: usd(SALE.maxPerBuyUsd, lang) })}
        </li>
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.limitPerDay, { amount: usd(SALE.maxPerDayUsd, lang) })}
        </li>
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.cooldown, { seconds: SALE.cooldownSeconds })}
        </li>
      </ul>

      {showBuyCta ? (
        <button
          type="button"
          data-testid="buy-cta"
          disabled={buttonDisabled}
          onClick={
            showConnect
              ? openWalletModal
              : () => {
                  // TODO(sale-deploy): approve + buyWith(hubPaymentToken(stable), ...) when hub is live.
                }
          }
          className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
        >
          {showConnect ? t.form.cta : t.form.ctaDisabled}
        </button>
      ) : (
        <p className="text-center text-sm text-ink-2">
          {payMode === "base" && stable === "USDT" ? t.form.usdtSwapAwaiting : t.form.bridgeAwaiting}
        </p>
      )}

      <p className="text-xs text-ink-3">{t.form.wallets}</p>
      <p className="text-xs text-ink-3">
        {fillCopy(t.form.sellBack, { fee: `${SALE.sellFeePct}%` })}
      </p>
    </div>
  );

  if (variant === "bare") return body;

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-2)] sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-ink">{t.form.title}</h2>
      {body}
    </div>
  );
}
