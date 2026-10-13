"use client";

import { useLoopStage } from "@/components/motion/useLoopStage";
import type { HomePublicCopy } from "@/lib/home-public-content";

/**
 * Lightweight CSS/React flow: TOKEN CREATED → 10% COMMUNITY + NETWORK FEE →
 * NETWORK ECONOMY + GROWTH POOL → L1 70% → L2 30%.
 * Always visible (not hover-only). Pause control for WCAG 2.2.2.
 * prefers-reduced-motion shows the full chain statically.
 */
type HeroFlowCopy = Pick<HomePublicCopy["hero"], "flowSteps" | "flowAria" | "flowPause" | "flowPlay">;

type ValueFlowAnimationProps = {
  /** Vertical stack fills the hero right column on large screens */
  layout?: "auto" | "stacked";
  size?: "default" | "hero";
  flow: HeroFlowCopy;
  className?: string;
  "data-testid"?: string;
};

export function ValueFlowAnimation({
  layout = "auto",
  size = "default",
  flow: t,
  className = "",
  "data-testid": dataTestId,
}: ValueFlowAnimationProps) {
  const { ref, stage, reducedMotion, paused, goTo, togglePaused } = useLoopStage(
    t.flowSteps.length,
    2200
  );
  const stacked = layout === "stacked";
  const heroCard = size === "hero" && stacked;

  return (
    <div
      ref={ref}
      data-testid={dataTestId}
      className={`surface-elevated relative flex h-full min-h-full flex-col overflow-hidden rounded-3xl ${
        heroCard ? "min-h-0 flex-1 p-6 sm:p-7" : stacked ? "min-h-0 p-3.5 sm:p-4" : "p-3 sm:p-4"
      } ${className}`}
      role="group"
      aria-label={t.flowAria}
    >
      <div
        className="glow-brand pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
        aria-hidden="true"
      />

      <ol
        className={`relative flex min-h-0 flex-col ${
          heroCard ? "flex-1 justify-between gap-3" : stacked ? "gap-2" : "gap-1.5 lg:flex-row lg:items-stretch lg:gap-0"
        }`}
      >
        {t.flowSteps.map((step, index) => {
          const active = reducedMotion || stage === index;
          const isLast = index === t.flowSteps.length - 1;
          const rowOnLg = !stacked;
          return (
            <li
              key={step.id}
              className={`relative flex min-w-0 flex-col ${
                stacked ? "flex-1" : "flex-1 lg:flex-row lg:items-stretch"
              }`}
            >
              <button
                type="button"
                onClick={() => goTo(index)}
                aria-current={active ? "step" : undefined}
                className={`step-node flex h-full w-full flex-col justify-center rounded-xl border text-start transition-colors ${
                  heroCard ? "px-4 py-4 sm:px-5 sm:py-4" : stacked ? "px-3 py-2 sm:py-2.5" : "px-3 py-2.5"
                } ${
                  active
                    ? "border-brand/50 bg-brand/10"
                    : "border-line bg-surface-2"
                }`}
              >
                <span className={`mono-label text-ink-3 ${heroCard ? "text-[11px]" : ""}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={`mt-1 block font-bold leading-snug ${
                    heroCard ? "text-base sm:text-lg" : "text-[13px]"
                  } ${active ? "text-ink" : "text-ink-2"}`}
                >
                  {step.label}
                </span>
                <span
                  className={`mt-1 block leading-snug text-ink-3 ${
                    heroCard ? "text-sm sm:text-[15px]" : "text-[12px]"
                  }`}
                >
                  {step.sub}
                </span>
              </button>

              {!isLast && rowOnLg && (
                <span
                  className="relative mx-auto hidden h-4 w-px shrink-0 overflow-hidden bg-line lg:mx-1.5 lg:my-auto lg:block lg:h-px lg:w-5"
                  aria-hidden="true"
                >
                  <span className="flow-particle absolute inset-y-0 left-0 w-1/2 bg-brand lg:inset-x-0 lg:top-0 lg:h-full lg:w-1/2" />
                </span>
              )}
              {!isLast && (
                <span
                  className={`relative mx-auto block shrink-0 overflow-hidden bg-line ${
                    rowOnLg ? "h-3 w-px lg:hidden" : "h-2.5 w-px"
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute bg-brand ${
                      rowOnLg
                        ? "flow-particle-y left-0 top-0 h-1/2 w-full"
                        : "flow-particle-y left-0 top-0 h-1/2 w-full"
                    }`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className={`flex items-center justify-between gap-2 ${heroCard ? "mt-4" : "mt-3"}`}>
        <div className="flex gap-1" aria-hidden="true">
          {t.flowSteps.map((step, index) => (
            <span
              key={step.id}
              className={`h-1 w-6 rounded-full ${
                reducedMotion || stage === index ? "bg-brand" : "bg-line-strong"
              }`}
            />
          ))}
        </div>
        {!reducedMotion && (
          <button
            type="button"
            onClick={togglePaused}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface font-medium text-ink-2 ${
              heroCard ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"
            }`}
          >
            {paused ? t.flowPlay : t.flowPause}
          </button>
        )}
      </div>
    </div>
  );
}
