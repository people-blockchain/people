"use client";

import { useId } from "react";

import { useLanguage } from "@/context/LanguageContext";
import { buyCopy } from "@/lib/buy-content";
import type { SaleStats } from "@/lib/sale/adapter";
import { CURVE } from "@/lib/sale/config";
import { curveEnd, milestones, spotPriceUsd } from "@/lib/sale/curve";
import { fillCopy, pplCompact, pricePerPpl, usdCompact } from "@/lib/sale/format";

const W = 640;
const H = 300;
const PAD = { top: 18, right: 18, bottom: 40, left: 54 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** x axis: PPL sold, 0 → the full curve supply. y axis: price, 0 → the ceiling. */
function x(soldPpl: number): number {
  return PAD.left + (soldPpl / CURVE.supplyPpl) * PLOT_W;
}

function y(price: number): number {
  return PAD.top + PLOT_H - (price / CURVE.ceilingPriceUsd) * PLOT_H;
}

const SAMPLES = 96;

/** The curve itself, as an SVG path. Pure geometry — no state, no data. */
function curvePath(): string {
  const points = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const sold = (CURVE.supplyPpl * i) / SAMPLES;
    return `${x(sold).toFixed(2)},${y(spotPriceUsd(sold)).toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}

/**
 * The published curve, drawn from the formula alone.
 *
 * Plotted as price against PPL sold rather than against dollars raised:
 * price is a straight line in dollars raised (`p = p0 + k·R/1e6`), which would
 * hide the exponential shape that actually governs what a buyer gets. The
 * $1M / $2M / $5M raise markers are placed at the PPL sold each one implies,
 * and the end of the curve is marked at all 100M PPL sold and the $0.25 cap,
 * so both readings are on the same picture.
 */
export function CurveChart({ stats }: { stats: SaleStats }) {
  const { lang } = useLanguage();
  const t = buyCopy[lang];
  const gradientId = useId();
  const end = curveEnd();
  const marks = [...milestones(), end];
  const here = stats.soldPpl;

  const yTicks = [0.05, 0.1, 0.15, 0.2, 0.25];
  const xTicks = [0, 25e6, 50e6, 75e6, 100e6];

  return (
    <figure className="m-0" data-testid="curve-chart" dir="ltr">
      <div className="overflow-hidden rounded-3xl border border-line bg-surface p-3 shadow-[var(--elev-1)] sm:p-5">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={t.curve.title}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c-brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--c-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid + price axis */}
          {yTicks.map((price) => (
            <g key={price}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(price)}
                y2={y(price)}
                stroke="var(--c-line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(price) + 5}
                textAnchor="end"
                className="fill-[var(--c-ink-3)] font-mono text-[13px]"
              >
                {pricePerPpl(price, lang)}
              </text>
            </g>
          ))}

          {/* PPL-sold axis */}
          {xTicks.map((sold) => (
            <text
              key={sold}
              x={x(sold)}
              y={H - PAD.bottom + 19}
              textAnchor={sold === 0 ? "start" : sold === CURVE.supplyPpl ? "end" : "middle"}
              /* The quarter ticks are unreadable once 640 units squeeze into a
                 360px column, so only the ends survive there. */
              className={`fill-[var(--c-ink-3)] font-mono text-[13px] ${
                sold === 25e6 || sold === 75e6 ? "max-sm:hidden" : ""
              }`}
            >
              {pplCompact(sold, lang)}
            </text>
          ))}
          <text
            x={W - PAD.right}
            y={H - 5}
            textAnchor="end"
            className="fill-[var(--c-ink-3)] text-[12px]"
          >
            PPL
          </text>

          {/* Area under the curve, then the curve */}
          <path
            d={`${curvePath()} L ${x(CURVE.supplyPpl)},${y(0)} L ${x(0)},${y(0)} Z`}
            fill={`url(#${gradientId})`}
          />
          <path
            d={curvePath()}
            fill="none"
            stroke="var(--c-brand)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Ceiling */}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(CURVE.ceilingPriceUsd)}
            y2={y(CURVE.ceilingPriceUsd)}
            stroke="var(--c-warm)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />

          {/* Raise markers, staggered so the labels never collide at 360px */}
          {marks.map((mark, index) => {
            const isEnd = mark.soldPpl >= CURVE.supplyPpl;
            // Labels sit to the left of their own guide line, each on its own
            // row, so three markers inside one plot never collide or clip.
            const labelY = PAD.top + 15 + index * 18;
            return (
              <g key={mark.raisedUsd}>
                <line
                  x1={x(mark.soldPpl)}
                  x2={x(mark.soldPpl)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke={isEnd ? "var(--c-value)" : "var(--c-line-strong)"}
                  strokeWidth={isEnd ? 2 : 1}
                  strokeDasharray={isEnd ? undefined : "4 4"}
                />
                <circle
                  cx={x(mark.soldPpl)}
                  cy={y(mark.priceUsd)}
                  r={isEnd ? 5.5 : 4}
                  fill={isEnd ? "var(--c-value)" : "var(--c-brand)"}
                  stroke="var(--c-surface)"
                  strokeWidth="1.5"
                />
                <text
                  x={x(mark.soldPpl) - 7}
                  y={labelY}
                  textAnchor="end"
                  /* Below sm the same figures are legible in the cards under
                     the chart, so the in-plot labels step aside. */
                  className={`font-mono text-[13px] font-semibold max-sm:hidden ${
                    isEnd ? "fill-[var(--c-value)]" : "fill-[var(--c-ink-2)]"
                  }`}
                >
                  {`${usdCompact(mark.raisedUsd, lang)} · ${pricePerPpl(mark.priceUsd, lang)}`}
                </text>
              </g>
            );
          })}

          {/* "You are here" — only with a real reading from the chain */}
          {here !== null ? (
            <g>
              <circle
                cx={x(here)}
                cy={y(spotPriceUsd(here))}
                r="8"
                fill="var(--c-warm)"
                fillOpacity="0.25"
              />
              <circle cx={x(here)} cy={y(spotPriceUsd(here))} r="4.5" fill="var(--c-warm)" />
              <text
                x={Math.min(x(here) + 10, W - PAD.right - 70)}
                y={y(spotPriceUsd(here)) - 10}
                className="fill-[var(--c-warm)] text-[13px] font-semibold"
              >
                {t.curve.youAreHere}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <figcaption className="mt-3 space-y-2 text-xs leading-relaxed text-ink-3">
        <p>
          {fillCopy(t.curve.ceilingNote, {
            ceiling: pricePerPpl(CURVE.ceilingPriceUsd, lang),
            supply: pplCompact(CURVE.supplyPpl, lang),
            endRaise: usdCompact(end.raisedUsd, lang),
          })}
        </p>
      </figcaption>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {marks.map((mark) => {
          const isEnd = mark.soldPpl >= CURVE.supplyPpl;
          return (
            <li
              key={mark.raisedUsd}
              className={`rounded-2xl border p-3 ${
                isEnd ? "border-value/45 bg-value/5" : "border-line bg-surface"
              }`}
            >
              <p className="flex items-center gap-2 font-mono text-sm font-bold text-ink">
                {fillCopy(t.curve.marker, { raised: usdCompact(mark.raisedUsd, lang) })}
                {isEnd ? (
                  <span className="rounded-full bg-value/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-value">
                    {t.curve.endTag}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-ink-2">
                {fillCopy(t.curve.markerPrice, { price: pricePerPpl(mark.priceUsd, lang) })}
              </p>
              <p className="text-xs text-ink-3">
                {fillCopy(t.curve.markerSold, { sold: pplCompact(mark.soldPpl, lang) })}
              </p>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
