"use client";

import { useLanguage } from "@/context/LanguageContext";
import { GENESIS_ALLOCATIONS } from "@/lib/tokenomics";
import { tokenomicsCopy } from "@/lib/tokenomics-content";

const CX = 110;
const CY = 110;
const R = 100;

function polar(angle: number): { x: number; y: number } {
  return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
}

function slicePath(start: number, end: number): string {
  const from = polar(start);
  const to = polar(end);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${CX} ${CY} L ${from.x} ${from.y} A ${R} ${R} 0 ${large} 1 ${to.x} ${to.y} Z`;
}

/**
 * Genesis allocation of the fixed 1B PPL supply, straight from
 * `GENESIS_ALLOCATIONS` — the same data the tokenomics and litepaper charts
 * use, so the three can never disagree.
 */
export function AllocationPie() {
  const { lang } = useLanguage();
  const labels = tokenomicsCopy[lang].bucketLabels;

  // Slices start at twelve o'clock and run clockwise; each one begins where
  // the previous ended, so the angles come from a reduce rather than a cursor.
  const slices = GENESIS_ALLOCATIONS.reduce<
    ((typeof GENESIS_ALLOCATIONS)[number] & { start: number; end: number })[]
  >((acc, bucket) => {
    const start = acc.length ? acc[acc.length - 1].end : -Math.PI / 2;
    acc.push({ ...bucket, start, end: start + (bucket.pct / 100) * Math.PI * 2 });
    return acc;
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 220 220"
        className="h-40 w-40 shrink-0 sm:h-44 sm:w-44"
        role="img"
        aria-label={tokenomicsCopy[lang].donutTitle}
      >
        {slices.map((slice) => (
          <path
            key={slice.id}
            d={slicePath(slice.start, slice.end)}
            fill={slice.color}
            stroke="var(--c-surface)"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <ul className="grid w-full gap-1.5">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: slice.color }}
                aria-hidden="true"
              />
              <span className="truncate">{labels[slice.id]}</span>
            </span>
            <span className="shrink-0 font-mono font-semibold text-ink">{slice.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
