"use client";

import Link from "next/link";
import { useId, useMemo } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { content } from "@/lib/content";
import { CURVE } from "@/lib/sale/config";
import { graduation, soldPplForRaisedUsd, spotPriceUsd } from "@/lib/sale/curve";
import { SALE } from "@/lib/sale/config";
import { fillCopy, formatMonths, pplCompact, pplCompactChart, pricePerPpl, usdCompact } from "@/lib/sale/format";
import type { SalePhase } from "@/lib/sale/sale-state";

const EXAMPLE_RAISE_USD = CURVE.milestoneRaisesUsd[0];

const W = 320;
const H = 168;
const PAD = { top: 16, right: 20, bottom: 36, left: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function plotX(soldPpl: number, maxSold: number): number {
  return PAD.left + (soldPpl / maxSold) * PLOT_W;
}

function plotY(priceUsd: number, maxPrice: number): number {
  return PAD.top + PLOT_H - (priceUsd / maxPrice) * PLOT_H;
}

function chartMarkerLabel(priceUsd: number, soldPpl: number, lang: string): string {
  return `${pricePerPpl(priceUsd, lang)} · ${pplCompactChart(soldPpl, lang)}`;
}

function markerLabelLayout(
  key: "start" | "mid" | "grad",
  cx: number,
  cy: number,
): { x: number; y: number; textAnchor: "start" | "middle" | "end" } {
  const inset = 4;
  const innerLeft = PAD.left + inset;
  const innerRight = W - PAD.right - inset;
  const innerTop = PAD.top + inset;
  const innerBottom = H - PAD.bottom - inset;

  if (key === "start") {
    return {
      x: Math.min(Math.max(cx, innerLeft), innerRight - 48),
      y: Math.min(cy + 14, innerBottom - 2),
      textAnchor: "start",
    };
  }
  if (key === "grad") {
    return {
      x: Math.max(Math.min(cx, innerRight), innerLeft + 48),
      y: Math.min(cy + 14, innerBottom - 2),
      textAnchor: "end",
    };
  }
  return {
    x: Math.min(Math.max(cx, innerLeft + 24), innerRight - 24),
    y: Math.max(cy - 8, innerTop + 8),
    textAnchor: "middle",
  };
}

/** Short explainer under the buy form: no manual pricing, curve math, reserve. */
export function BuyWhyPriceRises({ phase = "closed" }: { phase?: SalePhase }) {
  const { lang } = useLanguage();
  const copy = buyCopy[lang];
  const t = copy.whyPriceRises;
  const gradientId = useId();

  const example = useMemo(() => {
    const grad = graduation();
    const midSold = soldPplForRaisedUsd(EXAMPLE_RAISE_USD);
    return {
      startPrice: pricePerPpl(CURVE.startPriceUsd, lang),
      midSold: pplCompact(midSold, lang),
      midPrice: pricePerPpl(spotPriceUsd(midSold), lang),
      midRaised: usdCompact(EXAMPLE_RAISE_USD, lang),
      gradPrice: pricePerPpl(grad.priceUsd, lang),
      gradRaised: usdCompact(grad.raisedUsd, lang),
    };
  }, [lang]);

  const chart = useMemo(() => {
    const grad = graduation();
    const midSold = soldPplForRaisedUsd(EXAMPLE_RAISE_USD);
    const maxSold = grad.soldPpl * 1.02;
    const maxPrice = CURVE.ceilingPriceUsd;
    const samples = 48;
    const path = Array.from({ length: samples + 1 }, (_, i) => {
      const sold = (maxSold * i) / samples;
      return `${plotX(sold, maxSold).toFixed(1)},${plotY(spotPriceUsd(sold), maxPrice).toFixed(1)}`;
    }).join(" ");

    const markers = [
      { sold: 0, price: CURVE.startPriceUsd, key: "start" as const },
      { sold: midSold, price: spotPriceUsd(midSold), key: "mid" as const },
      { sold: grad.soldPpl, price: grad.priceUsd, key: "grad" as const },
    ];

    return { path, markers, maxSold, maxPrice };
  }, []);

  return (
    <aside
      data-testid="buy-why-price-rises"
      className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5"
      aria-labelledby="buy-why-price-title"
    >
      <h2 id="buy-why-price-title" className="text-sm font-semibold text-ink sm:text-base">
        {t.title}
      </h2>
      <p className="mt-3 text-sm font-medium leading-relaxed text-ink">{t.noManualLead}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.mechanism}</p>
      {phase !== "open" ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-3" data-testid="contract-pending-note">
          {t.contractPendingNote}
        </p>
      ) : null}
      <h3 className="mt-4 text-sm font-semibold text-ink">{t.plainTitle}</h3>
      <ul className="mt-2 list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-ink-2" data-testid="plain-words">
        {t.plain.map((line) => (
          <li key={line}>
            {line.includes("{howItWorks}")
              ? (() => {
                  const [before, after = ""] = line.split("{howItWorks}");
                  return (
                    <>
                      {before}
                      <Link href="/how-it-works" className="underline">
                        {content[lang].nav.links.find((link) => link.href === "/how-it-works")?.label ?? "How it works"}
                      </Link>
                      {after}
                    </>
                  );
                })()
              : line}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">
        {fillCopy(t.example, example)}
      </p>

      <figure className="mt-4" data-testid="buy-why-curve-chart" dir="ltr">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full max-w-sm text-brand"
          role="img"
          aria-label={t.chartAria}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke="var(--c-line-strong)"
            strokeWidth="1"
          />
          <line
            x1={PAD.left}
            y1={PAD.top}
            x2={PAD.left}
            y2={H - PAD.bottom}
            stroke="var(--c-line-strong)"
            strokeWidth="1"
          />

          <text
            x={(PAD.left + W - PAD.right) / 2}
            y={H - 6}
            textAnchor="middle"
            className="fill-[var(--c-ink-3)] text-[9px] font-medium"
          >
            {t.chartAxisSold}
          </text>
          <text
            x={10}
            y={(PAD.top + H - PAD.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 10 ${(PAD.top + H - PAD.bottom) / 2})`}
            className="fill-[var(--c-ink-3)] text-[9px] font-medium"
          >
            {t.chartAxisPrice}
          </text>

          <path d={`M ${chart.path} L ${plotX(chart.maxSold, chart.maxSold)} ${H - PAD.bottom} L ${PAD.left} ${H - PAD.bottom} Z`} fill={`url(#${gradientId})`} />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={chart.path}
          />

          {chart.markers.map((m) => {
            const cx = plotX(m.sold, chart.maxSold);
            const cy = plotY(m.price, chart.maxPrice);
            const label = chartMarkerLabel(m.price, m.sold, lang);
            const { x, y, textAnchor } = markerLabelLayout(m.key, cx, cy);
            return (
              <g key={m.key}>
                <circle cx={cx} cy={cy} r="4" fill="var(--c-surface)" stroke="currentColor" strokeWidth="2" />
                <text
                  x={x}
                  y={y}
                  textAnchor={textAnchor}
                  className="fill-[var(--c-ink-2)] text-[8px] font-mono font-semibold"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <p className="mt-3 text-xs leading-relaxed text-ink-3">{fillCopy(copy.transparency.fundsBody, {
          liquidityShare: `${SALE.liquiditySharePct}%`,
          multisigShare: `${SALE.multisigSharePct}%`,
          lockPeriod: formatMonths(SALE.lpLockMonths, lang),
        })}</p>

      <Link
        href="#curve"
        className="mt-4 inline-flex text-sm font-semibold text-brand underline-offset-2 hover:underline"
      >
        {t.explainerLink}
      </Link>
    </aside>
  );
}
