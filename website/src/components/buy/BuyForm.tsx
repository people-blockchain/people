"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";

import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { useExternalWalletOptional } from "@/context/ExternalWalletContext";
import { useWalletModal } from "@/context/WalletModalContext";
import { buyCopy } from "@/lib/buy-content";
import { decideAutoBuy, deliveredFromRoute, type AutoBuyTrigger } from "@/lib/sale/autoBuy";
import { hubPaymentToken } from "@/lib/sale/bridge";
import {
  MIN_GAS_ETH,
  SALE,
  SALE_CHAIN,
  SALE_OPENING_DATE_UTC,
  basescanTxUrl,
  saleTokenAddress,
  type SaleStableSymbol,
} from "@/lib/sale/config";
import { parseUsd6Amount, parseUsdAmount } from "@/lib/sale/amount";
import { formatPplExact } from "@/lib/asset-amounts";
import { quoteBuy } from "@/lib/sale/curve";
import { fillCopy, intlLocale, ppl, pricePerPpl, usd } from "@/lib/sale/format";
import type { SalePhase } from "@/lib/sale/sale-state";
import { useBuyPpl } from "@/lib/sale/useBuyPpl";
import { FAUCET_AMOUNT_USDC, useTestFaucet } from "@/lib/sale/useTestFaucet";
import { useUsdcDelivery } from "@/lib/sale/useUsdcDelivery";
import { supportUrlWithLocale } from "@/lib/support-url";
import { SOCIAL_PROFILES } from "@/lib/social-profiles";

import { BridgeErrorBoundary } from "./BridgeErrorBoundary";
import { Num } from "./Num";
import { FootnoteRef } from "./SmallPrint";

const BuyLifiBridge = dynamic(
  () => import("./BuyLifiBridge").then((mod) => mod.BuyLifiBridge),
  { ssr: false, loading: () => <div className="min-h-[420px] rounded-2xl border border-line bg-surface-2" /> },
);

const FIELD =
  "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

const LABEL = "block text-xs font-semibold uppercase tracking-[0.08em] text-ink-3";

type PayMode = "base" | "bridge";

const TELEGRAM = SOCIAL_PROFILES.find((p) => p.id === "telegram")?.href ?? "https://t.me/people_blockchain";

/**
 * Single buy widget for `/buy`. State is local; curve parameters come from config.
 * Real purchases run only when `phase === "open"`.
 */
export function BuyForm({
  soldPpl,
  phase = "closed",
  hubAcceptsUsdt = false,
  variant = "panel",
  testId,
}: {
  soldPpl: number | null;
  phase?: SalePhase;
  hubAcceptsUsdt?: boolean;
  variant?: "panel" | "bare";
  testId?: string;
}) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const { session } = useWallet();
  const externalWallet = useExternalWalletOptional();
  const { openWalletModal } = useWalletModal();
  const { status, buy, reset, busy } = useBuyPpl();
  const faucet = useTestFaucet();

  const evmAddress = (session?.address ?? externalWallet?.signer?.address ?? "") as Address | "";
  const connected = Boolean(evmAddress);
  const provider = externalWallet?.signer?.provider;
  const walletChainId = externalWallet?.chainId ?? null;
  const open = phase === "open";

  const [amount, setAmount] = useState(String(SALE.maxPerBuyUsd / 5));
  const [stable, setStable] = useState<SaleStableSymbol>("USDC");
  const [payMode, setPayMode] = useState<PayMode>("base");
  const [conversionReady, setConversionReady] = useState(false);
  const [bridgeIssue, setBridgeIssue] = useState<"rejected" | "failed" | null>(null);
  const [bridgeTx, setBridgeTx] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);
  const [balances, setBalances] = useState<{ token: number; eth: number } | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const [autoBuy, setAutoBuy] = useState<{ kind: "received" | "belowMin"; amountUsd: number } | null>(null);

  const amountFieldId = useId();
  const stableFieldId = useId();

  const parsed = parseUsdAmount(amount);
  const usdAmount = parsed.ok ? parsed.value : 0;
  const belowMin = parsed.ok && usdAmount < SALE.minPerBuyUsd;
  const overLimit = parsed.ok && usdAmount > SALE.maxPerBuyUsd;
  const quoteOk = parsed.ok && !belowMin && !overLimit;

  const quote = useMemo(
    () => (quoteOk ? quoteBuy(soldPpl ?? 0, usdAmount) : null),
    [quoteOk, soldPpl, usdAmount],
  );

  const directUsdt = hubAcceptsUsdt;
  // The LI.FI widget only delivers real USDC to Base mainnet, so it is hidden when the sale runs on test tokens.
  const bridgeAvailable = !SALE_CHAIN.testTokens;
  const swapsUsdt = bridgeAvailable && stable === "USDT" && !directUsdt;
  const showBuyCta = payMode === "base" && !swapsUsdt ? true : conversionReady;
  const payToken = hubPaymentToken(stable, directUsdt) as Address | null;
  const tokenSymbol = payToken !== null && payToken === saleTokenAddress("USDC") ? "USDC" : "USDT";
  const canSign = Boolean(provider);
  const wrongNetwork = open && connected && canSign && walletChainId !== null && walletChainId !== SALE_CHAIN.id;

  // Balances on the sale chain — read only while the sale is open and a wallet is connected.
  useEffect(() => {
    if (!open || !evmAddress || !payToken) {
      setBalances(null);
      return;
    }
    let active = true;
    const client = createPublicClient({ chain: SALE_CHAIN.viemChain, transport: http(SALE_CHAIN.rpcUrl) });
    void Promise.all([
      client.readContract({ address: payToken, abi: erc20Abi, functionName: "balanceOf", args: [evmAddress] }),
      client.getBalance({ address: evmAddress }),
    ])
      .then(([token, eth]) => {
        if (active) setBalances({ token: Number(formatUnits(token, 6)), eth: Number(formatUnits(eth, 18)) });
      })
      .catch(() => active && setBalances(null));
    return () => {
      active = false;
    };
  }, [open, evmAddress, payToken, balanceTick]);

  useEffect(() => {
    if (status.step === "done") setBalanceTick((n) => n + 1);
  }, [status.step]);

  useEffect(() => {
    if (faucet.status.step === "done") setBalanceTick((n) => n + 1);
  }, [faucet.status.step]);

  const insufficientToken = open && balances !== null && quoteOk && balances.token < usdAmount;
  const needsGas = open && balances !== null && balances.eth < MIN_GAS_ETH;

  const buttonDisabled =
    !open ||
    !payToken ||
    (connected && (!quoteOk || !showBuyCta || busy || !canSign || insufficientToken || needsGas));

  const onFaucetClick = useCallback(async () => {
    if (!connected) {
      openWalletModal();
      return;
    }
    if (!provider) return;
    await faucet.mint({ provider, account: evmAddress as Address });
  }, [connected, openWalletModal, provider, faucet, evmAddress]);

  const onBuyClick = useCallback(async () => {
    if (!connected) {
      openWalletModal();
      return;
    }
    if (!provider || !parsed.ok || !payToken) return;
    setSwitchFailed(false);
    const amountIn = parseUsd6Amount(amount, 2);
    await buy({
      provider,
      account: evmAddress as Address,
      token: payToken,
      amountUsd: parsed.value,
      ...(amountIn !== null ? { amountIn } : {}),
    });
  }, [connected, openWalletModal, provider, parsed, buy, evmAddress, payToken, amount]);

  // Once the bridged/swapped USDC has arrived on Base the form is only prepared: the amount is filled
  // in and the main button turns into "Buy on <chain>". Nothing is ever signed or sent without a click
  // on that button (no auto-approve, no auto-buy).
  const triggeredRef = useRef<Set<string>>(new Set());
  const latestRef = useRef({ open, busy, provider, evmAddress });
  useEffect(() => {
    latestRef.current = { open, busy, provider, evmAddress };
  });

  const handleDelivery = useCallback(
    (trigger: AutoBuyTrigger) => {
      const cur = latestRef.current;
      if (!cur.open || !cur.provider || !cur.evmAddress) return;
      const decision = decideAutoBuy({
        chainKey: SALE_CHAIN.key,
        trigger,
        minUsd: SALE.minPerBuyUsd,
        maxUsd: SALE.maxPerBuyUsd,
        alreadyTriggered: triggeredRef.current,
        busy: cur.busy,
      });
      if (decision.action === "none") {
        if (decision.reason === "below-min" && decision.amountUsd !== undefined) {
          setAutoBuy({ kind: "belowMin", amountUsd: decision.amountUsd });
        }
        return;
      }
      triggeredRef.current.add(decision.key);
      setAmount(decision.amountUsd.toFixed(2));
      setBridgeIssue(null);
      setConversionReady(true);
      setBalanceTick((n) => n + 1);
      setAutoBuy({ kind: "received", amountUsd: decision.amountUsd });
    },
    [],
  );

  const onBridgeComplete = useCallback(
    (route?: unknown) => {
      setBridgeIssue(null);
      setConversionReady(true);
      setBalanceTick((n) => n + 1);
      handleDelivery({ source: "event", ...deliveredFromRoute(route) });
    },
    [handleDelivery],
  );

  useUsdcDelivery({
    enabled: open && bridgeAvailable && connected && canSign && (payMode === "bridge" || swapsUsdt),
    owner: evmAddress,
    rpcUrl: SALE_CHAIN.rpcUrl,
    onDelivery: (delivery) => handleDelivery({ source: "balance", ...delivery }),
  });

  const onSwitchToBase = async () => {
    const ok = await externalWallet?.switchToBase();
    setSwitchFailed(!ok);
  };

  const resetConversion = () => {
    setConversionReady(false);
    setBridgeIssue(null);
    setAutoBuy(null);
  };

  const supportHref = supportUrlWithLocale(process.env.NEXT_PUBLIC_SUPPORT_TG_URL?.trim() || TELEGRAM, lang);
  const dateText = SALE_OPENING_DATE_UTC
    ? new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(
        new Date(SALE_OPENING_DATE_UTC),
      )
    : null;

  const closedLine = (
    <div className="space-y-1.5 text-sm text-ink-2" data-testid="buy-closed-note">
      <p>{dateText ? fillCopy(t.form.openingDate, { date: dateText }) : t.form.openingDateTba}</p>
      <p>{t.form.closedNoteAddress}</p>
      <a href={TELEGRAM} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">
        {t.form.notifyMe}
      </a>
    </div>
  );

  const rows: { label: string; value: string }[] = quote
    ? [
        { label: t.form.avgPrice, value: pricePerPpl(quote.avgPriceUsd, lang) },
        { label: t.form.priceAfter, value: pricePerPpl(quote.priceAfterUsd, lang) },
      ]
    : [];

  const termsLinkEl = (
    <Link href="/terms" className="underline">
      {t.form.termsLink}
    </Link>
  );
  const supportEl = (
    <a href={supportHref} target="_blank" rel="noopener noreferrer" className="underline">
      {t.form.supportLink}
    </a>
  );
  const withNode = (template: string, key: string, node: React.ReactNode) => {
    const [before, after = ""] = template.split(`{${key}}`);
    return (
      <>
        {before}
        {node}
        {after}
      </>
    );
  };

  const bridgeWidget = (variant: "cross-chain" | "base-usdt", id: string) =>
    !open ? (
      <p className="text-sm text-ink-2" data-testid="buy-bridge-closed">{t.form.bridgeClosed}</p>
    ) : !connected ? (
      <div className="space-y-2">
        <p className="text-sm text-ink-2">{t.form.bridgeNeedWallet}</p>
        <p className="text-xs text-ink-3">{t.form.solanaHint}</p>
        <button
          type="button"
          onClick={openWalletModal}
          className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink"
        >
          {t.form.cta}
        </button>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-xs text-ink-3">{t.form.bridgeSteps}</p>
        <p className="text-xs text-ink-3">{t.form.bridgeFundsHint}</p>
        <div aria-live="polite">
          {bridgeIssue === "rejected" ? <p className="text-sm text-warm">{t.form.txRejected}</p> : null}
          {bridgeIssue === "failed" ? <p className="text-sm text-warm">{t.form.bridgeFailed}</p> : null}
          {bridgeTx ? (
            <p className="text-sm text-ink-2">
              {withNode(
                t.form.bridgeStatus,
                "link",
                <a href={bridgeTx} target="_blank" rel="noopener noreferrer" className="underline">
                  scan.li.fi
                </a>,
              )}
            </p>
          ) : null}
        </div>
        <BridgeErrorBoundary message={t.form.bridgeFailed} retryLabel={t.form.tryAgain}>
          <BuyLifiBridge
            variant={variant}
            lang={lang}
            toAddressName={t.form.bridgeToAddressName}
            recipient={evmAddress as Address}
            onBridgeComplete={onBridgeComplete}
            onBridgeFailed={setBridgeIssue}
            onBridgeProgress={(info) => setBridgeTx(info.txLink ?? null)}
            testId={id}
          />
        </BridgeErrorBoundary>
      </div>
    );

  const statusLine = (() => {
    switch (status.step) {
      case "switching":
        return t.form.stepSwitch;
      case "approving":
        return fillCopy(t.form.stepApprove, { amount: usd(usdAmount, lang), token: tokenSymbol });
      case "buying":
        return t.form.stepBuy;
      case "pending":
        return t.form.stepPending;
      case "done":
        return fillCopy(t.form.success, { ppl: formatPplExact(status.pplOut) });
      case "error":
        return status.reason === "txFailed"
          ? fillCopy(t.form.txFailed, { reason: status.detail ?? "" })
          : status.reason === "txRejected"
            ? t.form.txRejected
            : status.reason === "switchRejected"
              ? t.form.switchRejected
              : status.reason === "priceMoved"
                ? t.form.priceMoved
                : t.form.limitHit;
      default:
        return "";
    }
  })();

  const autoBuyLine = !autoBuy
    ? ""
    : autoBuy.kind === "belowMin"
      ? fillCopy(t.form.autoBuyBelowMin, { amount: usd(autoBuy.amountUsd, lang), min: usd(SALE.minPerBuyUsd, lang) })
      : ["idle", "switching", "approving", "buying", "pending"].includes(status.step)
        ? fillCopy(t.form.autoBuyReceived, { amount: usd(autoBuy.amountUsd, lang) })
        : "";

  // After a delivery the user must click this button to start approve + buy; it is never triggered automatically.
  const awaitingAutoBuyClick = autoBuy?.kind === "received" && status.step === "idle";
  const ctaLabel = !open
    ? t.form.ctaClosed
    : !connected
      ? t.form.cta
      : awaitingAutoBuyClick
        ? fillCopy(t.form.autoBuyCta, { chain: SALE_CHAIN.name })
        : t.form.ctaConnected;

  const body = (
    <div className="space-y-4" data-testid={testId}>
      {SALE_CHAIN.testnet ? (
        <p
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs font-semibold text-ink"
          data-testid="buy-testnet-note"
        >
          {t.form.testnetNote}
        </p>
      ) : null}
      {SALE_CHAIN.faucet ? (
        <div
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-ink"
          data-testid="buy-test-mode"
        >
          <p className="font-semibold" data-testid="buy-test-mode-note">
            {t.form.testModeNote}
          </p>
          <button
            type="button"
            data-testid="buy-faucet"
            disabled={faucet.busy || (connected && !canSign)}
            onClick={() => void onFaucetClick()}
            className="min-h-11 rounded-lg border border-line bg-surface px-4 text-sm font-semibold transition hover:border-brand/40 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {t.form.faucetButton}
          </button>
          <div aria-live="polite" data-testid="buy-faucet-status">
            {!connected ? <p>{t.form.faucetNeedWallet}</p> : null}
            {faucet.status.step === "switching" ? <p>{t.form.faucetSwitching}</p> : null}
            {faucet.status.step === "minting" ? <p>{t.form.faucetMinting}</p> : null}
            {faucet.status.step === "pending" ? <p>{t.form.faucetPending}</p> : null}
            {faucet.status.step === "done" ? (
              <p>
                {fillCopy(t.form.faucetDone, { amount: String(FAUCET_AMOUNT_USDC) })}{" "}
                <a
                  href={basescanTxUrl(faucet.status.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand underline"
                >
                  {t.form.viewTx}
                </a>
              </p>
            ) : null}
            {faucet.status.step === "error" ? (
              <p className="text-warm" role="alert">
                {faucet.status.reason === "notConfigured"
                  ? t.form.faucetNotConfigured
                  : faucet.status.reason === "switchRejected"
                    ? t.form.switchRejected
                    : faucet.status.reason === "txRejected"
                      ? t.form.txRejected
                      : fillCopy(t.form.faucetFailed, { reason: faucet.status.detail ?? "" })}{" "}
                <button type="button" onClick={faucet.reset} className="min-h-11 font-semibold text-brand underline">
                  {t.form.tryAgain}
                </button>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div>
        <span className={LABEL}>{t.form.payModeLabel}</span>
        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {((bridgeAvailable ? ["base", "bridge"] : ["base"]) as PayMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`pay-mode-${mode}`}
              onClick={() => {
                setPayMode(mode);
                resetConversion();
              }}
              className={`min-h-11 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition ${
                payMode === mode
                  ? "border-brand bg-brand/10 text-ink"
                  : "border-line bg-surface-2 text-ink-2 hover:border-brand/40"
              }`}
            >
              {mode === "base" ? t.form.payOnBase : t.form.payFromOther}
            </button>
          ))}
        </div>
        {payMode === "bridge" && bridgeAvailable ? (
          <>
            <p className="mt-1.5 text-xs text-ink-3">{t.form.bridgeHint}</p>
            <p className="mt-1 text-xs text-ink-3" data-testid="pay-from-networks">{t.form.payFromNetworks}</p>
          </>
        ) : (
          <p className="mt-1.5 text-xs text-ink-3">{t.form.basePayHint}</p>
        )}
      </div>

      {payMode === "bridge" && bridgeAvailable ? (
        <div className="space-y-3" data-testid="buy-bridge-panel">
          <p className="text-sm font-semibold text-ink">{t.form.bridgePanelTitle}</p>
          {bridgeWidget("cross-chain", "buy-lifi-widget")}
          {conversionReady ? (
            <p className="rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 text-sm font-medium text-ink">
              {t.form.bridgeReady}
            </p>
          ) : null}
        </div>
      ) : null}

      {payMode === "base" && swapsUsdt ? (
        <div className="space-y-3" data-testid="buy-usdt-swap-panel">
          <p className="text-sm font-semibold text-ink">{t.form.usdtSwapTitle}</p>
          {bridgeWidget("base-usdt", "buy-lifi-widget-usdt")}
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
              type="text"
              inputMode="decimal"
              autoComplete="off"
              pattern="[0-9]*[.,]?[0-9]{0,2}"
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
            {fillCopy(t.form.amountHint, { min: usd(SALE.minPerBuyUsd, lang), max: usd(SALE.maxPerBuyUsd, lang) })}
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
            {bridgeAvailable || directUsdt ? <option value="USDT">{directUsdt ? t.form.stableUsdtDirectOption : t.form.stableUsdtOption}</option> : null}
          </select>
          {swapsUsdt ? (
            <p data-testid="buy-usdt-note" className="mt-1.5 text-xs text-ink-3">
              {t.form.usdtConvertHint}
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-2 p-4">
        {!open ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{t.form.previewTitle}</p>
        ) : null}
        {quote ? (
          <div className="space-y-2">
            <p className="font-mono text-base font-bold text-brand" data-testid="buy-quote-line">
              <QuoteLine
                template={t.form.quoteLine}
                pay={`${usd(usdAmount, lang)} ${stable}`}
                pplText={ppl(quote.pplOut, lang)}
              />
            </p>
            <dl className="space-y-1.5">
              {rows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-sm text-ink-2">{row.label}</dt>
                  <dd className="font-mono text-sm font-semibold text-ink">
                    <Num>{row.value}</Num>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-ink-3">{t.form.estimate}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-2" role="status">
            {overLimit
              ? fillCopy(t.form.overLimit, { amount: usd(SALE.maxPerBuyUsd, lang) })
              : belowMin
                ? fillCopy(t.form.belowMinAmount, { amount: usd(SALE.minPerBuyUsd, lang) })
                : !parsed.ok && parsed.reason === "invalid"
                  ? t.form.invalidAmount
                  : t.form.belowMin}
          </p>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-3">
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.limitPerBuy, { min: usd(SALE.minPerBuyUsd, lang), max: usd(SALE.maxPerBuyUsd, lang) })}
        </li>
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.limitPerDay, { amount: usd(SALE.maxPerDayUsd, lang) })}
        </li>
        <li className="rounded-full border border-line px-2.5 py-1">
          {fillCopy(t.form.cooldown, { seconds: SALE.cooldownSeconds })}
        </li>
      </ul>

      {open && connected && !canSign ? (
        <p className="text-sm text-warm" role="status">{t.form.embeddedNoBase}</p>
      ) : null}

      {wrongNetwork ? (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-ink" role="alert" data-testid="wrong-network">
          <p>{switchFailed ? t.form.switchRejected : t.form.wrongNetwork}</p>
          <button
            type="button"
            onClick={() => void onSwitchToBase()}
            className="min-h-11 rounded-lg border border-line bg-surface px-4 font-semibold"
          >
            {t.form.switchToBase}
          </button>
        </div>
      ) : null}

      {open && balances ? (
        <p className="text-xs text-ink-3" data-testid="buy-balance">
          {fillCopy(t.form.balanceLine, {
            balance: balances.token.toLocaleString(intlLocale(lang), { maximumFractionDigits: 2 }),
            token: tokenSymbol,
            eth: balances.eth.toLocaleString(intlLocale(lang), { maximumFractionDigits: 5 }),
          })}
        </p>
      ) : null}
      {insufficientToken && balances ? (
        <p className="text-sm text-warm" role="alert">
          {fillCopy(t.form.notEnoughToken, {
            token: tokenSymbol,
            have: usd(balances.token, lang),
            need: usd(usdAmount, lang),
          })}
        </p>
      ) : null}
      {needsGas ? <p className="text-sm text-warm" role="alert">{t.form.needGas}</p> : null}

      {showBuyCta ? (
        <button
          type="button"
          data-testid="buy-cta"
          data-autobuy-ready={awaitingAutoBuyClick ? "true" : undefined}
          disabled={buttonDisabled}
          onClick={() => void onBuyClick()}
          className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-brand px-6 py-3.5 text-base font-semibold text-brand-ink shadow-[0_14px_36px_-16px_rgba(3,105,161,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
        >
          {ctaLabel}
        </button>
      ) : (
        <p className="text-center text-sm text-ink-2">
          {swapsUsdt ? t.form.usdtSwapAwaiting : t.form.bridgeAwaiting}
        </p>
      )}

      <div aria-live="polite" className="text-sm text-ink" data-testid="buy-status">
        {autoBuyLine ? (
          <p className="mb-1 font-semibold" data-testid="buy-autobuy-status">
            {autoBuyLine}
          </p>
        ) : null}
        {statusLine}
        {status.step === "done" ? (
          <>
            {" "}
            <a
              href={basescanTxUrl(status.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand underline"
            >
              {t.form.viewTx}
            </a>
          </>
        ) : null}
        {status.step === "error" ? (
          <button type="button" onClick={reset} className="ms-2 min-h-11 font-semibold text-brand underline">
            {t.form.tryAgain}
          </button>
        ) : null}
      </div>

      {!open ? closedLine : null}

      <div
        role="note"
        data-testid="buy-risk"
        className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-ink"
      >
        <p>
          <strong>{t.form.riskTitle}.</strong> {t.form.riskBody}
          <FootnoteRef marker="**" />
        </p>
        <details className="mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{t.form.riskMoreToggle}</summary>
          <p className="pb-1">{t.form.riskMore}</p>
        </details>
      </div>

      <p className="text-sm text-ink-2" data-testid="buy-sale-terms">{t.form.saleTermsNote}</p>
      <p className="text-xs text-ink-3">{withNode(t.form.termsAgree, "terms", termsLinkEl)}</p>
      <p className="text-xs text-ink-3">{withNode(t.form.help, "support", supportEl)}</p>
      <p className="text-xs text-ink-3">{t.form.wallets}</p>
      <p className="text-xs text-ink-3">{t.form.noWalletHint}</p>
      <p className="text-xs text-ink-3" data-testid="buy-sellback-terms">{t.form.sellBackTerms}</p>

      <details data-testid="buy-fees" className="text-xs text-ink-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink-2">{t.form.feesTitle}</summary>
        <div className="space-y-2 pb-1">
          <p>{t.form.feesBody}</p>
          <p>{t.form.timingBody}</p>
          <p>{t.form.getUsdc}</p>
          <p>{t.form.glossaryBase}</p>
        </div>
      </details>
      <p className="text-xs text-ink-3">{t.form.phishing}</p>
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

/** "You pay {pay} → you get about {ppl} PPL" with the numbers kept left-to-right. */
function QuoteLine({ template, pay, pplText }: { template: string; pay: string; pplText: string }) {
  const parts = template.split(/(\{pay\}|\{ppl\})/);
  return (
    <>
      {parts.map((part, i) =>
        part === "{pay}" ? (
          <Num key={i}>{pay}</Num>
        ) : part === "{ppl}" ? (
          <Num key={i}>{pplText}</Num>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
