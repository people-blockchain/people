"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/wallet/ConnectWalletButton";
import { ArrowDownUp } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useWallet } from "@/context/WalletContext";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { EvmSwapApp } from "@/components/swap/EvmSwapApp";
import type { PoolRow } from "@/components/swap/EvmSwapApp";
import type { AssetInfo } from "@/lib/asset-amounts";
import { swapCopy } from "@/lib/swap-content";
import { uxCopy, fill, displaySymbol } from "@/lib/ux-copy";
import { signFactoryTx } from "@/lib/ovn-sign";
import { DEFAULT_TRANSFER_FEE, networkJson } from "@/lib/network-client";
import { minAmountOutWithSlippage, quoteExactIn } from "@/lib/amm-math";
import { assetDecimals, formatPpl, formatUnits, parseUnits } from "@/lib/asset-amounts";
import {
  fractionOfBalance,
  liquidityTokenForPpl,
  priceImpactPercent,
  type SwapPool,
} from "@/lib/swap-math";
import { isHiddenAsset, visiblePools } from "@/lib/hidden-assets";
import { useAssetRegistry } from "@/hooks/useAssetRegistry";
import { AssetImage } from "@/components/ui/AssetImage";
import { Eyebrow, Chip } from "@/components/ui/primitives";

type Account = { balance: number; balances: Record<string, number> };

const SLIPPAGE_CHOICES = [50, 100, 300] as const;
const SMALL_POOL_PPL = 100;

const inputClass =
  "w-full rounded-xl border border-line bg-canvas px-3 py-3 text-lg font-semibold text-ink outline-none focus:border-brand";
const chipBtn =
  "min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink-2 hover:border-brand hover:text-ink disabled:opacity-40";

export function SwapApp({ initialPools, initialAssets }: { initialPools?: PoolRow[]; initialAssets?: AssetInfo[] } = {}) {
  if (isCosmosEvmChain()) {
    return <EvmSwapApp initialPools={initialPools} initialAssets={initialAssets} />;
  }
  return <OvnSwapApp />;
}

function OvnSwapApp() {
  const { lang } = useLanguage();
  const t = swapCopy[lang];
  const u = uxCopy[lang];
  const { session } = useWallet();
  const assets = useAssetRegistry();
  const [pools, setPools] = useState<SwapPool[]>([]);
  const [poolId, setPoolId] = useState("");
  const [pplIn, setPplIn] = useState(true);
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(100);
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [txId, setTxId] = useState("");
  const [reachable, setReachable] = useState(true);
  // Liquidity
  const [liqPpl, setLiqPpl] = useState("");
  const [newTokenId, setNewTokenId] = useState("");
  const [newTokenAmount, setNewTokenAmount] = useState("");
  const [newPplAmount, setNewPplAmount] = useState("");

  const selected = pools.find((p) => p.poolId === poolId) ?? pools[0] ?? null;
  const tokenId = selected?.tokenAssetId ?? "";
  const tokenAsset = assets[tokenId];
  const decimals = assetDecimals(tokenAsset);
  const tokenSymbol = tokenId ? displaySymbol(tokenId, tokenAsset?.symbol, u) : "—";
  const pplWholeOnly = !selected?.nativeScale;

  const load = useCallback(async () => {
    try {
      const next = await networkJson<SwapPool[]>("liquidity-pools");
      // Deepest pool (largest PPL reserve) first, so it is also the default choice.
      setPools(
        Array.isArray(next)
          ? visiblePools(next.filter((p) => p.status !== "inactive")).sort((a, b) => b.nativeReserve - a.nativeReserve)
          : []
      );
      setReachable(true);
    } catch {
      setReachable(false);
    }
  }, []);

  const loadAccount = useCallback(async () => {
    if (!session) return setAccount(null);
    try {
      const body = await networkJson<{ balance?: number; balances?: Record<string, number> }>(`address/${session.address}`);
      setAccount({ balance: Number(body.balance ?? 0), balances: body.balances ?? {} });
    } catch {
      setAccount(null);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const pplBalance = account?.balance ?? 0;
  const tokenBalance = account?.balances?.[tokenId] ?? 0;
  const fee = DEFAULT_TRANSFER_FEE;

  // ---- Swap quote -------------------------------------------------------
  const parsed = useMemo(() => {
    const text = amountText.trim();
    if (!text) return { kind: "empty" as const };
    if (pplIn) {
      if (pplWholeOnly) {
        if (!/^\d+$/.test(text)) return { kind: "whole" as const };
        const n = Number(text);
        return n > 0 && Number.isSafeInteger(n) ? { kind: "ok" as const, amountIn: n } : { kind: "empty" as const };
      }
      const units = parseUnits(text, 6);
      return units && units > 0 ? { kind: "ok" as const, amountIn: units / 1_000_000 } : { kind: "invalid" as const };
    }
    const units = parseUnits(text, decimals);
    return units && units > 0 ? { kind: "ok" as const, amountIn: units } : { kind: "invalid" as const };
  }, [amountText, pplIn, pplWholeOnly, decimals]);

  const quote = useMemo(() => {
    if (!selected || parsed.kind !== "ok") return null;
    const scale = selected.nativeScale ?? 1;
    try {
      const reserveIn = pplIn ? selected.nativeReserve : selected.tokenReserve;
      const reserveOut = pplIn ? selected.tokenReserve : selected.nativeReserve;
      const q = quoteExactIn(reserveIn, reserveOut, parsed.amountIn, selected.feeBps, pplIn ? scale : 1, pplIn ? 1 : scale);
      const minOut = minAmountOutWithSlippage(q.amountOut, slippageBps, pplIn ? 1 : scale);
      return { ...q, minOut, impact: priceImpactPercent(reserveIn, parsed.amountIn) };
    } catch {
      return null;
    }
  }, [selected, parsed, pplIn, slippageBps]);

  const fmtIn = (v: number) => (pplIn ? formatPpl(v) : formatUnits(v, decimals));
  const fmtOut = (v: number) => (pplIn ? formatUnits(v, decimals) : formatPpl(v));
  const symIn = pplIn ? "PPL" : tokenSymbol;
  const symOut = pplIn ? tokenSymbol : "PPL";
  const spotTokensPerPpl = selected && selected.nativeReserve > 0 ? selected.tokenReserve / selected.nativeReserve : 0;

  // ---- Button state -----------------------------------------------------
  let blocker: string | null = null;
  if (!selected) blocker = t.poolsEmpty;
  else if (parsed.kind === "empty") blocker = u.enterAmount;
  else if (parsed.kind === "whole") blocker = u.wholePpl;
  else if (parsed.kind === "invalid") blocker = u.enterAmount;
  else if (session && account) {
    if (pplIn && parsed.amountIn > pplBalance) blocker = fill(u.insufficient, { symbol: "PPL" });
    else if (pplIn && parsed.amountIn + fee > pplBalance) blocker = u.noFeeBalance;
    else if (!pplIn && parsed.amountIn > tokenBalance) blocker = fill(u.insufficient, { symbol: tokenSymbol });
    else if (!pplIn && pplBalance < fee) blocker = u.noFeeBalance;
  }
  if (!blocker && parsed.kind === "ok" && selected) {
    if (!quote || quote.amountOut <= 0) blocker = u.tooSmall;
    else if (quote.amountOut >= (pplIn ? selected.tokenReserve : selected.nativeReserve)) blocker = u.tooBig;
  }

  const setFraction = (fraction: number) => {
    if (!account) return;
    setAmountText(
      fractionOfBalance({
        fraction,
        pplIn,
        pplBalance,
        tokenBalance,
        decimals,
        fee,
        pplWholeOnly,
      })
    );
  };

  // ---- Submit -----------------------------------------------------------
  const send = async (type: "ammSwap" | "ammAddLiquidity" | "ammCreatePool", payload: Record<string, unknown>, nativeAmount: number) => {
    if (!session) return;
    setBusy(true);
    setError("");
    setTxId("");
    try {
      const live = await networkJson<{ nonce?: number }>(`address/${session.address}`);
      const health = await networkJson<{ chainId: string }>("health");
      const signed = signFactoryTx(session.privateKey, {
        chainId: health.chainId,
        id: `${session.address}-${type}-${Date.now()}`,
        from: session.address,
        to: "amm",
        amount: nativeAmount,
        fee,
        nonce: Number(live.nonce ?? 0),
        timestamp: Date.now(),
        type,
        payload,
      });
      const result = await networkJson<{ accepted?: boolean; error?: string }>("tx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (result.accepted === false) throw new Error(result.error ?? t.error);
      setTxId(signed.id);
      setAmountText("");
      setLiqPpl("");
      await Promise.all([load(), loadAccount()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  };

  const doSwap = () => {
    if (!selected || parsed.kind !== "ok" || !quote) return;
    void send(
      "ammSwap",
      {
        tokenAssetId: selected.tokenAssetId,
        tokenIn: pplIn ? "ppl" : selected.tokenAssetId,
        tokenOut: pplIn ? selected.tokenAssetId : "ppl",
        amountIn: parsed.amountIn,
        minAmountOut: quote.minOut,
      },
      parsed.amountIn
    );
  };

  // ---- Add liquidity (PPL drives, token amount follows the pool price) ---
  const liq = useMemo(() => {
    const text = liqPpl.trim();
    if (!selected || !text) return { state: "empty" as const };
    if (pplWholeOnly && !/^\d+$/.test(text)) return { state: "whole" as const };
    const ppl = pplWholeOnly ? Number(text) : (parseUnits(text, 6) ?? 0) / 1_000_000;
    if (!(ppl > 0)) return { state: "empty" as const };
    const token = liquidityTokenForPpl(selected, ppl);
    if (token <= 0) return { state: "small" as const };
    return { state: "ok" as const, ppl, token };
  }, [liqPpl, selected, pplWholeOnly]);
  let liqBlocker: string | null = null;
  if (liq.state === "empty") liqBlocker = u.enterAmount;
  else if (liq.state === "whole") liqBlocker = u.wholePpl;
  else if (liq.state === "small") liqBlocker = u.tooSmall;
  else if (session && account) {
    if (liq.ppl + fee > pplBalance) liqBlocker = fill(u.insufficient, { symbol: "PPL" });
    else if (liq.token > tokenBalance) liqBlocker = fill(u.insufficient, { symbol: tokenSymbol });
  }
  const liqMax = () => {
    if (!selected || !account) return;
    const byPpl = Math.max(0, pplBalance - fee);
    const byToken = selected.tokenReserve > 0 ? (tokenBalance * selected.nativeReserve) / selected.tokenReserve : 0;
    const max = Math.min(byPpl, byToken);
    setLiqPpl(pplWholeOnly ? String(Math.floor(max)) : formatPpl(Math.floor(max * 1e6) / 1e6).replace(/,/g, ""));
  };

  // ---- Create pool -----------------------------------------------------
  const heldTokens = Object.entries(account?.balances ?? {}).filter(([id, v]) => id !== "ppl" && Number(v) > 0 && !isHiddenAsset(id));
  const newAsset = assets[newTokenId];
  const newDecimals = assetDecimals(newAsset);
  const newSymbol = newTokenId ? displaySymbol(newTokenId, newAsset?.symbol, u) : "";
  const newPoolExists = pools.some((p) => p.tokenAssetId === newTokenId);
  const create = useMemo(() => {
    const tokenUnits = newTokenAmount.trim() ? parseUnits(newTokenAmount, newDecimals) : null;
    const pplText = newPplAmount.trim();
    const pplWhole = /^\d+$/.test(pplText);
    return { tokenUnits, ppl: pplWhole ? Number(pplText) : null, pplFraction: Boolean(pplText) && !pplWhole };
  }, [newTokenAmount, newPplAmount, newDecimals]);
  let createBlocker: string | null = null;
  if (!newTokenId) createBlocker = u.chooseToken;
  else if (newPoolExists) createBlocker = u.poolExists;
  else if (create.pplFraction) createBlocker = u.wholePplCreate;
  else if (!create.tokenUnits || !create.ppl) createBlocker = u.enterAmount;
  else if (create.ppl + fee > pplBalance) createBlocker = fill(u.insufficient, { symbol: "PPL" });
  else if (create.tokenUnits > (account?.balances?.[newTokenId] ?? 0)) createBlocker = fill(u.insufficient, { symbol: newSymbol });
  else if (Math.sqrt(create.tokenUnits * create.ppl) <= 1000) createBlocker = u.tooSmall;

  const connectBtn = <ConnectWalletButton />;

  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Eyebrow>{t.tag}</Eyebrow>
      <h1 className="mt-3 text-h2 font-bold tracking-tight text-ink">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-lead text-ink-2">{t.lead}</p>
      {!reachable ? <p className="mt-4 text-sm text-warm">{t.noRpc}</p> : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="surface-elevated rounded-3xl p-6">
          <h2 className="text-lg font-semibold">{t.poolsTitle}</h2>
          {pools.length === 0 ? <p className="mt-3 text-sm text-ink-3">{t.poolsEmpty}</p> : null}
          <ul className="mt-4 space-y-3">
            {pools.map((pool) => {
              const a = assets[pool.tokenAssetId];
              const sym = displaySymbol(pool.tokenAssetId, a?.symbol, u);
              const active = (selected?.poolId ?? "") === pool.poolId;
              return (
                <li key={pool.poolId}>
                  <button
                    type="button"
                    onClick={() => {
                      setPoolId(pool.poolId);
                      setAmountText("");
                      setLiqPpl("");
                    }}
                    aria-pressed={active}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${active ? "border-brand bg-surface-2" : "border-line hover:border-line-strong"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="flex -space-x-2">
                          <AssetImage assetId={pool.tokenAssetId} src={a?.creationMetadata?.image} name={sym} className="h-7 w-7" testBadgeLabel={u.testTokenNote} />
                          <AssetImage assetId="ppl" name="PPL" className="h-7 w-7" />
                        </span>
                        {sym} / PPL
                      </span>
                      {pool.locked ? <Chip tone="warm">{t.locked}</Chip> : null}
                    </div>
                    <p className="mt-1 text-ink-3">
                      {u.poolDepth}: {formatUnits(pool.tokenReserve, assetDecimals(a))} {sym} · {formatPpl(pool.nativeReserve)} PPL
                    </p>
                    {session && pool.lpBalances?.[session.address] ? (
                      <p className="mt-1 text-ink-3">
                        {t.lpShares}: {pool.lpBalances[session.address]}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="surface-elevated rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t.swapTitle}</h2>
            {selected ? (
              <span className="text-xs text-ink-3" data-testid="swap-pool-depth">
                {u.poolDepth}: {formatUnits(selected.tokenReserve, decimals)} {tokenSymbol} · {formatPpl(selected.nativeReserve)} PPL
              </span>
            ) : null}
          </div>
          {selected && selected.nativeReserve < SMALL_POOL_PPL ? (
            <p className="mt-2 text-xs text-warm">{u.smallPool}</p>
          ) : null}

          {/* You pay */}
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-ink-3">
              <span>{t.tokenIn}</span>
              {session ? (
                <span data-testid="swap-balance">
                  {fill(u.balance, { amount: `${account ? fmtIn(pplIn ? pplBalance : tokenBalance) : "…"} ${symIn}` })}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <AssetImage assetId={pplIn ? "ppl" : tokenId} src={pplIn ? undefined : tokenAsset?.creationMetadata?.image} name={symIn} className="h-9 w-9" testBadgeLabel={u.testTokenNote} />
              <input
                aria-label={t.amountIn}
                data-testid="swap-amount"
                className={inputClass}
                value={amountText}
                placeholder="0"
                onChange={(e) => setAmountText(e.target.value.replace(",", "."))}
                inputMode={pplIn && pplWholeOnly ? "numeric" : "decimal"}
                autoComplete="off"
              />
              <span className="shrink-0 text-sm font-semibold text-ink">{symIn}</span>
            </div>
            {session ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {[0.25, 0.5, 0.75].map((f) => (
                  <button key={f} type="button" className={chipBtn} disabled={!account || busy} onClick={() => setFraction(f)}>
                    {f * 100}%
                  </button>
                ))}
                <button type="button" className={chipBtn} disabled={!account || busy} onClick={() => setFraction(1)}>
                  {u.max}
                </button>
              </div>
            ) : null}
            {pplIn ? <p className="mt-2 text-xs text-ink-3">{fill(u.maxHint, { fee: formatPpl(fee) })}{pplWholeOnly ? ` ${u.wholePpl}` : ""}</p> : null}
          </div>

          <div className="relative z-10 -my-3 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setPplIn((v) => !v);
                setAmountText("");
              }}
              aria-label={u.flip}
              title={u.flip}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-canvas text-ink-2 hover:border-brand hover:text-ink"
            >
              <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* You receive */}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2 text-sm text-ink-3">
              <span>{t.tokenOut}</span>
              {session && account ? <span>{fill(u.balance, { amount: `${fmtOut(pplIn ? tokenBalance : pplBalance)} ${symOut}` })}</span> : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <AssetImage assetId={pplIn ? tokenId : "ppl"} src={pplIn ? tokenAsset?.creationMetadata?.image : undefined} name={symOut} className="h-9 w-9" testBadgeLabel={u.testTokenNote} />
              <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink" data-testid="swap-out">
                {quote ? fmtOut(quote.amountOut) : "0"}
              </span>
              <span className="shrink-0 text-sm font-semibold text-ink">{symOut}</span>
            </div>
          </div>

          {/* Details */}
          <dl className="mt-4 space-y-1.5 text-sm">
            {selected ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">{u.rate}</dt>
                <dd className="text-right" data-testid="swap-rate">
                  1 PPL = {formatUnits(Math.floor(spotTokensPerPpl), decimals, 6)} {tokenSymbol}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{u.receiveApprox}</dt>
              <dd className="text-right font-semibold">{quote ? `${fmtOut(quote.amountOut)} ${symOut}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{u.minReceived}</dt>
              <dd className="text-right">{quote ? `${fmtOut(quote.minOut)} ${symOut}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{u.priceImpact}</dt>
              <dd
                data-testid="swap-impact"
                className={`text-right font-semibold ${quote && quote.impact > 15 ? "text-red-500" : quote && quote.impact > 5 ? "text-amber-500" : ""}`}
              >
                {quote ? `${quote.impact < 0.01 ? "<0.01" : quote.impact.toFixed(2)}%` : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{u.networkFee}</dt>
              <dd className="text-right">{formatPpl(fee)} PPL</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">{u.poolFee}</dt>
              <dd className="text-right">{quote && parsed.kind === "ok" ? `${fmtIn((parsed.amountIn * (selected?.feeBps ?? 30)) / 10_000)} ${symIn}` : "—"}</dd>
            </div>
          </dl>
          {quote && quote.impact > 15 ? (
            <p role="alert" className="mt-3 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-500">{u.impactDanger}</p>
          ) : quote && quote.impact > 5 ? (
            <p className="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">{u.impactWarn}</p>
          ) : null}

          <div className="mt-4">
            <p className="text-sm text-ink-3">{u.slippage}</p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={u.slippage}>
              {SLIPPAGE_CHOICES.map((bps) => (
                <button
                  key={bps}
                  type="button"
                  role="radio"
                  aria-checked={slippageBps === bps}
                  onClick={() => setSlippageBps(bps)}
                  className={`min-h-9 rounded-lg border px-3 text-sm font-semibold ${slippageBps === bps ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-3">{u.slippageHint}</p>
          </div>

          <div className="mt-5">
            {!session ? (
              connectBtn
            ) : (
              <button
                type="button"
                data-testid="swap-submit"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-4 text-base font-semibold text-brand-ink disabled:opacity-50"
                onClick={doSwap}
                disabled={busy || Boolean(blocker) || !account}
              >
                {busy ? u.sending : blocker ?? u.swapNow}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add liquidity to the selected pool */}
      {selected ? (
        <div className="surface-elevated mt-8 rounded-3xl p-6">
          <h2 className="text-lg font-semibold">{fill(u.addTo, { pair: `${tokenSymbol} / PPL` })}</h2>
          <p className="mt-1 text-sm text-ink-3">{u.addHint}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="flex justify-between gap-2">
                <span>{t.nativeAmount}</span>
                {session && account ? <span className="text-ink-3">{fill(u.balance, { amount: `${formatPpl(pplBalance)} PPL` })}</span> : null}
              </span>
              <span className="relative mt-1 block">
                <input
                  className="w-full rounded-lg border border-line bg-canvas py-2 pl-3 pr-16"
                  value={liqPpl}
                  placeholder="0"
                  onChange={(e) => setLiqPpl(e.target.value.replace(",", "."))}
                  inputMode={pplWholeOnly ? "numeric" : "decimal"}
                />
                {session ? (
                  <button type="button" className="absolute inset-y-0 right-3 text-xs font-semibold text-brand disabled:opacity-40" disabled={!account} onClick={liqMax}>
                    {u.max}
                  </button>
                ) : null}
              </span>
              {pplWholeOnly ? <span className="mt-1 block text-xs text-ink-3">{u.wholePpl}</span> : null}
            </label>
            <div className="text-sm">
              <span className="flex justify-between gap-2">
                <span>{t.tokenAmount}</span>
                {session && account ? <span className="text-ink-3">{fill(u.balance, { amount: `${formatUnits(tokenBalance, decimals)} ${tokenSymbol}` })}</span> : null}
              </span>
              <p className="mt-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-semibold">
                {liq.state === "ok" ? formatUnits(liq.token, decimals) : "0"} {tokenSymbol}
              </p>
            </div>
          </div>
          <div className="mt-4">
            {!session ? (
              connectBtn
            ) : (
              <button
                type="button"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
                onClick={() => liq.state === "ok" && void send("ammAddLiquidity", { tokenAssetId: selected.tokenAssetId, tokenAmount: liq.token, nativeAmount: liq.ppl }, liq.ppl)}
                disabled={busy || Boolean(liqBlocker) || !account}
              >
                {liqBlocker ?? t.addSubmit}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Create a new pool */}
      <div className="surface-elevated mt-8 rounded-3xl p-6">
        <h2 className="text-lg font-semibold">{u.createTitle}</h2>
        <p className="mt-1 text-sm text-ink-3">{u.createHint}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            {t.tokenId}
            <select
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
              value={newTokenId}
              onChange={(e) => {
                setNewTokenId(e.target.value);
                setNewTokenAmount("");
              }}
            >
              <option value="">{u.chooseToken}</option>
              {heldTokens.map(([id]) => (
                <option key={id} value={id}>
                  {displaySymbol(id, assets[id]?.symbol, u)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="flex justify-between gap-2">
              <span>{t.tokenAmount}</span>
              {newTokenId && account ? (
                <span className="flex items-center gap-2 text-ink-3">
                  {fill(u.balance, { amount: formatUnits(account.balances[newTokenId] ?? 0, newDecimals) })}
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand"
                    onClick={() => setNewTokenAmount(fractionOfBalance({ fraction: 1, pplIn: false, pplBalance, tokenBalance: account.balances[newTokenId] ?? 0, decimals: newDecimals, fee, pplWholeOnly: true }))}
                  >
                    {u.max}
                  </button>
                </span>
              ) : null}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
              value={newTokenAmount}
              placeholder="0"
              onChange={(e) => setNewTokenAmount(e.target.value.replace(",", "."))}
              inputMode="decimal"
            />
          </label>
          <label className="text-sm">
            <span className="flex justify-between gap-2">
              <span>{t.nativeAmount}</span>
              {account ? (
                <span className="flex items-center gap-2 text-ink-3">
                  {fill(u.balance, { amount: `${formatPpl(pplBalance)} PPL` })}
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand"
                    onClick={() => setNewPplAmount(fractionOfBalance({ fraction: 1, pplIn: true, pplBalance, tokenBalance: 0, decimals: 6, fee, pplWholeOnly: true }))}
                  >
                    {u.max}
                  </button>
                </span>
              ) : null}
            </span>
            <input
              className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2"
              value={newPplAmount}
              placeholder="10"
              onChange={(e) => setNewPplAmount(e.target.value.replace(",", "."))}
              onBlur={() => {
                // The node ignores pools with fractional PPL: round to whole PPL.
                const v = Number(newPplAmount.replace(",", "."));
                if (newPplAmount.trim() && Number.isFinite(v) && !Number.isInteger(v)) setNewPplAmount(String(Math.max(1, Math.round(v))));
              }}
              inputMode="numeric"
            />
            <span className="mt-1 block text-xs text-ink-3">{u.wholePplCreate}</span>
          </label>
        </div>
        {create.tokenUnits && create.ppl ? (
          <p className="mt-3 text-sm text-ink-2">
            {fill(u.startPrice, { n: formatUnits(Math.floor(create.tokenUnits / create.ppl), newDecimals, 6), symbol: newSymbol })}
          </p>
        ) : null}
        <div className="mt-4">
          {!session ? (
            connectBtn
          ) : (
            <button
              type="button"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
              onClick={() =>
                create.tokenUnits && create.ppl &&
                void send("ammCreatePool", { tokenAssetId: newTokenId, tokenAmount: create.tokenUnits, nativeAmount: create.ppl, minLpOut: 0 }, create.ppl)
              }
              disabled={busy || Boolean(createBlocker) || !account}
            >
              {createBlocker ?? t.createSubmit}
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-3">{t.helpK} {t.helpLock}</p>
      {txId ? (
        <p className="mt-6 text-sm text-value">
          {t.success}{" "}
          <Link href={`/explorer/tx/${encodeURIComponent(txId)}`} className="underline">
            {txId}
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-warm">{error}</p> : null}
    </section>
  );
}
