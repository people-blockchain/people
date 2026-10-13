"use client";

import { useInView } from "@/components/motion/useInView";

type Copy = { supply: string; share: string; toPool: string; pool: string; poolNote: string; aria: string };

const AVATAR_TONES = ["var(--c-brand)", "var(--c-value)", "var(--c-violet)", "var(--c-warm)", "var(--c-brand-2)"];

/**
 * 10% of a token's supply flowing into its community pool of people.
 * Pure CSS/SVG; the flow runs only while visible and stops under reduced motion.
 */
export function CommunityShareFlow({ copy }: { copy: Copy }) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3, once: false });
  return (
    <div
      ref={ref}
      role="img"
      aria-label={copy.aria}
      data-testid="community-flow"
      data-animated={inView ? "true" : "false"}
      className={`community-flow surface-elevated grid max-w-3xl grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-2 rounded-2xl border border-line p-4 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)] sm:gap-4 sm:p-6 ${inView ? "is-on" : ""}`}
    >
      <div aria-hidden="true" className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{copy.supply}</p>
        <div className="mt-2 grid grid-cols-10 gap-0.5 sm:gap-1">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className={`h-6 rounded-sm sm:h-8 ${i === 9 ? "community-flow-share bg-value" : "bg-brand/35"}`}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-2">
          <span className="font-bold text-value">{copy.share}</span> {copy.toPool}
        </p>
      </div>

      <svg viewBox="0 0 96 40" className="h-10 w-full rtl:-scale-x-100" aria-hidden="true">
        <path d="M2 20 H88" stroke="var(--c-line-strong, rgba(148,163,184,.35))" strokeWidth="2" strokeDasharray="3 4" fill="none" />
        <path d="M84 13 L93 20 L84 27" stroke="var(--c-value)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {[0, 1, 2].map((i) => (
          <circle key={i} className="community-flow-dot" cx="4" cy="20" r="3.2" fill="var(--c-value)" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      </svg>

      <div aria-hidden="true" className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{copy.pool}</p>
        <div className="mt-2 grid w-fit grid-cols-4 gap-1 sm:gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              className="community-flow-avatar flex h-6 w-6 items-end justify-center overflow-hidden rounded-full border border-line bg-surface sm:h-8 sm:w-8"
              style={{ animationDelay: `${(i % 4) * 0.45}s` }}
            >
              <svg viewBox="0 0 20 20" className="h-full w-full">
                <circle cx="10" cy="7.5" r="3.6" fill={AVATAR_TONES[i % AVATAR_TONES.length]} />
                <path d="M3 20 C3 14 17 14 17 20 Z" fill={AVATAR_TONES[i % AVATAR_TONES.length]} />
              </svg>
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-ink-2">{copy.poolNote}</p>
      </div>
    </div>
  );
}
