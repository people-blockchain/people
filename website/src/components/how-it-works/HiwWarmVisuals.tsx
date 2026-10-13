"use client";

import { useInView } from "@/components/motion/useInView";
import { CountUpNumber } from "@/components/warm/warm-ui";
import {
  GENESIS_ALLOCATIONS,
  TOTAL_SUPPLY_PPL,
  VALIDATOR_EMISSION_SCHEDULE,
} from "@/lib/tokenomics";
import { MODEL_A_FEE_SPLIT } from "@/lib/selling-economics";
import type { HiwWarmCopy } from "@/lib/hiw-warm-content";

/* ── Supply: fixed 1B, genesis allocation donut ──────────────────────────── */

const DONUT_R = 42;
const DONUT_C = 2 * Math.PI * DONUT_R;

/**
 * Genesis allocation of the fixed one billion PPL. Values come from
 * `lib/tokenomics.ts` (`GENESIS_ALLOCATIONS`), never from copy.
 */
export function SupplyDonut({
  lang,
  copy,
}: {
  lang: string;
  copy: HiwWarmCopy["supply"];
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const total = GENESIS_ALLOCATIONS.reduce((sum, bucket) => sum + bucket.pct, 0);

  return (
    <div
      ref={ref}
      className={`fee-donut surface-elevated flex flex-col items-center gap-6 rounded-3xl border border-line p-5 sm:flex-row ${inView ? "is-on" : ""}`}
      data-testid="hiw-warm-supply-donut"
    >
      <figure className="relative h-40 w-40 shrink-0" role="img" aria-label={copy.donutLabel}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={DONUT_R} fill="none" stroke="var(--c-surface-2)" strokeWidth="12" />
          {GENESIS_ALLOCATIONS.map((bucket, index) => {
            const start =
              (GENESIS_ALLOCATIONS.slice(0, index).reduce((sum, b) => sum + b.pct, 0) / 100) * DONUT_C;
            const len = (bucket.pct / 100) * DONUT_C;
            return (
              <circle
                key={bucket.id}
                cx="50"
                cy="50"
                r={DONUT_R}
                fill="none"
                stroke={bucket.color}
                strokeWidth="12"
                className="fee-donut-seg"
                style={
                  {
                    "--seg": `${Math.max(0, len - (bucket.pct > 0 ? 0.8 : 0))}`,
                    "--gap": `${DONUT_C}`,
                    strokeDashoffset: -start,
                    transitionDelay: `${index * 140}ms`,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </svg>
        <figcaption className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="font-mono text-xl font-bold tabular-nums text-ink">
            <CountUpNumber value={TOTAL_SUPPLY_PPL} lang={lang} />
          </span>
          <span className="text-[11px] font-semibold text-ink-2">{copy.unit}</span>
        </figcaption>
      </figure>

      <ol className="w-full min-w-0 flex-1 space-y-2">
        {GENESIS_ALLOCATIONS.map((bucket, index) => (
          <li
            key={bucket.id}
            className="fee-donut-row flex items-center gap-2 text-sm"
            style={{ transitionDelay: `${index * 140}ms` }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bucket.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-ink-2">
              {copy.bucketLabels[bucket.id as keyof typeof copy.bucketLabels] ?? bucket.id}
            </span>
            <span className="font-mono tabular-nums text-ink">{bucket.pct}%</span>
          </li>
        ))}
        {total !== 100 ? (
          // The repo buckets sum to 100%; if that ever changes, say so instead of hiding it.
          <li className="pt-1 text-xs text-warm" data-testid="hiw-warm-supply-gap">
            allocation sums to {total}%
          </li>
        ) : null}
      </ol>
    </div>
  );
}

/* ── Validators: 60/50/50/40M timeline ───────────────────────────────────── */

/** Simple timeline bar of the four-year validator release, from `tokenomics.ts`. */
export function ValidatorTimeline({
  lang,
  copy,
}: {
  lang: string;
  copy: HiwWarmCopy["validators"];
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const max = Math.max(...VALIDATOR_EMISSION_SCHEDULE.map((row) => row.amountPpl));

  return (
    <div ref={ref} className={`warm-timeline ${inView ? "is-on" : ""}`} data-testid="hiw-warm-validator-timeline">
      <ol className="space-y-4">
        {VALIDATOR_EMISSION_SCHEDULE.map((row, index) => (
          <li key={row.year}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-ink">{copy.yearLabel.replace("{{n}}", String(row.year))}</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                <CountUpNumber value={row.amountPpl} lang={lang} /> {copy.unit}
              </span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
              <div
                className="warm-timeline-bar h-full rounded-full bg-[linear-gradient(90deg,var(--c-warm),var(--c-brand))]"
                style={
                  {
                    width: `${(row.amountPpl / max) * 100}%`,
                    "--d": `${index * 140}ms`,
                  } as React.CSSProperties
                }
              />
            </div>
            <p className="mt-1 text-xs text-ink-3">{copy.pctLabel.replace("{{pct}}", String(row.pctOfSupply))}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Fees: one coin splitting six ways ───────────────────────────────────── */

/** Fixed geometry for the split diagram; rows and branches share the same slots. */
const BRANCH_Y = [14, 41, 68, 95, 122, 149];
const VIEW_H = 164;

/** Per-slice colours, matching the explorer legends used elsewhere on the site. */
const SLICE_COLOR: Record<string, string> = {
  validators: "var(--c-brand)",
  community: "var(--c-value)",
  treasury: "var(--c-violet)",
  liquidity: "var(--c-warm)",
  growth: "var(--c-brand-2)",
  burn: "var(--c-ink-3)",
};

export function FeeFlowDiagram({
  copy,
  labels,
}: {
  copy: HiwWarmCopy["fees"];
  labels: string[];
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.25 });
  const rows = MODEL_A_FEE_SPLIT.map((slice, index) => ({
    ...slice,
    label: labels[index] ?? slice.id,
  }));

  return (
    <div
      ref={ref}
      className={`warm-fee-flow rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)] sm:p-6 ${inView ? "is-on" : ""}`}
      data-testid="hiw-warm-fee-flow"
    >
      <div className="flex items-stretch gap-3 sm:gap-5">
        <div className="flex w-24 shrink-0 flex-col items-center justify-center sm:w-28">
          <svg viewBox="0 0 20 20" className="warm-coin h-10 w-10" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="var(--c-brand)" />
            <path d="M10 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm.7 8.3v-.6a2 2 0 0 1-1.5-1.9h1.1a.9.9 0 1 0 .9-.9 2 2 0 0 1-.6-3.9v-.6h1.1v.6a2 2 0 0 1 1.5 1.9h-1.1a.9.9 0 1 0-.9.9 2 2 0 0 1 .6 3.9v.6H10.7Z" fill="var(--c-brand-ink)" />
          </svg>
          <p className="mt-2 text-center text-xs font-semibold text-ink-2">{copy.totalLabel}</p>
          <p className="font-mono text-sm font-bold tabular-nums text-ink">{copy.totalValue}</p>
        </div>

        <svg
          viewBox={`0 0 60 ${VIEW_H}`}
          className="h-[164px] w-10 shrink-0 sm:w-16"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {rows.map((row, index) => (
            <path
              key={row.id}
              className="warm-fee-branch"
              d={`M2 ${VIEW_H / 2} H20 Q38 ${VIEW_H / 2} 38 ${BRANCH_Y[index]} H58`}
              fill="none"
              stroke={SLICE_COLOR[row.id] ?? "var(--c-brand)"}
              strokeWidth={row.pct > 0 ? 2.5 : 1.5}
              strokeDasharray={row.pct > 0 ? undefined : "3 4"}
              style={
                {
                  ["--len" as string]: "70",
                  ["--dash" as string]: "70",
                  ["--d" as string]: `${index * 110}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </svg>

        {/* Same height and even spacing as the branch slots, so rows line up with their branch. */}
        <ol className="flex h-[164px] min-w-0 flex-1 flex-col justify-between">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="warm-fee-row flex items-center gap-2 text-sm"
              style={{ ["--d" as string]: `${index * 110}ms` } as React.CSSProperties}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: SLICE_COLOR[row.id] ?? "var(--c-brand)" }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-ink-2" title={row.label}>
                {row.label}
              </span>
              <span className="font-mono font-semibold tabular-nums text-ink">{row.pct}%</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-4 text-xs text-ink-3">{copy.note}</p>
    </div>
  );
}

/* ── Launch: bonding curve ───────────────────────────────────────────────── */

/** Convex price path, the shape a constant-product bonding curve draws. */
const CURVE_PATH = "M8 132 C 60 128, 108 108, 148 74 C 186 44, 214 24, 246 14";

export function CurveMini({ copy }: { copy: HiwWarmCopy["launch"] }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

  return (
    <figure
      ref={ref}
      className={`warm-curve rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)] ${inView ? "is-on" : ""}`}
      data-testid="hiw-warm-curve"
    >
      <svg viewBox="0 0 256 148" className="h-auto w-full" role="img" aria-label={copy.curveCaption}>
        <line x1="8" y1="140" x2="248" y2="140" stroke="var(--c-line-strong)" strokeWidth="1.5" />
        <line x1="8" y1="8" x2="8" y2="140" stroke="var(--c-line-strong)" strokeWidth="1.5" />
        <path
          className="warm-curve-line"
          d={CURVE_PATH}
          fill="none"
          stroke="var(--c-brand)"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ ["--len" as string]: "330", ["--dash" as string]: "330" } as React.CSSProperties}
        />
        <circle className="warm-curve-dot" cx="8" cy="132" r="5" fill="var(--c-warm)" />
        <circle className="warm-curve-dot" cx="246" cy="14" r="5" fill="var(--c-brand-2)" />
      </svg>
      <figcaption className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-ink-3">
        <span>{copy.curveCaption}</span>
        <span>
          {copy.curveStartLabel} → {copy.curveEndLabel}
        </span>
      </figcaption>
      <p className="mt-2 text-xs text-ink-3">{copy.curveNote}</p>
    </figure>
  );
}
