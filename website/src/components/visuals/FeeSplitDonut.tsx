"use client";

import { useInView } from "@/components/motion/useInView";

export type FeeSlice = { id: string; pct: number; label: string };

/** Donut colours per slice id (distinct even where the list dots share a tone). */
export const SLICE_COLOR: Record<string, string> = {
  validators: "var(--c-brand)",
  community: "var(--c-value)",
  treasury: "var(--c-violet)",
  liquidity: "var(--c-warm)",
  growth: "var(--c-brand-2)",
  burn: "var(--c-ink-3, #8b93a7)",
};

const R = 42;
const C = 2 * Math.PI * R;

/**
 * Lightweight SVG donut of the network fee split. Segments draw in once the
 * chart scrolls into view; under prefers-reduced-motion the global rule makes
 * the transition instant, so the final chart simply appears.
 */
export function FeeSplitDonut({ slices, title }: { slices: FeeSlice[]; title: string }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const segments = slices.map((s, i) => ({
    ...s,
    len: (s.pct / 100) * C,
    start: (slices.slice(0, i).reduce((sum, x) => sum + x.pct, 0) / 100) * C,
  }));
  return (
    <div
      ref={ref}
      className={`fee-donut surface-elevated mt-4 flex flex-col items-center gap-6 rounded-2xl border border-line p-5 sm:flex-row sm:items-center ${inView ? "is-on" : ""}`}
      data-testid="fee-donut"
      data-animated={inView ? "true" : "false"}
    >
      <figure className="relative h-40 w-40 shrink-0" aria-label={title} role="img">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--c-line, rgba(128,128,128,.2))" strokeWidth="12" />
          {segments.map((s, i) => (
              <circle
                key={s.id}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={SLICE_COLOR[s.id] ?? "var(--c-brand)"}
                strokeWidth="12"
                className="fee-donut-seg"
                style={
                  {
                    "--seg": `${Math.max(0, s.len - (s.pct > 0 ? 0.8 : 0))}`,
                    "--gap": `${C}`,
                    strokeDashoffset: -s.start,
                    transitionDelay: `${i * 140}ms`,
                  } as React.CSSProperties
                }
              />
          ))}
        </svg>
        <figcaption className="absolute inset-0 flex items-center justify-center px-7 text-center text-[11px] font-semibold leading-tight text-ink-2">
          {title}
        </figcaption>
      </figure>
      <ol className="w-full min-w-0 flex-1 space-y-2">
        {slices.map((s, i) => (
          <li key={s.id} className="fee-donut-row flex items-center gap-2 text-sm" style={{ transitionDelay: `${i * 140}ms` }}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLICE_COLOR[s.id] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 text-ink-2">{s.label}</span>
            <span className="font-mono tabular-nums text-ink">{s.pct}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
