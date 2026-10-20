"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { Address, Hex } from "viem";

import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import {
  useExternalWalletOptional,
  type ActiveEvmSigner,
} from "@/context/ExternalWalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { buyCopy } from "@/lib/buy-content";
import {
  BUY_NETWORK_OPTIONS,
  type BuyNetworkId,
  defaultFromToken,
  hubPaymentToken,
} from "@/lib/sale/bridge";
import { SALE, type SaleStableSymbol, saleContractConfigured } from "@/lib/sale/config";
import { quoteBuy } from "@/lib/sale/curve";
import {
  activeSignerToBaseWriter,
  executeHubBuyWithUsdc,
  mapBuyError,
  pplToMinOut,
  readBaseUsdcBalance,
  sessionToBaseWriter,
  usdToUsdc6,
  waitForBaseReceipt,
  type BuyOnBaseErrorCode,
} from "@/lib/sale/buy-on-base";
import { fillCopy, pplCompact, pricePerPpl, usd } from "@/lib/sale/format";

const BuyLifiBridge = dynamic(
  () => import("./BuyLifiBridge").then((mod) => mod.BuyLifiBridge),
  { ssr: false },
);

const PENDING_BUY_KEY = "ppl-buy-pending";

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

const LABEL = "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3";

type CtaPhase = "connect" | "buy" | "pending" | "success" | "error";

function shortAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function resolveSigner(
  external: ReturnType<typeof useExternalWalletOptional>,
  session: ReturnType<typeof useWallet>["session"],
): ActiveEvmSigner | null {
  if (external?.signer) return external.signer;
  if (session?.privateKey) {
    return {
      kind: "embedded",
      address: session.address as Address,
      privateKey: session.privateKey as Hex,
    };
  }
  return null;
}

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

  const saleOpen = saleContractConfigured();

  const beneficiary = (externalWallet?.signer?.address ??
    session?.address ??
    "") as Address | "";
  const connected = Boolean(beneficiary);
  const signer = resolveSigner(externalWallet, session);

  const [networkId, setNetworkId] = useState<BuyNetworkId>("base");
  const [amount, setAmount] = useState(String(SALE.maxPerBuyUsd / 5));
  const [stable, setStable] = useState<SaleStableSymbol>("USDC");
  const [phase, setPhase] = useState<CtaPhase>("connect");
  const [errorCode, setErrorCode] = useState<BuyOnBaseErrorCode | null>(null);
  const [usdcReady, setUsdcReady] = useState(false);
  const [lifiOpen, setLifiOpen] = useState(false);
  const [showStep2, setShowStep2] = useState(false);

  const amountFieldId = useId();
  const networkFieldId = useId();

  const selectedNetwork = BUY_NETWORK_OPTIONS.find((n) => n.id === networkId) ?? BUY_NETWORK_OPTIONS[0];
  const chainId = selectedNetwork.chainId;

  const usdAmount = Number(amount.replace(",", "."));
  const amountValid = Number.isFinite(usdAmount) && usdAmount > 0;
  const overLimit = amountValid && usdAmount > SALE.maxPerBuyUsd;

  const quote = useMemo(
    () => (amountValid ? quoteBuy(soldPpl ?? 0, Math.min(usdAmount, SALE.maxPerBuyUsd)) : null),
    [amountValid, soldPpl, usdAmount],
  );

  const lifiVariant =
    networkId === "base" && stable === "USDT" ? "base-usdt" : "cross-chain";

  const refreshUsdcReady = useCallback(async () => {
    if (!connected || !beneficiary || !amountValid || overLimit) {
      setUsdcReady(false);
      return;
    }
    try {
      const balance = await readBaseUsdcBalance(beneficiary as Address);
      setUsdcReady(balance >= usdToUsdc6(Math.min(usdAmount, SALE.maxPerBuyUsd)));
    } catch {
      setUsdcReady(false);
    }
  }, [amountValid, beneficiary, connected, overLimit, usdAmount]);

  useEffect(() => {
    void refreshUsdcReady();
  }, [refreshUsdcReady, networkId, stable]);

  useEffect(() => {
    if (!saleOpen || !connected) return;
    try {
      const raw = localStorage.getItem(PENDING_BUY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { amount?: string; networkId?: BuyNetworkId; stable?: SaleStableSymbol };
        if (parsed.amount) setAmount(parsed.amount);
        if (parsed.networkId) setNetworkId(parsed.networkId);
        if (parsed.stable) setStable(parsed.stable);
      }
    } catch {
      /* ignore */
    }
  }, [connected, saleOpen]);

  const persistPending = useCallback(() => {
    try {
      localStorage.setItem(
        PENDING_BUY_KEY,
        JSON.stringify({ amount, networkId, stable }),
      );
    } catch {
      /* ignore */
    }
  }, [amount, networkId, stable]);

  const clearPending = useCallback(() => {
    try {
      localStorage.removeItem(PENDING_BUY_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const runHubBuy = useCallback(async () => {
    if (!signer || !beneficiary || !quote || quote.pplOut <= 0) return;
    setPhase("pending");
    setErrorCode(null);
    try {
      const writer =
        signer.kind === "embedded" && signer.privateKey
          ? sessionToBaseWriter({ address: signer.address, privateKey: signer.privateKey })
          : activeSignerToBaseWriter(signer);
      const hash = await executeHubBuyWithUsdc({
        writer,
        beneficiary: beneficiary as Address,
        usdAmount: Math.min(usdAmount, SALE.maxPerBuyUsd),
        minPplOut: pplToMinOut(quote.pplOut),
      });
      const receipt = await waitForBaseReceipt(hash);
      if (receipt.status !== "success") throw new Error("tx_failed");
      clearPending();
      setShowStep2(false);
      setPhase("success");
    } catch (err) {
      setPhase("error");
      setErrorCode(mapBuyError(err));
    }
  }, [beneficiary, clearPending, quote, signer, usdAmount]);

  const onBridgeComplete = useCallback(() => {
    setLifiOpen(false);
    setShowStep2(true);
    void refreshUsdcReady().then(() => {
      void runHubBuy();
    });
  }, [refreshUsdcReady, runHubBuy]);

  const onCtaClick = useCallback(() => {
    if (!saleOpen) return;
    if (!connected) {
      openWalletModal();
      return;
    }
    if (!amountValid || overLimit || !quote) return;

    const directUsdcOnBase = networkId === "base" && stable === "USDC";
    if (directUsdcOnBase || usdcReady) {
      void runHubBuy();
      return;
    }

    persistPending();
    setLifiOpen(true);
  }, [
    amountValid,
    connected,
    networkId,
    openWalletModal,
    overLimit,
    persistPending,
    quote,
    runHubBuy,
    saleOpen,
    stable,
    usdcReady,
  ]);

  const buttonDisabled =
    !saleOpen ||
    phase === "pending" ||
    phase === "success" ||
    (connected && (!amountValid || overLimit));

  const errorMessage =
    errorCode === "cooldown"
      ? t.form.errorCooldown
      : errorCode === "dailyLimit"
        ? t.form.errorDailyLimit
        : errorCode === "insufficient"
          ? t.form.errorInsufficient
          : errorCode === "rejected"
            ? t.form.errorRejected
            : errorCode
              ? t.form.errorGeneric
              : null;

  const rows: { label: string; value: string }[] = quote
    ? [
        { label: t.form.youGet, value: `${pplCompact(quote.pplOut, lang)} PPL` },
        { label: t.form.avgPrice, value: pricePerPpl(quote.avgPriceUsd, lang) },
        { label: t.form.priceAfter, value: pricePerPpl(quote.priceAfterUsd, lang) },
      ]
    : [];

  void hubPaymentToken(stable);

  if (!saleOpen) {
    const closed = (
      <div
        className="rounded-2xl border border-line bg-surface-2 p-6 text-center"
        data-testid={testId}
        id="buy-form"
      >
        <p className="text-lg font-bold text-ink">{t.form.closedTitle}</p>
        <p className="mt-2 text-sm text-ink-2">{t.form.closedSub}</p>
      </div>
    );
    if (variant === "bare") return closed;
    return (
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-2)] sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-ink">{t.form.title}</h2>
        {closed}
      </div>
    );
  }

  const body = (
    <div className="space-y-4" data-testid={testId} id="buy-form">
      <div>
        <label className={LABEL} htmlFor={networkFieldId}>{t.form.network}</label>
        <select
          id={networkFieldId}
          data-testid="buy-network-select"
          value={networkId}
          onChange={(event) => {
            setNetworkId(event.target.value as BuyNetworkId);
            setShowStep2(false);
            setPhase(connected ? "buy" : "connect");
          }}
          className={FIELD}
        >
          {BUY_NETWORK_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {t.form.networkNames[option.id]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={LABEL}>{t.form.stableLabel}</span>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(["USDC", "USDT"] as const).map((symbol) => (
            <button
              key={symbol}
              type="button"
              data-testid={`buy-stable-${symbol.toLowerCase()}`}
              onClick={() => {
                setStable(symbol);
                setShowStep2(false);
              }}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                stable === symbol
                  ? "border-brand bg-brand/10 text-ink"
                  : "border-line bg-surface-2 text-ink-2 hover:border-brand/40"
              }`}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor={amountFieldId}>{t.form.amountLabel}</label>
        <div className="relative">
          <input
            id={amountFieldId}
            type="number"
            inputMode="decimal"
            min={1}
            max={SALE.maxPerBuyUsd}
            step="1"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setPhase(connected ? "buy" : "connect");
              setErrorCode(null);
            }}
            className={`${FIELD} pr-16 font-mono text-base`}
          />
          <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-3">
            USD
          </span>
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

      <p className="text-xs text-ink-3">{t.form.limitsLine}</p>

      {connected ? (
        <p className="text-xs text-ink-3">
          {fillCopy(t.form.beneficiaryHint, { address: shortAddress(beneficiary) })}
        </p>
      ) : null}

      {showStep2 ? (
        <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-medium text-ink">
          {t.form.step2}
        </p>
      ) : null}

      {phase === "success" ? (
        <p className="text-sm font-medium text-value">{t.form.successMessage}</p>
      ) : null}

      <button
        type="button"
        data-testid="buy-cta"
        disabled={buttonDisabled}
        onClick={onCtaClick}
        className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
      >
        {!connected ? t.form.ctaConnect : phase === "pending" ? "…" : t.form.ctaBuy}
      </button>

      {errorMessage ? <p className="text-center text-sm text-warm">{errorMessage}</p> : null}

      <p className="text-xs leading-relaxed text-ink-3">
        {t.form.disclaimerBefore}
        <Link href="/terms" className="font-semibold text-brand hover:underline">
          {t.form.disclaimerLink}
        </Link>
        {t.form.disclaimerAfter}
      </p>

      <p className="text-xs text-ink-3">
        {t.form.sellBack}{" "}
        <Link href="#faq" className="font-semibold text-brand hover:underline">
          {t.form.sellBackLink}
        </Link>
      </p>

      {connected && beneficiary ? (
        <BuyLifiBridge
          open={lifiOpen}
          onClose={() => setLifiOpen(false)}
          variant={lifiVariant}
          recipient={beneficiary as Address}
          fromChain={chainId}
          fromToken={defaultFromToken(chainId, stable)}
          fromAmount={amountValid ? String(Math.min(usdAmount, SALE.maxPerBuyUsd)) : ""}
          onBridgeComplete={onBridgeComplete}
          testId="buy-lifi-widget"
        />
      ) : null}
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
