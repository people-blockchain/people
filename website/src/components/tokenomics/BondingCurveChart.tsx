"use client";

import { useMemo } from "react";

import { BONDING_CURVE, bondingCurveSamples } from "@/lib/tokenomics";

export function BondingCurveChart() {
  const samples = useMemo(() => bondingCurveSamples(32), []);
  const w = 400;
  const h = 120;
  const pad = 12;
  const { priceStartUsdt, priceEndUsdt } = BONDING_CURVE;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const span = priceEndUsdt - priceStartUsdt;

  const points = samples
    .map((s) => {
      const x = pad + s.soldPct * innerW;
      const y = pad + innerH - ((s.priceUsdt - priceStartUsdt) / span) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-28 w-full max-w-md" role="img" aria-hidden="true">
      <polyline fill="none" stroke="var(--c-value)" strokeWidth="2" points={points} />
      <text x={pad} y={h - 2} className="fill-[var(--c-ink-3)] text-[9px]">
        ${priceStartUsdt} start
      </text>
      <text x={w - pad - 40} y={pad + 10} className="fill-[var(--c-ink-3)] text-[9px]">
        ${priceEndUsdt} cap
      </text>
    </svg>
  );
}
