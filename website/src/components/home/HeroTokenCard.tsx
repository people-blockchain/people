import type { HomeWarmCopy } from "@/lib/home-warm-content";
import { PeopleWordmark, PersonAvatar } from "@/components/warm/warm-ui";
import { TOKEN_COMMUNITY_SHARE_PCT } from "@/lib/selling-economics";

type HeroCopy = HomeWarmCopy["hero"];

/**
 * Hero visual: a single premium token card in the /founders gradient-card
 * language (name, ticker, an example price on the bonding curve, the real
 * community-share split and a few member avatars) instead of a looping
 * phone mock. Static markup only — the one animated loop is the existing
 * `founders-card-sheen` sweep, which already no-ops under reduced motion.
 */
export function HeroTokenCard({ t }: { t: HeroCopy }) {
  const initial = t.card.tokenName.trim().charAt(0).toUpperCase() || "P";

  return (
    <div className="w-full max-w-[340px]" data-testid="hero-visual-card">
      <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0369a1_0%,#4f46e5_55%,#f59e0b_130%)] p-5 text-white shadow-[var(--elev-2)] sm:p-6">
        <div className="founders-card-sheen pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-16 -left-6 h-44 w-44 rounded-full bg-amber-300/20" aria-hidden="true" />

        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <PeopleWordmark tone="white" className="h-6" />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium" data-testid="home-hero-card-badge">
              {t.card.badge}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/20 text-base font-bold" aria-hidden="true">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight">{t.card.tokenName}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{t.card.ticker}</p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <p className="font-mono text-2xl font-bold leading-none tabular-nums">{t.card.price}</p>
            <svg viewBox="0 0 120 28" className="h-6 w-full max-w-[120px]" aria-hidden="true">
              <path
                d="M2 23C18 20 32 15 46 11S84 4 118 2"
                fill="none"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="-mt-2 text-xs text-white/80">{t.stages[1].sub}</p>

          <div className="h-px bg-white/15" aria-hidden="true" />

          <div className="flex items-center gap-4">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(#fde68a 0% ${TOKEN_COMMUNITY_SHARE_PCT}%, rgba(255,255,255,0.22) ${TOKEN_COMMUNITY_SHARE_PCT}% 100%)` }}
              aria-hidden="true"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#0b1220]/55 text-sm font-bold">
                {TOKEN_COMMUNITY_SHARE_PCT}%
              </span>
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold" data-testid="home-hero-card-share-label">
                {t.stages[2].label}
                <span className="flex -space-x-1.5" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <PersonAvatar key={i} index={i} className="warm-avatar-ring h-5 w-5 rounded-full" />
                  ))}
                </span>
              </p>
              <p className="mt-1 text-xs text-white/80">{t.stages[2].sub}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
