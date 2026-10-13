"use client";

import { Fragment } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  Award,
  Boxes,
  Coins,
  Droplets,
  Landmark,
  Pause,
  Play,
  RotateCcw,
  Server,
  Smartphone,
  Users,
  Wallet,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { content } from "@/lib/content";
import { useLoopStage } from "../motion/useLoopStage";
import { Chip, Eyebrow } from "../ui/primitives";

type QuickLoopContent = (typeof content)["en"]["howItWorks"]["quickLoop"];
type StationContent = QuickLoopContent["stations"][number];
type FunctionContent = QuickLoopContent["functions"][number];

/** Highlight state of one station on the loop. */
type StationState = "past" | "active" | "ahead";
/** State of the connector that leads into the next station. */
type FlowState = "done" | "active" | "ahead";

const STATION_GLYPHS: Record<string, LucideIcon> = {
  people: Users,
  participation: Smartphone,
  activity: ArrowLeftRight,
  fees: Coins,
  economy: Waypoints,
  pool: Landmark,
  rewards: Award,
};

const FUNCTION_GLYPHS: Record<string, LucideIcon> = {
  validators: Server,
  pool: Landmark,
  treasury: Wallet,
  liquidity: Droplets,
};

/** One node of the loop: glyph + name + a two-word meaning. */
function StationNode({
  station,
  state,
  layout,
}: {
  station: StationContent;
  state: StationState;
  layout: "rail" | "stack";
}) {
  const Glyph = STATION_GLYPHS[station.id] ?? Boxes;
  const isActive = state === "active";
  const isPast = state === "past";

  const glyph = (
    <span
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all duration-500 ${
        isActive
          ? "border-brand/50 bg-brand/10 text-brand ring-4 ring-brand/15"
          : isPast
            ? "border-line-strong bg-surface-2 text-ink-2"
            : "border-line bg-surface text-ink-3"
      }`}
      aria-hidden="true"
    >
      <Glyph className="h-[1.15rem] w-[1.15rem]" />
      {isActive && (
        <span className="node-pulse absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand" />
      )}
    </span>
  );

  const text = (
    <span className={layout === "rail" ? "flex flex-col gap-0.5" : "flex flex-col gap-1"}>
      <span
        className={`break-words font-mono font-bold uppercase leading-tight tracking-[0.08em] transition-colors duration-500 ${
          layout === "rail" ? "text-[11px] xl:text-[12px]" : "text-[12px]"
        } ${isActive || isPast ? "text-ink" : "text-ink-2"}`}
      >
        {station.label}
      </span>
      <span
        className={`leading-snug text-ink-3 ${
          layout === "rail" ? "text-[11px] xl:text-[11.5px]" : "text-[12.5px]"
        }`}
      >
        {station.sub}
      </span>
    </span>
  );

  if (layout === "stack") {
    return (
      <div className="relative pb-7 pl-14">
        <span className="absolute left-0 top-0">{glyph}</span>
        {text}
      </div>
    );
  }

  return (
    <div className="flex w-[12%] shrink-0 flex-col items-center gap-2 text-center">
      {glyph}
      {text}
    </div>
  );
}

/** Shared flow treatment for a connector: rail, filled base and travelling value. */
function FlowLine({
  state,
  axis,
  phase,
}: {
  state: FlowState;
  axis: "x" | "y";
  /** Offsets the travelling pulse so parallel wires do not move in lockstep. */
  phase: number;
}) {
  const reached = state !== "ahead";

  return (
    <>
      <span className="absolute inset-0 rounded-full bg-line" />
      <span
        className={`absolute from-brand to-brand-2 transition-all duration-700 ease-out ${
          axis === "x"
            ? `inset-y-0 left-0 rounded-full bg-gradient-to-r ${reached ? "w-full" : "w-0"}`
            : `inset-x-0 top-0 rounded-full bg-gradient-to-b ${reached ? "h-full" : "h-0"}`
        }`}
      />
      {reached && (
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <span
            className={`absolute inset-0 ${
              axis === "x" ? "flow-particle" : "flow-particle-y"
            } ${state === "done" ? "opacity-55" : ""}`}
            style={{ animationDelay: `-${(phase * 0.37).toFixed(2)}s` }}
          >
            {/* The clip is hairline-thin, so the particle reads as a pulse of
                light travelling down the wire. `ink` keeps the pulse legible
                against the brand gradient in both themes. */}
            <span
              className={`absolute from-transparent via-ink to-transparent ${
                axis === "x"
                  ? "inset-y-0 left-0 w-4 bg-gradient-to-r"
                  : "inset-x-0 top-0 h-4 bg-gradient-to-b"
              }`}
            />
          </span>
        </span>
      )}
    </>
  );
}

/** Horizontal connector between two stations on the desktop rail. */
function RailConnector({ state, phase }: { state: FlowState; phase: number }) {
  return (
    <span className="relative mt-[1.375rem] h-px flex-1" aria-hidden="true">
      <FlowLine state={state} axis="x" phase={phase} />
      <ArrowRight
        className={`absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500 ${
          state === "active"
            ? "node-pulse text-brand"
            : state === "done"
              ? "text-brand/70"
              : "text-ink-3/50"
        }`}
      />
    </span>
  );
}

/** Vertical connector between two stations in the stacked mobile flow. */
function StackConnector({ state, phase }: { state: FlowState; phase: number }) {
  return (
    <span
      className="absolute left-[1.375rem] top-11 h-[calc(100%_-_2.75rem)] w-px"
      aria-hidden="true"
    >
      <FlowLine state={state} axis="y" phase={phase} />
      <ArrowDown
        className={`absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 transition-colors duration-500 ${
          state === "active"
            ? "node-pulse text-brand"
            : state === "done"
              ? "text-brand/70"
              : "text-ink-3/50"
        }`}
      />
    </span>
  );
}

/** The closing arc: from the last station back under the rail to the first. */
function ReturnArc({ closing, label }: { closing: boolean; label: string }) {
  const path = "M 940 2 V 26 Q 940 40 926 40 H 74 Q 60 40 60 26 V 8";

  return (
    <div className="relative mt-2 h-14">
      <svg
        viewBox="0 0 1000 56"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-line"
        />
        <path
          d={path}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={`stroke-brand-2 transition-opacity duration-700 ${
            closing ? "flow-dash opacity-100" : "opacity-0"
          }`}
        />
        <path
          d="M 60 0 L 54.5 9 L 65.5 9 Z"
          className={`transition-opacity duration-700 ${
            closing ? "fill-brand-2 opacity-100" : "fill-ink-3/50"
          }`}
        />
      </svg>

      <span className="mono-label absolute left-1/2 top-[71%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1 text-ink-3">
        {label}
      </span>
    </div>
  );
}

/**
 * Visual-first introduction to the economic loop.
 *
 * One connected system rather than a card wall: seven stations on a single
 * flowing rail, the network functions that the same value supports, and one
 * short statement per beat. On desktop the loop runs left to right and closes
 * through the arc underneath; on mobile it becomes a vertical flow that ends by
 * returning to people.
 *
 * Every animation carries meaning — particles show value moving, the highlighted
 * station shows where the value is right now. With `prefers-reduced-motion` the
 * whole flow is rendered as a static diagram and all six statements are listed,
 * so nothing depends on watching the motion.
 */
export function UnderstandLoop() {
  const { lang } = useLanguage();
  const t = content[lang].howItWorks.quickLoop;
  const { ref, stage, reducedMotion, paused, goTo, togglePaused } = useLoopStage(t.scenes.length);

  const scenes = t.scenes;
  const stations = t.stations;
  const activeIndices = scenes[stage].stations.map((id) =>
    Math.max(
      0,
      stations.findIndex((station) => station.id === id)
    )
  );
  const minActive = Math.min(...activeIndices);
  const maxActive = Math.max(...activeIndices);
  const loopClosing = !reducedMotion && stage === scenes.length - 1;

  const stationState = (index: number): StationState => {
    if (reducedMotion) return "past";
    if (index > maxActive) return "ahead";
    if (index >= minActive) return "active";
    return "past";
  };

  /** Flow of the connector between station `index` and the next node. */
  const flowState = (index: number): FlowState => {
    if (reducedMotion) return "done";
    if (index + 1 < minActive) return "done";
    if (index + 1 === minActive) return "active";
    if (index >= minActive && index < maxActive) return "active";
    return "ahead";
  };

  /** Flow from the last station back to the first (the mobile return note). */
  const returnFlow: FlowState = reducedMotion ? "done" : loopClosing ? "active" : "ahead";

  // Derived from the content rather than hard-coded, so the beats can be
  // reordered or reworded without silently detaching the function strip.
  const sceneWith = (stationId: string) =>
    scenes.findIndex((scene) => scene.stations.includes(stationId));
  const economyScene = sceneWith("economy");
  const poolScene = sceneWith("pool");

  const functionsLive = reducedMotion || economyScene < 0 || stage >= economyScene;
  const poolFocused = !reducedMotion && poolScene >= 0 && stage === poolScene;

  return (
    <div
      ref={ref}
      className="surface-elevated relative overflow-hidden rounded-3xl p-5 sm:p-6 lg:p-8"
    >
      <div className="glow-brand pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full" aria-hidden="true" />
      <div className="glow-violet pointer-events-none absolute -bottom-28 -right-24 h-64 w-64 rounded-full" aria-hidden="true" />

      <div className="relative">
        {/* Panel header + run controls -------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow tone="brand">{t.badge}</Eyebrow>

          <div className="flex items-center gap-2">
            <Chip tone="brand">{t.duration}</Chip>
            <button
              type="button"
              onClick={togglePaused}
              aria-label={paused ? t.playLabel : t.pauseLabel}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink motion-reduce:hidden"
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="mt-4 h-px w-full bg-line motion-reduce:hidden" aria-hidden="true">
          <span
            className="block h-px bg-gradient-to-r from-brand to-brand-2 transition-[width] duration-700 ease-out"
            style={{ width: `${((stage + 1) / scenes.length) * 100}%` }}
          />
        </div>

        {/* The loop — desktop rail ------------------------------------------ */}
        <div className="mt-9 hidden lg:block">
          <div className="flex items-start">
            {stations.map((station, index) => (
              <Fragment key={station.id}>
                <StationNode station={station} state={stationState(index)} layout="rail" />
                {index < stations.length - 1 && <RailConnector state={flowState(index)} phase={index} />}
              </Fragment>
            ))}
          </div>

          <ReturnArc closing={loopClosing || reducedMotion} label={t.returnLabel} />
        </div>

        {/* The loop — stacked flow (mobile / tablet) ------------------------ */}
        <div className="mt-9 lg:hidden">
          <ol>
            {stations.map((station, index) => (
              <li key={station.id} className="relative">
                <StationNode station={station} state={stationState(index)} layout="stack" />
                <StackConnector
                  state={index < stations.length - 1 ? flowState(index) : returnFlow}
                  phase={index}
                />
              </li>
            ))}
          </ol>

          <div className="relative pl-14">
            <span
              className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-line-strong text-ink-3"
              aria-hidden="true"
            >
              <RotateCcw className="h-4 w-4" />
            </span>
            <p className="pt-3 text-[12.5px] font-semibold leading-snug text-ink-2">{t.returnLabel}</p>
          </div>
        </div>

        {/* What the same network value supports ----------------------------- */}
        <div className="mt-8 border-t border-line pt-6">
          <Eyebrow tone="violet">{t.functionsLabel}</Eyebrow>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {t.functions.map((item: FunctionContent, index) => {
              const Glyph = FUNCTION_GLYPHS[item.id] ?? Boxes;
              const isPool = item.id === "pool";
              const highlighted = isPool && poolFocused;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-500 ${
                    highlighted
                      ? "border-brand/45 bg-brand/10 text-brand ring-2 ring-brand/15"
                      : functionsLive
                        ? "border-line-strong bg-surface-2 text-ink-2"
                        : "border-line bg-surface text-ink-3 opacity-60"
                  }`}
                  style={{ transitionDelay: `${index * 70}ms` }}
                >
                  <Glyph className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 text-[12.5px] font-semibold leading-snug">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* One statement per beat (motion) ---------------------------------- */}
        <div className="mt-6 border-t border-line pt-5 motion-reduce:hidden">
          <div className="flex items-center justify-between gap-4">
            <Eyebrow tone="brand" className="shrink-0">
              {`${t.sceneLabel} ${scenes[stage].num} / ${scenes.length}`}
            </Eyebrow>

            <div className="flex shrink-0 items-center gap-1.5">
              {scenes.map((scene, index) => (
                <button
                  key={scene.num}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={scene.statement}
                  aria-current={index === stage ? "true" : undefined}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    index === stage ? "w-6 bg-brand" : "w-1.5 bg-line-strong hover:bg-ink-3"
                  }`}
                />
              ))}
            </div>
          </div>

          <p className="mt-3 min-h-[3rem] text-[15px] font-semibold leading-snug text-ink sm:min-h-[1.75rem] sm:text-base">
            {scenes[stage].statement}
          </p>
        </div>

        {/* The whole sequence, static (reduced motion) ---------------------- */}
        <ul className="mt-6 hidden gap-x-8 gap-y-2 border-t border-line pt-5 motion-reduce:grid sm:grid-cols-2">
          {scenes.map((scene) => (
            <li key={scene.num} className="flex items-start gap-3">
              <span className="mono-label shrink-0 pt-0.5 text-brand">{scene.num}</span>
              <span className="text-[13px] leading-relaxed text-ink-2">{scene.statement}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
