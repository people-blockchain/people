"use client";

import { useMemo } from "react";
import { CIRCULATING_HORIZON_MONTHS, circulatingSeries, formatPpl } from "@/lib/tokenomics";

export function CirculatingSupplyChart({ axisLabel }: { axisLabel: string }) {
  const series = useMemo(() => circulatingSeries(CIRCULATING_HORIZON_MONTHS), []);
  const max = series[series.length - 1]?.ppl ?? 1;
  const w = 640;
  const h = 200;
  const pad = { l: 8, r: 8, t: 8, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const points = series
    .map((pt, i) => {
      const x = pad.l + (i / CIRCULATING_HORIZON_MONTHS) * innerW;
      const y = pad.t + innerH - (pt.ppl / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  const end = series[series.length - 1];

  return (
    <figure className="w-full overflow-hidden rounded-2xl border border-line bg-surface p-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={axisLabel}>
        <polyline fill="none" stroke="var(--c-brand)" strokeWidth="2.5" points={points} />
        <polyline
          fill="var(--c-brand)"
          fillOpacity={0.12}
          stroke="none"
          points={`${pad.l},${pad.t + innerH} ${points} ${pad.l + innerW},${pad.t + innerH}`}
        />
        <text x={pad.l} y={h - 4} className="fill-[var(--c-ink-3)] text-[10px]">
          0
        </text>
        <text x={pad.l + innerW - 28} y={h - 4} className="fill-[var(--c-ink-3)] text-[10px]">
          {CIRCULATING_HORIZON_MONTHS} mo
        </text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span>{axisLabel}</span>
        <span className="font-mono text-ink-2">
          ~{formatPpl(end?.ppl ?? 0)} PPL at month {CIRCULATING_HORIZON_MONTHS}
        </span>
      </figcaption>
    </figure>
  );
}
