"use client";

import { useId, useMemo, useState } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { buyCopy } from "@/lib/buy-content";
import {
  BUY_NETWORKS,
  DEFAULT_BUY_NETWORK_ID,
  SALE,
  type SaleStableSymbol,
  saleContractConfigured,
} from "@/lib/sale/config";
import { quoteBuy } from "@/lib/sale/curve";
import { fillCopy, pplCompact, pricePerPpl, usd } from "@/lib/sale/format";

import { FootnoteRef } from "./SmallPrint";

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

const LABEL = "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3";

/**
 * The buy widget. Rendered twice (hero and bottom CTA), so it owns its own
 * state and reads everything else from `@/lib/sale/config`.
 *
 * `soldPpl` comes from the chain adapter. While the sale is not deployed it is
 * `null` and the quote is computed from the start of the curve — labelled as an
 * estimate, never as a live figure.
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
  const connected = Boolean(session?.address ?? externalWallet?.signer?.address);

  const [amount, setAmount] = useState(String(SALE.maxPerBuyUsd / 5));
  const [networkId, setNetworkId] = useState(DEFAULT_BUY_NETWORK_ID);
  const [stable, setStable] = useState<SaleStableSymbol>("USDC");

  const amountFieldId = useId();
  const networkFieldId = useId();
  const stableFieldId = useId();

  const network = BUY_NETWORKS.find((n) => n.id === networkId) ?? BUY_NETWORKS[0];
  // Base has no native USDT, Tron/TON have no USDC — keep the pair valid.
  const activeStable = network.stables.includes(stable) ? stable : network.stables[0];

  const usdAmount = Number(amount.replace(",", "."));
  const amountValid = Number.isFinite(usdAmount) && usdAmount > 0;
  const overLimit = amountValid && usdAmount > SALE.maxPerBuyUsd;

  const quote = useMemo(
    () => (amountValid ? quoteBuy(soldPpl ?? 0, Math.min(usdAmount, SALE.maxPerBuyUsd)) : null),
    [amountValid, soldPpl, usdAmount],
  );

  // Connecting a wallet is real and always available. Buying is not: there is
  // no deployed contract to sign against, so a connected visitor sees
  // "Sale is not open yet" instead of a button that would do nothing.
  // TODO(sale-deploy): once `saleContractConfigured()` is true, send the buy
  // here (approve + buy with minOut/deadline) rather than disabling the button.
  const showConnect = !connected;
  const buttonDisabled = !showConnect || !amountValid || overLimit || !saleContractConfigured();

  const rows: { label: string; value: string }[] = quote
    ? [
        { label: t.form.youGet, value: `${pplCompact(quote.pplOut, lang)} PPL` },
        { label: t.form.avgPrice, value: pricePerPpl(quote.avgPriceUsd, lang) },
        { label: t.form.priceAfter, value: pricePerPpl(quote.priceAfterUsd, lang) },
      ]
    : [];

  const body = (
    <div className="space-y-4" data-testid={testId}>
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
              {activeStable}
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
            value={activeStable}
            onChange={(event) => setStable(event.target.value as SaleStableSymbol)}
            className={FIELD}
          >
            {network.stables.map((symbol) => (
              <option key={symbol} value={symbol}>
                {symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor={networkFieldId}>
          {t.form.networkLabel}
        </label>
        <select
          id={networkFieldId}
          value={network.id}
          onChange={(event) => setNetworkId(event.target.value)}
          className={FIELD}
        >
          {BUY_NETWORKS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-ink-3">{t.form.networkHint}</p>
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
        <p className="mt-3 border-t border-line pt-3 text-xs text-ink-3">{t.form.estimate}</p>
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

      <button
        type="button"
        data-testid="buy-cta"
        disabled={buttonDisabled}
        onClick={showConnect ? openWalletModal : undefined}
        className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
      >
        {showConnect ? t.form.cta : t.form.ctaDisabled}
      </button>

      <p className="text-xs leading-relaxed text-ink-3">
        {t.form.disabledNote}
        <FootnoteRef marker="**" />
      </p>
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
