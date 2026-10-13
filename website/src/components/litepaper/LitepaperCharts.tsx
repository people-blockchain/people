"use client";

import { useMemo, type ReactNode } from "react";
import type { Language } from "@/lib/preferences";
import type { LitepaperCopy } from "@/lib/litepaper-content";
import { tokenomicsCopy, type TokenomicsCopy } from "@/lib/tokenomics-content";
import { AllocationDonut } from "@/components/tokenomics/AllocationDonut";
import { SLICE_COLOR } from "@/components/visuals/FeeSplitDonut";
import { fill } from "@/components/warm/warm-ui";
import { useIsMobile } from "@/components/motion/useIsMobile";
import { GENESIS_ALLOCATIONS, NETWORK_FEE_SPLIT, cumulativeUnlockPpl, type AllocationId } from "@/lib/tokenomics";
import { TOKEN_COMMUNITY_ALLOCATION_PCT } from "@/lib/selling-economics";
import { REFERRAL_INSTANT_UNLOCK_BPS, REFERRAL_VEST_WEEKS } from "@/lib/founders/referral";
import { VERIFICATION_POINTS_FACTOR_FULL, VERIFICATION_POINTS_FACTOR_TELEGRAM } from "@/lib/founders/verification";

/**
 * Wraps a chart with a stable testid. Charts used to mount lazily behind an
 * IntersectionObserver, but on some mobile browsers the observer never fired
 * for a normal scroll, leaving the section permanently empty — so content is
 * now always rendered, and the `minHeight` just reserves layout space while
 * the chart's own assets (fonts, SVG) settle in.
 */
function LazyMount({ children, testId, minHeight }: { children: ReactNode; testId: string; minHeight: number }) {
  return (
    <div data-testid={testId} style={{ minHeight }}>
      {children}
    </div>
  );
}

/* ── 1. Allocation donut (reuses the /tokenomics component + its copy) ───── */

const STATIC_DONUT_R = 88;
const STATIC_DONUT_CX = 120;
const STATIC_DONUT_CY = 120;

function staticPolarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function staticDescribeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = staticPolarToCartesian(cx, cy, r, endAngle);
  const end = staticPolarToCartesian(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

/**
 * Non-interactive donut for mobile: same slice math as AllocationDonut, but no
 * hover/click state and no per-slice UnlockMiniChart mount — AllocationDonut's
 * hover handlers and extra charts were the main contributor to mobile jank.
 */
function StaticAllocationDonut({ copy }: { copy: TokenomicsCopy }) {
  const slices = GENESIS_ALLOCATIONS.reduce<{ id: AllocationId; pct: number; color: string; start: number; end: number }[]>(
    (acc, b) => {
      const start = acc.length ? acc[acc.length - 1].end : -Math.PI / 2;
      const span = (b.pct / 100) * Math.PI * 2;
      acc.push({ id: b.id, pct: b.pct, color: b.color, start, end: start + span });
      return acc;
    },
    [],
  );

  return (
    <div className="mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 240 240" className="w-full" role="img" aria-label={copy.donutTitle}>
        {slices.map((s) => (
          <path
            key={s.id}
            d={staticDescribeArc(STATIC_DONUT_CX, STATIC_DONUT_CY, STATIC_DONUT_R, s.start, s.end)}
            fill={s.color}
            stroke="var(--c-canvas, #0b0d12)"
            strokeWidth={1}
          />
        ))}
      </svg>
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {slices.map((s) => (
          <li
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {copy.bucketLabels[s.id]} · {s.pct}%
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LitepaperAllocationDonut({ lang }: { lang: Language }) {
  const isMobile = useIsMobile();
  const copy = tokenomicsCopy[lang];
  return (
    <LazyMount testId="litepaper-allocation-donut" minHeight={360}>
      {isMobile ? <StaticAllocationDonut copy={copy} /> : <AllocationDonut copy={copy} />}
    </LazyMount>
  );
}

/* ── 2. Fee flow (sankey-style, mirrors charts.py `feeflow`) ─────────────── */

const FEE_FLOW_W = 640;
const FEE_FLOW_H = 380;
const FEE_SRC_X = 10;
const FEE_SRC_Y = 40;
const FEE_SRC_W = 120;
const FEE_SRC_H = 300;
const FEE_TARGET_X = 330;
const FEE_GAP_Y = 10;

function buildFeeFlowRows() {
  const totalH = FEE_SRC_H - FEE_GAP_Y * (NETWORK_FEE_SPLIT.length - 1);
  let ySrc = FEE_SRC_Y;
  let tgtY = 20;
  const bars: { id: string; y: number; h: number; color: string }[] = [];
  const ribbons: { id: string; d: string; color: string }[] = [];
  const labels: { id: string; pct: number; y: number }[] = [];

  for (const slice of NETWORK_FEE_SPLIT) {
    const h = slice.pct > 0 ? (totalH * slice.pct) / 100 : 2;
    const hb = Math.max(h, 22);
    const color = SLICE_COLOR[slice.id] ?? "var(--c-brand)";
    if (slice.pct > 0) {
      const hs = (FEE_SRC_H * slice.pct) / 100;
      const x0 = FEE_SRC_X + FEE_SRC_W;
      const x1 = FEE_TARGET_X;
      const mx = (x0 + x1) / 2;
      const ys0 = ySrc;
      const ys1 = ySrc + hs;
      const yt0 = tgtY + (hb - h) / 2;
      const yt1 = yt0 + h;
      ribbons.push({
        id: slice.id,
        color,
        d: `M${x0},${ys0} C${mx},${ys0} ${mx},${yt0} ${x1},${yt0} L${x1},${yt1} C${mx},${yt1} ${mx},${ys1} ${x0},${ys1} Z`,
      });
      ySrc += hs;
    }
    bars.push({ id: slice.id, y: tgtY + (hb - Math.max(h, 2)) / 2, h: Math.max(h, 2), color });
    labels.push({ id: slice.id, pct: slice.pct, y: tgtY + hb / 2 });
    tgtY += hb + FEE_GAP_Y;
  }
  return { bars, ribbons, labels };
}

export function FeeFlowDiagram({ copy, lang }: { copy: LitepaperCopy; lang: Language }) {
  const c = copy.charts;
  const names = tokenomicsCopy[lang].feeSliceLabels;
  const { bars, ribbons, labels } = useMemo(() => buildFeeFlowRows(), []);

  return (
    <LazyMount testId="litepaper-fee-flow" minHeight={300}>
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <svg viewBox={`0 0 ${FEE_FLOW_W} ${FEE_FLOW_H}`} className="w-full" role="img" aria-label={c.feeFlowTitle}>
          <rect
            x={FEE_SRC_X}
            y={FEE_SRC_Y}
            width={FEE_SRC_W}
            height={FEE_SRC_H}
            rx="14"
            fill="var(--c-surface-2)"
            stroke="var(--c-brand)"
            strokeWidth="1.5"
          />
          <text
            x={FEE_SRC_X + FEE_SRC_W / 2}
            y={FEE_SRC_Y + FEE_SRC_H / 2 - 14}
            textAnchor="middle"
            fontSize="12"
            fill="var(--c-ink-3)"
          >
            {c.feeFlowSourceLabel}
          </text>
          <text
            x={FEE_SRC_X + FEE_SRC_W / 2}
            y={FEE_SRC_Y + FEE_SRC_H / 2 + 14}
            textAnchor="middle"
            fontSize="26"
            fontWeight="700"
            fill="var(--c-ink)"
          >
            100%
          </text>
          <text
            x={FEE_SRC_X + FEE_SRC_W / 2}
            y={FEE_SRC_Y + FEE_SRC_H / 2 + 34}
            textAnchor="middle"
            fontSize="10"
            fill="var(--c-ink-3)"
          >
            {c.feeFlowSourceNote}
          </text>
          {ribbons.map((r) => (
            <path key={r.id} d={r.d} fill={r.color} opacity={0.5} />
          ))}
          {bars.map((b) => (
            <rect key={b.id} x={FEE_TARGET_X} y={b.y} width="10" height={b.h} rx="2" fill={b.color} />
          ))}
          {labels.map((l) => {
            const isBuyback = l.id === "treasury" || l.id === "liquidity";
            const isBurn = l.pct === 0;
            const textColor = l.pct > 0 ? (SLICE_COLOR[l.id] ?? "var(--c-ink)") : "var(--c-ink-3)";
            return (
              <g key={l.id}>
                <text x={FEE_TARGET_X + 20} y={l.y + 5} fontSize="15" fontWeight="700" fill={textColor}>
                  {l.pct}%
                </text>
                <text x={FEE_TARGET_X + 62} y={l.y + 5} fontSize="12.5" fontWeight="600" fill="var(--c-ink-2)">
                  {names[l.id] ?? l.id}
                  {isBurn ? ` — ${c.feeFlowBurnNote}` : ""}
                </text>
                {isBuyback ? (
                  <text x={FEE_FLOW_W - 10} y={l.y + 4} textAnchor="end" fontSize="11" fill="var(--c-warm)">
                    {c.feeFlowBuybackTag}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </LazyMount>
  );
}

/* ── 3. Buyback loop ──────────────────────────────────────────────────────── */

function LoopBox({ label, color, highlight = false }: { label: string; color: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-center text-sm font-semibold ${
        highlight ? "border-brand/40 bg-brand text-brand-ink" : "border-line bg-canvas-2 text-ink"
      }`}
    >
      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: highlight ? "currentColor" : color }} aria-hidden="true" />
      {label}
    </div>
  );
}

function LoopArrow() {
  return (
    <svg viewBox="0 0 40 24" className="h-6 w-10 shrink-0 rotate-90 text-ink-3 sm:rotate-0" aria-hidden="true">
      <path d="M2 12h30" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M26 5l10 7-10 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BuybackLoop({ copy }: { copy: LitepaperCopy }) {
  const c = copy.charts;
  const treasuryPct = NETWORK_FEE_SPLIT.find((s) => s.id === "treasury")?.pct ?? 0;
  const liquidityPct = NETWORK_FEE_SPLIT.find((s) => s.id === "liquidity")?.pct ?? 0;

  return (
    <LazyMount testId="litepaper-buyback-loop" minHeight={180}>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-2">{c.buybackLead}</p>
        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div className="flex flex-col gap-3">
            <LoopBox color="var(--c-violet)" label={`${c.buybackTreasuryLabel} ${treasuryPct}%`} />
            <LoopBox color="var(--c-warm)" label={`${c.buybackLiquidityLabel} ${liquidityPct}%`} />
          </div>
          <LoopArrow />
          <LoopBox highlight color="var(--c-brand)" label={c.buybackTargetLabel} />
        </div>
      </div>
    </LazyMount>
  );
}

/* ── 4. Team & founders vesting ───────────────────────────────────────────── */

const TEAM_HORIZON_MONTHS = 24;

function useTeamVestingSeries() {
  return useMemo(() => {
    const team = GENESIS_ALLOCATIONS.find((b) => b.id === "team");
    const amount = team?.amountPpl ?? 1;
    const series = Array.from(
      { length: TEAM_HORIZON_MONTHS + 1 },
      (_, m) => cumulativeUnlockPpl("team", m) / amount,
    );
    const firstVestMonth = series.findIndex((v, i) => i > 0 && v > 0);
    const cliffEnd = Math.max(0, (firstVestMonth === -1 ? TEAM_HORIZON_MONTHS : firstVestMonth) - 1);
    return { series, cliffEnd, pct: team?.pct ?? 0 };
  }, []);
}

export function TeamVestingChart({ copy }: { copy: LitepaperCopy }) {
  const c = copy.charts;
  const { series, cliffEnd, pct } = useTeamVestingSeries();
  const W = 320;
  const H = 180;
  const px = 36;
  const py = 14;
  const pw = W - 50;
  const ph = H - 50;
  const x = (m: number) => px + (pw * m) / TEAM_HORIZON_MONTHS;
  const y = (v: number) => py + ph * (1 - v);
  const points = series.map((v, m) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = Array.from(new Set([0, cliffEnd, 12, 18, TEAM_HORIZON_MONTHS])).sort((a, b) => a - b);
  const caption = fill(c.vestingCaption, {
    pct,
    cliff: cliffEnd,
    vest: TEAM_HORIZON_MONTHS - cliffEnd,
    total: TEAM_HORIZON_MONTHS,
  });

  return (
    <LazyMount testId="litepaper-team-vesting" minHeight={260}>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xs" role="img" aria-label={c.vestingTitle}>
          <rect x={px} y={py} width={pw} height={ph} fill="none" stroke="var(--c-line)" />
          {[0.5, 1].map((v) => (
            <line key={v} x1={px} x2={px + pw} y1={y(v)} y2={y(v)} stroke="var(--c-line)" strokeDasharray="3 3" />
          ))}
          {[0, 0.5, 1].map((v) => (
            <text key={v} x={px - 6} y={y(v) + 4} textAnchor="end" fontSize="9" fill="var(--c-ink-3)">
              {Math.round(v * 100)}%
            </text>
          ))}
          {cliffEnd > 0 ? (
            <>
              <rect x={x(0)} y={py} width={x(cliffEnd) - x(0)} height={ph} fill="var(--c-warm)" opacity={0.08} />
              <text x={(x(0) + x(cliffEnd)) / 2} y={py + 14} textAnchor="middle" fontSize="9" fill="var(--c-warm)">
                {c.vestingCliffLabel}
              </text>
            </>
          ) : null}
          <polyline points={points} fill="none" stroke="var(--c-warm)" strokeWidth="2.5" />
          <circle cx={x(cliffEnd)} cy={y(series[cliffEnd] ?? 0)} r="3" fill="var(--c-warm)" />
          {ticks.map((m) => (
            <text key={m} x={x(m)} y={py + ph + 16} textAnchor="middle" fontSize="9" fill="var(--c-ink-3)">
              {m}
              {c.vestingMonthSuffix}
            </text>
          ))}
        </svg>
        <p className="mt-3 text-xs text-ink-3">{caption}</p>
      </div>
    </LazyMount>
  );
}

/* ── 5. Founders payout bar ───────────────────────────────────────────────── */

export function FoundersPayoutBar({ copy }: { copy: LitepaperCopy }) {
  const c = copy.charts;
  const instantPct = REFERRAL_INSTANT_UNLOCK_BPS / 100;
  const weeks = REFERRAL_VEST_WEEKS;
  const restPct = 100 - instantPct;
  const atOnceW = (640 * instantPct) / 100;
  const sliceAreaW = 640 - atOnceW;
  const sliceW = sliceAreaW / weeks;

  return (
    <LazyMount testId="litepaper-founders-payout" minHeight={130}>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between text-xs text-ink-3">
          <span>{c.payoutAtOnceLabel}</span>
          <span>{fill(c.payoutWeeklyLabel, { pct: restPct })}</span>
        </div>
        <svg viewBox="0 0 640 60" className="mt-2 w-full" role="img" aria-label={c.payoutTitle}>
          <rect x="0" y="10" width={Math.max(0, atOnceW - 3)} height="30" rx="5" fill="var(--c-brand)" />
          <text x={atOnceW / 2} y="29" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--c-brand-ink)">
            {instantPct}%
          </text>
          {Array.from({ length: weeks }, (_, i) => {
            const op = 0.35 + 0.65 * (i / Math.max(1, weeks - 1));
            const sx = atOnceW + i * sliceW;
            return <rect key={i} x={sx} y="10" width={Math.max(sliceW - 1.4, 0.5)} height="30" rx="1.5" fill="var(--c-brand-2)" opacity={op} />;
          })}
        </svg>
        <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
          <span>{c.payoutWeek1}</span>
          <span>{fill(c.payoutWeekLast, { n: weeks })}</span>
        </div>
      </div>
    </LazyMount>
  );
}

/* ── 6. Roadmap timeline ──────────────────────────────────────────────────── */

export function RoadmapTimeline({ copy }: { copy: LitepaperCopy }) {
  const c = copy.charts;
  return (
    <LazyMount testId="litepaper-roadmap" minHeight={220}>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-2">{c.roadmapLead}</p>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {c.roadmapStages.map((stage, i) => (
            <li key={stage.title} className="rounded-2xl border border-line bg-canvas-2 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/10 font-mono text-xs font-bold text-brand">
                  {i}
                </span>
                {i === 0 ? (
                  <span className="rounded-full bg-value/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-value">
                    {c.roadmapNowBadge}
                  </span>
                ) : null}
              </div>
              <h4 className="mt-3 text-sm font-bold text-ink">{stage.title}</h4>
              <p className="mt-1 text-xs text-ink-2">{stage.body}</p>
              <p className="mt-3 text-[11px] font-medium text-warm">{stage.gate}</p>
            </li>
          ))}
        </ol>
      </div>
    </LazyMount>
  );
}

/* ── 7. Verification levels ───────────────────────────────────────────────── */

export function VerificationLevels({ copy }: { copy: LitepaperCopy }) {
  const c = copy.charts;
  const pctForIndex = [0, VERIFICATION_POINTS_FACTOR_TELEGRAM * 100, VERIFICATION_POINTS_FACTOR_FULL * 100];

  return (
    <LazyMount testId="litepaper-verification-levels" minHeight={210}>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink-2">{c.verificationLead}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {c.verificationLevels.map((lvl, i) => (
            <div key={lvl.level} className="rounded-2xl border border-line bg-canvas-2 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{lvl.level}</p>
              <h4 className="mt-2 text-sm font-bold text-ink">{lvl.title}</h4>
              <p className="mt-1 text-xs text-ink-2">{lvl.body}</p>
              <p className="mt-3 font-mono text-lg font-bold text-ink">{pctForIndex[i]}%</p>
            </div>
          ))}
        </div>
      </div>
    </LazyMount>
  );
}

/* ── 8. How we differ ─────────────────────────────────────────────────────── */

export function DifferTable({ copy, lang }: { copy: LitepaperCopy; lang: Language }) {
  const c = copy.charts;
  const names = tokenomicsCopy[lang].feeSliceLabels;
  const burnPct = NETWORK_FEE_SPLIT.find((s) => s.id === "burn")?.pct ?? 0;
  const feeSplit = NETWORK_FEE_SPLIT.filter((s) => s.pct > 0)
    .map((s) => `${names[s.id] ?? s.id} ${s.pct}`)
    .join(" · ");
  const rows = c.differRows.map((row) => ({
    ...row,
    people: fill(row.people, { burnPct, feeSplit, communityPct: TOKEN_COMMUNITY_ALLOCATION_PCT }),
  }));

  return (
    <LazyMount testId="litepaper-differ-table" minHeight={260}>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              <th className="border-b border-line px-4 py-3 text-left font-semibold text-ink-3" />
              {c.differHeaders.map((h, i) => (
                <th
                  key={h}
                  className={`border-b border-line px-4 py-3 text-left font-semibold ${i === 2 ? "text-brand" : "text-ink"}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="odd:bg-surface even:bg-surface-2/60">
                <td className="border-b border-line px-4 py-3 align-top font-semibold text-ink">{row.label}</td>
                <td className="border-b border-line px-4 py-3 align-top text-ink-2">{row.ethereum}</td>
                <td className="border-b border-line px-4 py-3 align-top text-ink-2">{row.solana}</td>
                <td className="border-b border-line px-4 py-3 align-top font-semibold text-ink">{row.people}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LazyMount>
  );
}
