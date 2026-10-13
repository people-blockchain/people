"use client";

import type { Candle } from "@/lib/market-chart";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_X = 8;
const PAD_Y = 16;

function scaleY(value: number, min: number, max: number): number {
  const span = max - min;
  if (!(span > 0)) return HEIGHT / 2;
  return PAD_Y + (HEIGHT - PAD_Y * 2) * (1 - (value - min) / span);
}

export function MarketChart({ candles, mode }: { candles: Candle[]; mode: "candles" | "line" }) {
  if (candles.length === 0) return null;

  const prices = candles.flatMap((c) => [c.h, c.l]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const innerW = WIDTH - PAD_X * 2;
  const slot = innerW / candles.length;

  if (mode === "line") {
    const points = candles
      .map((c, i) => `${PAD_X + slot * (i + 0.5)},${scaleY(c.c, min, max)}`)
      .join(" ");
    return (
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-56 w-full" role="img" aria-hidden="true">
        <polyline fill="none" stroke="var(--c-brand)" strokeWidth="2" points={points} />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-56 w-full" role="img" aria-hidden="true">
      {candles.map((c, i) => {
        const x = PAD_X + slot * (i + 0.5);
        const up = c.c >= c.o;
        const color = up ? "var(--c-value)" : "#ef4444";
        const bodyTop = scaleY(Math.max(c.o, c.c), min, max);
        const bodyBottom = scaleY(Math.min(c.o, c.c), min, max);
        const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
        const bodyWidth = Math.max(2, slot * 0.6);
        return (
          <g key={c.t}>
            <line x1={x} x2={x} y1={scaleY(c.h, min, max)} y2={scaleY(c.l, min, max)} stroke={color} strokeWidth="1" />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
