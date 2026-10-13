"use client";

import { useCallback, useMemo, useState } from "react";
import type { AllocationId } from "@/lib/tokenomics";
import { GENESIS_ALLOCATIONS, formatPpl } from "@/lib/tokenomics";
import type { TokenomicsCopy } from "@/lib/tokenomics-content";
import { UnlockMiniChart } from "./UnlockMiniChart";

const R = 88;
const CX = 120;
const CY = 120;

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

type Slice = {
  id: AllocationId;
  pct: number;
  amountPpl: number;
  color: string;
  start: number;
  end: number;
};

export function AllocationDonut({ copy }: { copy: TokenomicsCopy }) {
  const [active, setActive] = useState<AllocationId>("community");
  const [hover, setHover] = useState<AllocationId | null>(null);

  const slices = useMemo(() => {
    return GENESIS_ALLOCATIONS.reduce<{ slices: Slice[]; angle: number }>(
      (acc, b) => {
        const span = (b.pct / 100) * Math.PI * 2;
        acc.slices.push({
          id: b.id,
          pct: b.pct,
          amountPpl: b.amountPpl,
          color: b.color,
          start: acc.angle,
          end: acc.angle + span,
        });
        acc.angle += span;
        return acc;
      },
      { slices: [], angle: -Math.PI / 2 },
    ).slices;
  }, []);

  const focused = hover ?? active;
  const focusSlice = slices.find((s) => s.id === focused) ?? slices[0];

  const onSelect = useCallback((id: AllocationId) => {
    setActive(id);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className="relative mx-auto w-full max-w-[280px]">
        <svg viewBox="0 0 240 240" className="w-full touch-manipulation" role="img" aria-label={copy.donutTitle}>
          {slices.map((s) => {
            const isOn = s.id === focused;
            const mid = (s.start + s.end) / 2;
            const offset = isOn ? 10 : 0;
            const ox = Math.cos(mid) * offset;
            const oy = Math.sin(mid) * offset;
            return (
              <path
                key={s.id}
                d={describeArc(CX + ox, CY + oy, R, s.start, s.end)}
                fill={s.color}
                stroke="var(--c-canvas, #0b0d12)"
                strokeWidth={isOn ? 2 : 1}
                className="cursor-pointer transition-[d,opacity,transform] duration-200 ease-out"
                style={{ opacity: focused && !isOn ? 0.45 : 1 }}
                onMouseEnter={() => setHover(s.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.id)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect(s.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
              />
            );
          })}
        </svg>
        <p className="mt-2 text-center text-xs text-ink-3">{copy.legendHint}</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {slices.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  focused === s.id ? "border-brand bg-brand/10 text-brand" : "border-line text-ink-2 hover:border-brand/50"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {copy.bucketLabels[s.id]}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="text-lg font-semibold text-ink">{copy.bucketLabels[focusSlice.id]}</h3>
        <p className="mt-2 text-sm text-ink-2">{copy.bucketNotes[focusSlice.id]}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-3">{copy.shareLabel}</dt>
            <dd className="font-mono text-xl font-semibold text-ink">{focusSlice.pct}%</dd>
          </div>
          <div>
            <dt className="text-ink-3">{copy.amountLabel}</dt>
            <dd className="font-mono text-xl font-semibold text-brand">
              {formatPpl(focusSlice.amountPpl)} PPL
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">{copy.unlockChartLabel}</p>
        <UnlockMiniChart id={focusSlice.id} color={focusSlice.color} label={copy.unlockChartLabel} />
      </div>
    </div>
  );
}
