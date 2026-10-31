"use client";

import { useMemo, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import type { FoundersLandingCopy } from "@/lib/founders-landing-content";
import { countryFlagEmoji } from "@/lib/founders/countries";
import type { FounderCountryStat } from "@/lib/founders/map-stats";
import {
  EXTRA_COUNTRY_COORDS,
  WORLD_MAP_COUNTRIES,
  WORLD_MAP_VIEWBOX,
  buildMapLegendBuckets,
  computeCountryColorStep,
  getCountryMapPoint,
  type MapColorStep,
} from "@/lib/founders/world-map-geometry";
import { CountUpNumber, SectionHead, fill } from "./founders-ui";

const STEP_FILL: Record<MapColorStep, string> = {
  0: "fill-[#e6e0d4] dark:fill-[#1e293b]",
  1: "fill-[#bae6fd] dark:fill-[#0c4a6e]",
  2: "fill-[#38bdf8] dark:fill-[#0284c7]",
  3: "fill-[#0284c7] dark:fill-[#38bdf8]",
  4: "fill-[#0369a1] dark:fill-[#f59e0b]",
};

const STEP_SWATCH: Record<MapColorStep, string> = {
  0: "bg-[#e6e0d4] dark:bg-[#1e293b]",
  1: "bg-[#bae6fd] dark:bg-[#0c4a6e]",
  2: "bg-[#38bdf8] dark:bg-[#0284c7]",
  3: "bg-[#0284c7] dark:bg-[#38bdf8]",
  4: "bg-[#0369a1] dark:bg-[#f59e0b]",
};

const POLYGON_CODES = new Set(WORLD_MAP_COUNTRIES.map((c) => c.code));

export type FoundersWorldMapProps = {
  copy: FoundersLandingCopy;
  lang: string;
  countries: readonly FounderCountryStat[];
  byCountry: Readonly<Record<string, number>>;
  verifiedCount: number;
  available: boolean;
  countryName: (code: string) => string;
};

export function FoundersWorldMapSection({
  copy,
  lang,
  countries,
  byCountry,
  verifiedCount,
  available,
  countryName,
}: FoundersWorldMapProps) {
  const [activeCode, setActiveCode] = useState<string | null>(null);

  const maxCount = useMemo(
    () => countries.reduce((max, item) => Math.max(max, item.count), 0),
    [countries],
  );

  const legendBuckets = useMemo(
    () => buildMapLegendBuckets(maxCount, lang),
    [maxCount, lang],
  );

  const activeCount = activeCode ? (byCountry[activeCode] ?? 0) : 0;

  /**
   * Country markers to label directly on the SVG canvas:
   * every country with count > 0, plus the currently hovered/tapped country (even if 0).
   */
  const labeledPoints = useMemo(() => {
    const codes = new Set<string>();
    for (const item of countries) {
      if (item.count > 0) codes.add(item.countryCode);
    }
    if (activeCode) codes.add(activeCode);

    const out: { code: string; count: number; cx: number; cy: number; isActive: boolean }[] = [];
    for (const code of codes) {
      const pt = getCountryMapPoint(code);
      if (!pt) continue;
      out.push({
        code,
        count: byCountry[code] ?? 0,
        cx: pt.cx,
        cy: pt.cy,
        isActive: code === activeCode,
      });
    }
    // Render active label last so it sits on top of neighbors.
    out.sort((a, b) => Number(a.isActive) - Number(b.isActive) || a.count - b.count);
    return out;
  }, [countries, activeCode, byCountry]);

  /** Small/island countries that have founders or are active but have no 110m polygon. */
  const extraPins = useMemo(() => {
    const out: { code: string; count: number; cx: number; cy: number; step: MapColorStep }[] = [];
    for (const [code, coords] of Object.entries(EXTRA_COUNTRY_COORDS)) {
      if (POLYGON_CODES.has(code)) continue;
      const count = byCountry[code] ?? 0;
      if (count <= 0 && activeCode !== code) continue;
      out.push({
        code,
        count,
        cx: coords.cx,
        cy: coords.cy,
        step: computeCountryColorStep(count, maxCount),
      });
    }
    return out;
  }, [byCountry, activeCode, maxCount]);

  return (
    <section
      id="founders-map"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      aria-labelledby="founders-map-title"
      data-testid="founders-world-map"
    >
      <Reveal>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHead
            eyebrow={copy.mapEyebrow}
            title={copy.mapTitle}
            lead={copy.mapSub}
            titleId="founders-map-title"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink shadow-[var(--elev-1)]"
              data-testid="founders-map-total-pill"
            >
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
              <CountUpNumber value={verifiedCount} lang={lang} className="font-mono font-bold" />
              <span className="text-ink-2">{copy.counterLabel}</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink-2 shadow-[var(--elev-1)]"
              data-testid="founders-map-countries-pill"
            >
              {fill(copy.mapCountriesActive, { count: countries.length.toLocaleString(lang) })}
            </span>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[28px] border border-line bg-surface p-4 shadow-[var(--elev-1)] sm:p-6">
          {/* Interactive tooltip / active country readout bar (works on hover, tap, and keyboard focus) */}
          <div
            className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-canvas-2 px-4 py-2.5 text-sm"
            role="status"
            aria-live="polite"
            data-testid="founders-map-tooltip"
          >
            {activeCode ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-lg leading-none" aria-hidden="true">
                    {countryFlagEmoji(activeCode)}
                  </span>
                  <span className="truncate font-semibold text-ink">
                    {countryName(activeCode)}
                  </span>
                  <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-xs text-ink-3">
                    {activeCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-sm font-bold tabular-nums text-brand"
                    data-testid="founders-map-tooltip-count"
                  >
                    {fill(copy.mapCountryCount, { count: activeCount.toLocaleString(lang) })}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-3 sm:text-sm">{copy.mapTooltipHint}</p>
            )}
          </div>

          {/* World Map SVG Canvas */}
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-line/80 bg-[#f5f1e8] dark:bg-[#0f172a]">
            <svg
              viewBox={WORLD_MAP_VIEWBOX}
              role="img"
              aria-label={copy.mapTitle}
              className="block h-auto w-full select-none touch-manipulation"
              data-testid="founders-map-svg"
            >
              {/* Subtle cartographic graticule lines */}
              <g className="stroke-[#ded7c8] dark:stroke-[#1e293b]" strokeWidth="0.4" fill="none" aria-hidden="true">
                <line x1="0" y1="120" x2="1000" y2="120" strokeDasharray="3 3" />
                <line x1="0" y1="205" x2="1000" y2="205" />
                <line x1="0" y1="290" x2="1000" y2="290" strokeDasharray="3 3" />
                <line x1="250" y1="44" x2="250" y2="406" strokeDasharray="3 3" />
                <line x1="500" y1="44" x2="500" y2="406" strokeDasharray="3 3" />
                <line x1="750" y1="44" x2="750" y2="406" strokeDasharray="3 3" />
              </g>

              {/* Country polygons */}
              <g data-testid="founders-map-paths">
                {WORLD_MAP_COUNTRIES.map((country) => {
                  const count = byCountry[country.code] ?? 0;
                  const step = computeCountryColorStep(count, maxCount);
                  const isActive = activeCode === country.code;
                  const label = `${countryName(country.code)} (${country.code}): ${count.toLocaleString(lang)}`;
                  return (
                    <path
                      key={country.code}
                      d={country.d}
                      data-country={country.code}
                      data-count={count}
                      data-step={step}
                      tabIndex={0}
                      role="button"
                      aria-label={label}
                      aria-pressed={isActive}
                      onMouseEnter={() => setActiveCode(country.code)}
                      onFocus={() => setActiveCode(country.code)}
                      onClick={() =>
                        setActiveCode((prev) => (prev === country.code ? null : country.code))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveCode((prev) => (prev === country.code ? null : country.code));
                        }
                      }}
                      className={`${STEP_FILL[step]} cursor-pointer transition-colors duration-150 focus:outline-none ${
                        isActive
                          ? "stroke-[#f59e0b] stroke-[1.6] brightness-105"
                          : "stroke-[#faf7f2] stroke-[0.55] hover:brightness-95 dark:stroke-[#0f172a]"
                      }`}
                    >
                      <title>{label}</title>
                    </path>
                  );
                })}
              </g>

              {/* Pins for small island / city states with founders */}
              {extraPins.length > 0 ? (
                <g data-testid="founders-map-extra-pins">
                  {extraPins.map((pin) => {
                    const isActive = activeCode === pin.code;
                    const label = `${countryName(pin.code)} (${pin.code}): ${pin.count.toLocaleString(lang)}`;
                    return (
                      <circle
                        key={pin.code}
                        cx={pin.cx}
                        cy={pin.cy}
                        r={isActive ? 5 : 3.5}
                        data-country={pin.code}
                        data-count={pin.count}
                        data-step={pin.step}
                        tabIndex={0}
                        role="button"
                        aria-label={label}
                        onMouseEnter={() => setActiveCode(pin.code)}
                        onFocus={() => setActiveCode(pin.code)}
                        onClick={() =>
                          setActiveCode((prev) => (prev === pin.code ? null : pin.code))
                        }
                        className={`${STEP_FILL[pin.step]} cursor-pointer stroke-[#faf7f2] stroke-[1] dark:stroke-[#0f172a]`}
                      >
                        <title>{label}</title>
                      </circle>
                    );
                  })}
                </g>
              ) : null}

              {/* Per-country founder count badges rendered directly on the map */}
              <g data-testid="founders-map-counts">
                {labeledPoints.map((pt) => {
                  const text = `${pt.code} · ${pt.count.toLocaleString(lang)}`;
                  const width = Math.max(28, text.length * 4.4 + 8);
                  const height = 13;
                  const x = Math.max(width / 2 + 2, Math.min(1000 - width / 2 - 2, pt.cx));
                  const y = Math.max(44 + height / 2 + 2, Math.min(406 - height / 2 - 2, pt.cy));
                  return (
                    <g
                      key={pt.code}
                      transform={`translate(${x}, ${y})`}
                      data-testid={`founders-map-badge-${pt.code}`}
                      onMouseEnter={() => setActiveCode(pt.code)}
                      onClick={() =>
                        setActiveCode((prev) => (prev === pt.code ? null : pt.code))
                      }
                      className="cursor-pointer"
                    >
                      <rect
                        x={-width / 2}
                        y={-height / 2}
                        width={width}
                        height={height}
                        rx={6.5}
                        className={
                          pt.isActive
                            ? "fill-[#0f172a] stroke-[#f59e0b] stroke-[1]"
                            : "fill-[#0f172a]/85 stroke-white/70 stroke-[0.6]"
                        }
                      />
                      <text
                        x={0}
                        y={3}
                        textAnchor="middle"
                        className="fill-white font-mono text-[7.5px] font-bold"
                      >
                        {text}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Color scale legend */}
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-canvas-2 px-4 py-3"
            data-testid="founders-map-legend"
          >
            <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-3">
              {copy.mapLegendLabel}
            </span>
            <ul className="flex flex-wrap items-center gap-3 sm:gap-4" aria-label={copy.mapLegendLabel}>
              {legendBuckets.map((bucket) => (
                <li
                  key={bucket.step}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2"
                  data-testid={`founders-map-legend-step-${bucket.step}`}
                >
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded border border-line-strong ${STEP_SWATCH[bucket.step]}`}
                    aria-hidden="true"
                  />
                  <span className="font-mono tabular-nums">{bucket.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Country counts breakdown or honest empty state */}
          {countries.length > 0 ? (
            <ul
              className="mt-4 flex flex-wrap gap-2"
              data-testid="founders-map-country-list"
            >
              {countries.map((item) => {
                const isActive = activeCode === item.countryCode;
                return (
                  <li key={item.countryCode}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveCode(item.countryCode)}
                      onClick={() =>
                        setActiveCode((prev) =>
                          prev === item.countryCode ? null : item.countryCode,
                        )
                      }
                      data-testid={`founders-map-chip-${item.countryCode}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "border-brand bg-brand/10 text-ink"
                          : "border-line bg-canvas-2 text-ink-2 hover:border-brand/50 hover:text-ink"
                      }`}
                    >
                      <span aria-hidden="true">{countryFlagEmoji(item.countryCode)}</span>
                      <span className="max-w-[10rem] truncate">{countryName(item.countryCode)}</span>
                      <span className="font-mono text-[11px] text-ink-3">{item.countryCode}</span>
                      <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-brand">
                        {item.count.toLocaleString(lang)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              className="mt-4 rounded-2xl border border-dashed border-line-strong bg-canvas-2/70 px-4 py-4 text-center sm:text-left"
              data-testid="founders-map-empty"
            >
              <p className="text-sm font-semibold text-ink">{copy.mapEmptyTitle}</p>
              <p className="mt-1 text-xs text-ink-3">
                {available ? copy.mapEmptyBody : copy.mapUnavailableBody}
              </p>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}
