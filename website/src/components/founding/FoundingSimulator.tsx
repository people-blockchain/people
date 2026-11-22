"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Lock, Sliders } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { track } from "@/lib/analytics/client-track";
import { FOUNDING_CONVERSION_EVENTS } from "@/lib/analytics/events-catalog";
import { openFoundingModal } from "@/lib/founding/contract";
import { foundingCopy } from "@/lib/founding/copy";
import {
  DEFAULT_SIMULATOR_ENTRY_PCT,
  DEFAULT_SIMULATOR_TOTAL_POINTS,
  DEFAULT_SIMULATOR_USER_POINTS,
  MAX_SIMULATOR_TOTAL_POINTS,
  MIN_SIMULATOR_TOTAL_POINTS,
  simulateCurveEntry,
  simulateSeason1PoolShare,
} from "@/lib/founding/simulator";

export function FoundingSimulator({ surface = "home" }: { surface?: "home" | "founders" | "bounty" }) {
  const { lang } = useLanguage();
  const pathname = usePathname() || "/";
  const t = foundingCopy(lang).simulator;

  const [entryPct, setEntryPct] = useState<number>(DEFAULT_SIMULATOR_ENTRY_PCT);
  const [userPoints, setUserPoints] = useState<number>(DEFAULT_SIMULATOR_USER_POINTS);
  const [totalPoints, setTotalPoints] = useState<number>(DEFAULT_SIMULATOR_TOTAL_POINTS);

  // Fire `simulator_interact` at most once per page view (never on a timer)
  const interactedThisViewRef = useRef(false);
  useEffect(() => {
    interactedThisViewRef.current = false;
  }, [pathname]);

  const recordInteractionOnce = (control: "curve_slider" | "user_points" | "total_points") => {
    if (interactedThisViewRef.current) return;
    interactedThisViewRef.current = true;
    track(FOUNDING_CONVERSION_EVENTS.simulatorInteract, { surface, control, path: pathname });
  };

  const curveSim = simulateCurveEntry(entryPct);
  const poolSim = simulateSeason1PoolShare(userPoints, totalPoints);

  return (
    <section
      aria-labelledby={`founding-simulator-title-${surface}`}
      data-testid={`founding-simulator-${surface}`}
      className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="rounded-[28px] border border-warm/40 bg-surface p-5 shadow-[var(--elev-1)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-warm">
              <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
              {t.eyebrow}
            </p>
            <h2
              id={`founding-simulator-title-${surface}`}
              className="mt-2 text-xl font-bold leading-snug text-ink sm:text-2xl"
            >
              {t.title}
            </h2>
            <p
              className="mt-2 text-sm font-semibold text-brand sm:text-base"
              data-testid="founding-simulator-slogan"
            >
              {t.slogan}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              recordInteractionOnce("curve_slider");
              openFoundingModal("simulator");
            }}
            data-testid="founding-simulator-cta"
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-bold text-brand-ink shadow-sm transition hover:brightness-110"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {t.ctaLockSeat}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Left: Bonding Curve Entry Position Slider */}
          <div className="rounded-2xl border border-line bg-canvas-2 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`curve-entry-slider-${surface}`}
                className="text-xs font-bold uppercase tracking-wide text-ink-2"
              >
                {t.curveSliderLabel}
              </label>
              <span className="rounded-full bg-brand/15 px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                {curveSim.entryProgressPct.toFixed(0)}%
              </span>
            </div>

            <input
              id={`curve-entry-slider-${surface}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={entryPct}
              onChange={(e) => {
                recordInteractionOnce("curve_slider");
                setEntryPct(Number(e.target.value));
              }}
              data-testid="founding-simulator-curve-slider"
              className="mt-3 h-2 w-full cursor-pointer accent-brand"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-3">
              <span>{t.curveStartTag}</span>
              <span>{t.curveEndTag}</span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-surface p-3">
                <dt className="text-[11px] text-ink-3">{t.priceIndexLabel}</dt>
                <dd
                  className="mt-1 font-mono text-xl font-bold tabular-nums text-ink sm:text-2xl"
                  data-testid="founding-simulator-price-index"
                >
                  {curveSim.priceIndexMultiple.toFixed(2)}×
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3">
                <dt className="text-[11px] text-ink-3">{t.relativePplLabel}</dt>
                <dd
                  className="mt-1 font-mono text-xl font-bold tabular-nums text-value sm:text-2xl"
                  data-testid="founding-simulator-relative-ppl"
                >
                  {curveSim.relativePplPerDollarPct.toFixed(1)}%
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{t.illustrativeNote}</p>
          </div>

          {/* Right: Honest Season 1 Bounty Pool Share (your points / total points × 6,000,000 PPL) */}
          <div className="rounded-2xl border border-line bg-canvas-2 p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-2">{t.poolSectionTitle}</h3>
            <p className="mt-1 font-mono text-xs font-semibold text-brand">{t.poolFormulaLabel}</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`sim-user-points-${surface}`}
                  className="block text-[11px] font-semibold text-ink-2"
                >
                  {t.yourPointsLabel}
                </label>
                <input
                  id={`sim-user-points-${surface}`}
                  type="number"
                  min={0}
                  max={MAX_SIMULATOR_TOTAL_POINTS}
                  step={100}
                  value={userPoints}
                  onChange={(e) => {
                    recordInteractionOnce("user_points");
                    setUserPoints(Math.max(0, Number(e.target.value) || 0));
                  }}
                  data-testid="founding-simulator-user-points"
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono text-sm text-ink"
                />
              </div>

              <div>
                <label
                  htmlFor={`sim-total-points-${surface}`}
                  className="block text-[11px] font-semibold text-ink-2"
                >
                  {t.totalPointsLabel}
                </label>
                <input
                  id={`sim-total-points-${surface}`}
                  type="number"
                  min={MIN_SIMULATOR_TOTAL_POINTS}
                  max={MAX_SIMULATOR_TOTAL_POINTS}
                  step={50_000}
                  value={totalPoints}
                  onChange={(e) => {
                    recordInteractionOnce("total_points");
                    setTotalPoints(Math.max(MIN_SIMULATOR_TOTAL_POINTS, Number(e.target.value) || DEFAULT_SIMULATOR_TOTAL_POINTS));
                  }}
                  data-testid="founding-simulator-total-points"
                  className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 font-mono text-sm text-ink"
                />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-brand/35 bg-surface p-3.5">
              <p className="text-[11px] text-ink-3">{t.estimatedShareLabel}</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <span
                  className="font-mono text-xl font-bold tabular-nums text-brand sm:text-2xl"
                  data-testid="founding-simulator-pool-ppl"
                >
                  {Math.round(poolSim.estimatedPoolSharePpl).toLocaleString(lang)} PPL
                </span>
                <span className="font-mono text-xs font-semibold text-ink-2">
                  ({poolSim.sharePercent.toFixed(4)}%)
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{t.poolDisclaimer}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
