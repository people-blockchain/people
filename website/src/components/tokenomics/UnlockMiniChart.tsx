"use client";

import type { AllocationId } from "@/lib/tokenomics";
import { CIRCULATING_HORIZON_MONTHS, unlockSeriesForBucket } from "@/lib/tokenomics";

export function UnlockMiniChart({
  id,
  color,
  label,
}: {
  id: AllocationId;
  color: string;
  label: string;
}) {
  const series = unlockSeriesForBucket(id, CIRCULATING_HORIZON_MONTHS);
  const max = Math.max(...series, 1);
  const w = 280;
  const h = 72;
  const points = series
    .map((v, i) => {
      const x = (i / CIRCULATING_HORIZON_MONTHS) * w;
      const y = h - (v / max) * (h - 4);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <figure className="w-full" aria-label={label}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" preserveAspectRatio="none" role="img">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          points={points}
        />
        <polyline
          fill={`${color}22`}
          stroke="none"
          points={`0,${h} ${points} ${w},${h}`}
        />
      </svg>
    </figure>
  );
}
