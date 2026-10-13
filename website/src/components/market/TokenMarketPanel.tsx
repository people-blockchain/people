"use client";

import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { marketPanelCopy } from "@/lib/market-panel-copy";
import { formatPpl } from "@/lib/asset-amounts";
import { aggregateCandles, CHART_INTERVALS, CHART_INTERVAL_MS, volumeSince, type ChartInterval, type MarketTrade } from "@/lib/market-chart";
import { Eyebrow, Chip } from "@/components/ui/primitives";
import { MarketChart } from "@/components/market/MarketChart";

type MarketApiResponse =
  | { hasMarket: false }
  | {
      hasMarket: true;
      migrated: boolean;
      priceNative: number;
      marketCapNative: number;
      liquidityNative: number;
      progressPercent: number;
      totalSupply: number;
      decimals: number;
      trades: MarketTrade[];
      fetchedAt: number;
    };

const POLL_MS = 15_000;
const DAY_MS = 24 * 60 * 60_000;

function formatPriceNative(value: number): string {
  if (!(value > 0)) return "—";
  const decimals = value >= 1 ? 4 : value >= 0.0001 ? 6 : 9;
  const fixed = value.toFixed(decimals);
  return fixed.replace(/0+$/, "").replace(/\.$/, "");
}

export function TokenMarketPanel({ tokenAddress, symbol, className = "" }: { tokenAddress: `0x${string}`; symbol?: string; className?: string }) {
  const { lang } = useLanguage();
  const c = marketPanelCopy[lang] ?? marketPanelCopy.en;
  const [data, setData] = useState<MarketApiResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [interval, setInterval_] = useState<ChartInterval>("1h");
  const [mode, setMode] = useState<"candles" | "line">("candles");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/evm/market/${tokenAddress}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`status_${res.status}`);
        const body = (await res.json()) as MarketApiResponse;
        if (controller.signal.aborted) return;
        setData(body);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, POLL_MS);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [tokenAddress, refresh]);

  const trades = useMemo(() => (data?.hasMarket ? data.trades : []), [data]);
  const candles = useMemo(() => aggregateCandles(trades, CHART_INTERVAL_MS[interval]), [trades, interval]);
  const volume24h = useMemo(() => (data?.hasMarket ? volumeSince(trades, data.fetchedAt - DAY_MS) : 0), [trades, data]);

  function reload() {
    setLoading(true);
    setError(false);
    setRefresh((v) => v + 1);
  }

  return (
    <section className={`rounded-2xl border border-line bg-surface p-6 ${className}`} aria-label={c.tag}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow tone="brand">
          {c.tag}
          {symbol ? ` · ${symbol}` : ""}
        </Eyebrow>
        {data?.hasMarket && data.migrated ? (
          <span title={c.migratedHint}>
            <Chip tone="value">{c.migrated}</Chip>
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink-3">{c.loading}</p>
      ) : error || !data ? (
        <div className="mt-6">
          <p role="alert" className="text-sm text-warm">
            {c.error}
          </p>
          <button type="button" onClick={reload} className="mt-2 text-sm text-brand">
            {c.retry}
          </button>
        </div>
      ) : !data.hasMarket ? (
        <p className="mt-6 text-sm text-ink-3">{c.empty}</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [c.price, `${formatPriceNative(data.priceNative)} PPL`],
              [c.marketCap, `${formatPpl(data.marketCapNative)} PPL`],
              [c.volume24h, `${formatPpl(volume24h)} PPL`],
              [c.liquidity, `${formatPpl(data.liquidityNative)} PPL`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-canvas p-4">
                <p className="text-sm text-ink-3">{label}</p>
                <p className="mt-1 break-words text-lg font-bold">{value}</p>
              </div>
            ))}
          </div>

          {!data.migrated ? (
            <div className="mt-6">
              <div
                className="h-4 overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(data.progressPercent)}
                aria-label={c.progressLabel}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--c-warm),var(--c-brand))] transition-[width] duration-1000"
                  style={{ width: `${data.progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-ink-3">{c.progressLabel}</span>
                <span className="font-mono font-semibold text-ink">{Math.round(data.progressPercent)}%</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">{c.progressHint}</p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label={c.candles}>
              {(["candles", "line"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${mode === m ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                >
                  {m === "candles" ? c.candles : c.line}
                </button>
              ))}
            </div>
            <div className="flex gap-2" role="radiogroup" aria-label={c.interval}>
              {CHART_INTERVALS.map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={interval === i}
                  onClick={() => setInterval_(i)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${interval === i ? "border-brand bg-brand text-brand-ink" : "border-line text-ink-2 hover:border-line-strong"}`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
            {candles.length > 0 ? <MarketChart candles={candles} mode={mode} /> : <p className="py-16 text-center text-sm text-ink-3">{c.noTrades}</p>}
          </div>

          <p className="mt-4 text-xs text-ink-3">{c.disclaimer}</p>
          <p className="mt-1 text-xs text-ink-3">{c.updated}: {new Date(data.fetchedAt).toLocaleTimeString(lang)}</p>
        </>
      )}
    </section>
  );
}
