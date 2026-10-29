"use client";

import { useId, useMemo } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import { CURVE } from "@/lib/sale/config";
import { graduation, spotPriceUsd } from "@/lib/sale/curve";
import { buyCopyVars } from "@/lib/sale/buy-page";
import { fillCopy, pricePerPpl } from "@/lib/sale/format";

import { FootnoteRef } from "./SmallPrint";

const W = 320;
const H = 190;
const PAD = { top: 34, right: 16, bottom: 34, left: 16 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const SAMPLES = 48;

/**
 * The curve from the first PPL to the point where it closes, drawn from the
 * formula alone. The dot is "you are here": the start before opening, a live
 * reading afterwards, or nothing when there is no reading.
 */
function CurveMini({ position }: { position: number | null }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].ppl;
  const gradientId = useId();

  const chart = useMemo(() => {
    const end = graduation();
    const maxSold = end.soldPpl;
    const maxPrice = end.priceUsd * 1.08;
    const px = (sold: number) => PAD.left + (Math.min(sold, maxSold) / maxSold) * PLOT_W;
    const py = (price: number) => PAD.top + PLOT_H - (price / maxPrice) * PLOT_H;
    const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const sold = (maxSold * i) / SAMPLES;
      return `${px(sold).toFixed(1)},${py(spotPriceUsd(sold)).toFixed(1)}`;
    });
    return { end, maxSold, px, py, line: points.join(" ") };
  }, []);

  const startPrice = pricePerPpl(CURVE.startPriceUsd, lang);
  const endPrice = pricePerPpl(chart.end.priceUsd, lang);
  const here =
    position === null
      ? null
      : { x: chart.px(position), y: chart.py(spotPriceUsd(Math.min(position, chart.maxSold))) };
  const baseY = PAD.top + PLOT_H;

  return (
    <figure className="m-0" data-testid="buy-curve-mini" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto h-auto w-full max-w-md text-brand"
        role="img"
        aria-label={fillCopy(t.chartAria, { start: startPrice, end: endPrice })}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD.left} x2={W - PAD.right} y1={baseY} y2={baseY} stroke="var(--c-line-strong)" strokeWidth="1" />
        <path
          d={`M ${chart.line} L ${chart.px(chart.maxSold)},${baseY} L ${PAD.left},${baseY} Z`}
          fill={`url(#${gradientId})`}
        />
        <polyline
          points={chart.line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Where the curve closes */}
        <circle
          cx={chart.px(chart.maxSold)}
          cy={chart.py(chart.end.priceUsd)}
          r="4"
          fill="var(--c-surface)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <text
          x={chart.px(chart.maxSold)}
          y={chart.py(chart.end.priceUsd) - 12}
          textAnchor="end"
          className="fill-[var(--c-ink-2)] font-mono text-[11px] font-semibold"
        >
          {fillCopy(t.chartEnd, { price: endPrice })}
        </text>

        {/* Axis captions */}
        <text x={PAD.left} y={H - 10} className="fill-[var(--c-ink-3)] font-mono text-[11px]">
          {fillCopy(t.chartStart, { price: startPrice })}
        </text>
        <text x={W - PAD.right} y={H - 10} textAnchor="end" className="fill-[var(--c-ink-3)] text-[11px]">
          {`${t.axisSold} →`}
        </text>

        {here ? (
          <g data-testid="buy-curve-here">
            <circle cx={here.x} cy={here.y} r="9" fill="var(--c-warm)" fillOpacity="0.22" />
            <circle cx={here.x} cy={here.y} r="4.5" fill="var(--c-warm)" />
            {/* Early on the label sits above the dot; late on, to its left, clear of the end label. */}
            <text
              x={here.x > W * 0.6 ? here.x - 14 : Math.max(here.x, PAD.left)}
              y={here.x > W * 0.6 ? here.y + 4 : here.y - 16}
              textAnchor={here.x > W * 0.6 ? "end" : "start"}
              className="fill-[var(--c-warm)] text-[12px] font-semibold"
            >
              {t.youAreHere}
            </text>
          </g>
        ) : null}
      </svg>
    </figure>
  );
}

/** What PPL is, in three lines, next to the curve. The formula hides in a details toggle. */
export function WhatIsPpl({ position }: { position: number | null }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang].ppl;
  const vars = buyCopyVars(lang);

  return (
    <div className="mt-8 grid items-center gap-6 lg:grid-cols-2 lg:gap-10" data-testid="buy-what-is-ppl">
      <ol className="space-y-4">
        {t.lines.map((line, index) => (
          <li key={line} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 font-mono text-sm font-bold text-brand"
            >
              {index + 1}
            </span>
            <p className="text-base font-medium leading-relaxed text-ink sm:text-lg">
              {fillCopy(line, vars)}
              {index === 0 ? <FootnoteRef marker="*" /> : null}
            </p>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border border-line bg-surface p-4 shadow-[var(--elev-1)] sm:p-5">
        <CurveMini position={position} />
        <details className="mt-2 text-sm text-ink-2" data-testid="curve-formula">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">
            {t.detailsToggle}
          </summary>
          <p className="pb-1 leading-relaxed">{fillCopy(t.details, vars)}</p>
        </details>
      </div>
    </div>
  );
}
