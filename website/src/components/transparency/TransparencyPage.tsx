"use client";

/**
 * /transparency — "Team & transparency".
 *
 * Split in two halves: a fixed editorial part (funding, team, supply split, treasury,
 * audit slot, launch order) written in EN/RU, and a live part fed only by real rows.
 * Every live block disappears when its source has no data — the page never renders a
 * placeholder figure.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { transparencyCopy } from "@/lib/transparency-content";
import { GENESIS_ALLOCATIONS, formatPpl } from "@/lib/tokenomics";
import { tokenomicsCopy } from "@/lib/tokenomics-content";
import { FOUNDER_COUNTRY_OPTIONS, countryFlagEmoji } from "@/lib/founders/countries";
import { visibleAssets, visibleNfts } from "@/lib/hidden-assets";
import { networkJson } from "@/lib/network-client";
import { Reveal } from "@/components/motion/Reveal";
import {
  CountUpNumber,
  WARM_SECONDARY_BTN,
  WarmCtaLink,
  WarmSection,
} from "@/components/warm/warm-ui";

type Counters = { verifiedPeople: number; countries: number };

type AmbassadorRow = {
  founderNumber: number;
  walletShort: string;
  verifiedInvitees: number;
  ambassador: boolean;
  name: string | null;
  avatar: string | null;
};

type TransparencyPayload = { counters: Counters; ambassadors: AmbassadorRow[] };

type LookupFounder = {
  founderNumber: number;
  walletShort: string;
  countryCode: string;
  registeredAt: string;
  verified: boolean;
  optedIn: boolean;
  name: string | null;
  avatar: string | null;
};

type MonthlyReport = {
  month: string;
  newVerifiedPeople: number;
  topCountries: { countryCode: string; count: number }[];
  launches: { id: string; title: string }[];
};

/** Protocol-owned assets are not "created" by the community: native PPL and the seeded test USDT. */
const NON_CREATED_ASSETS = new Set(["ppl", "usdt"]);

const countryName = (code: string) =>
  FOUNDER_COUNTRY_OPTIONS.find((option) => option.code === code)?.name ?? code;

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].hero;
  return (
    <section className="relative overflow-hidden" data-testid="transparency-hero">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_20%_0%,rgba(3,105,161,0.16),transparent_70%)] dark:bg-[radial-gradient(60%_60%_at_20%_0%,rgba(76,196,248,0.18),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 pb-4 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warm">{t.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-[2rem] font-bold leading-[1.1] text-ink sm:text-5xl lg:text-[3.4rem]">
          {t.title}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-ink-2 sm:text-lg">{t.lead}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <WarmCtaLink href="/tokenomics" variant="primary" testId="transparency-cta-tokenomics">
            {transparencyCopy[lang].tokenomics.linkCta} →
          </WarmCtaLink>
          <Link href="/explorer" className={WARM_SECONDARY_BTN}>
            {t.secondaryCta} →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Fixed editorial blocks ───────────────────────────────────────────────── */

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm text-ink-2 sm:text-base">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ProseSection({
  id,
  tone,
  eyebrow,
  title,
  body,
  points,
}: {
  id: string;
  tone?: "canvas" | "canvas-2";
  eyebrow: string;
  title: string;
  body: string;
  points?: string[];
}) {
  return (
    <WarmSection id={id} tone={tone} eyebrow={eyebrow} title={title} testId={`transparency-${id}`}>
      <Reveal>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink-2 sm:text-lg">{body}</p>
        {points ? <BulletList items={points} /> : null}
      </Reveal>
    </WarmSection>
  );
}

function TokenomicsSection() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].tokenomics;
  const labels = tokenomicsCopy[lang].bucketLabels;
  const buckets = useMemo(
    () =>
      GENESIS_ALLOCATIONS.map((bucket) => ({
        id: bucket.id,
        pct: bucket.pct,
        color: bucket.color,
        label: labels[bucket.id],
        amount: `${formatPpl(bucket.amountPpl)} PPL`,
      })),
    [labels],
  );

  return (
    <WarmSection
      id="tokenomics"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      testId="transparency-tokenomics"
    >
      <Reveal>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            {t.supplyLabel}
          </span>
          <span className="font-mono text-xl font-bold tabular-nums text-ink sm:text-2xl">
            {t.supplyValue}
          </span>
        </div>
      </Reveal>

      <Reveal>
        <h3 className="mt-8 text-base font-semibold text-ink">{t.splitTitle}</h3>
        <p className="mt-1 text-sm text-ink-3">{t.splitLead}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="transparency-split">
          {buckets.map((bucket) => (
            <li
              key={bucket.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: bucket.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{bucket.label}</span>
                <span className="block font-mono text-xs text-ink-3">{bucket.amount}</span>
              </span>
              <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-ink">
                {bucket.pct}%
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">{t.bucketNote}</p>
      </Reveal>

      <Reveal>
        <div className="mt-8 rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
          <h3 className="text-base font-semibold text-ink">{t.vestTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm text-ink-2 sm:text-base">{t.vestBody}</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {(
              [
                [t.vestSplit.genesis, t.vestSplit.genesisPct],
                [t.vestSplit.remainder, t.vestSplit.remainderPct],
              ] as const
            ).map(([label, pct]) => (
              <div key={label} className="rounded-2xl border border-line bg-canvas-2 px-4 py-3">
                <dt className="text-xs font-medium text-ink-3">{label}</dt>
                <dd className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">{pct}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>
    </WarmSection>
  );
}

function AuditSection() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].audit;
  return (
    <WarmSection id="audit" tone="canvas-2" eyebrow={t.eyebrow} title={t.title} testId="transparency-audit">
      <Reveal>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink-2 sm:text-lg">{t.body}</p>
        {/* Placeholder slot: the report is linked here once it exists — never before. */}
        <div
          className="mt-6 flex flex-col items-start gap-1 rounded-[28px] border-2 border-dashed border-line-strong bg-surface px-6 py-6"
          data-testid="transparency-audit-slot"
        >
          <p className="text-sm font-semibold text-ink">{t.placeholderTitle}</p>
          <p className="text-sm text-ink-2">{t.placeholderBody}</p>
        </div>
      </Reveal>
    </WarmSection>
  );
}

function LaunchSection() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].launch;
  return (
    <WarmSection id="launch" eyebrow={t.eyebrow} title={t.title} lead={t.lead} testId="transparency-launch">
      <ol className="mt-8 grid gap-4 sm:grid-cols-2">
        {t.steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 90}>
            <li className="h-full rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
              <span className="font-mono text-sm font-semibold text-ink-3">0{index + 1}</span>
              <h3 className="mt-3 text-lg font-bold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm text-ink-2">{step.body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </WarmSection>
  );
}

/* ── Live blocks ──────────────────────────────────────────────────────────── */

function CounterTile({ label, value, testId }: { label: string; value: number; testId: string }) {
  const { lang } = useLanguage();
  return (
    <div
      className="rounded-3xl border border-line bg-surface px-5 py-5 shadow-[var(--elev-1)]"
      data-testid={testId}
    >
      <p className="font-mono text-3xl font-bold tabular-nums text-ink sm:text-4xl">
        <CountUpNumber value={value} lang={lang} />
      </p>
      <p className="mt-2 text-sm font-medium text-ink-2">{label}</p>
    </div>
  );
}

function CommunitySection({
  payload,
  created,
}: {
  payload: TransparencyPayload | null;
  created: { tokens: number | null; nfts: number | null };
}) {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].community;
  const tiles: { key: string; label: string; value: number }[] = [];
  if (payload) {
    tiles.push({ key: "verified", label: t.verified, value: payload.counters.verifiedPeople });
    tiles.push({ key: "countries", label: t.countries, value: payload.counters.countries });
  }
  if (created.tokens !== null) tiles.push({ key: "tokens", label: t.tokens, value: created.tokens });
  if (created.nfts !== null) tiles.push({ key: "nfts", label: t.nfts, value: created.nfts });

  // No source answered: the whole block stays off the page rather than showing zeros.
  if (tiles.length === 0) return null;

  return (
    <WarmSection
      id="community"
      tone="canvas-2"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      testId="transparency-community"
    >
      <Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <CounterTile
              key={tile.key}
              label={tile.label}
              value={tile.value}
              testId={`transparency-counter-${tile.key}`}
            />
          ))}
        </div>
      </Reveal>
    </WarmSection>
  );
}

function AmbassadorsSection({ payload }: { payload: TransparencyPayload | null }) {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].ambassadors;
  const rows = payload?.ambassadors ?? [];
  // Empty source → no leaderboard. An empty list of names is not a report.
  if (!payload || rows.length === 0) return null;

  return (
    <WarmSection
      id="ambassadors"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      testId="transparency-ambassadors"
    >
      <Reveal>
        <ol className="mt-8 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {rows.map((row, index) => (
            <li
              key={row.founderNumber}
              className="flex items-center gap-3 px-4 py-3 sm:px-5"
              data-testid="transparency-ambassador-row"
            >
              <span className="w-8 shrink-0 font-mono text-xs text-ink-3">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">
                    #{row.founderNumber.toLocaleString(lang)}
                  </span>
                  {row.ambassador ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      {t.ambassadorBadge}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">
                  {row.walletShort}
                </span>
                {row.name ? <span className="block text-xs text-ink-2">{row.name}</span> : null}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-base font-bold tabular-nums text-ink">
                  {row.verifiedInvitees.toLocaleString(lang)}
                </span>
                <span className="block text-[11px] text-ink-3">{t.invites}</span>
              </span>
            </li>
          ))}
        </ol>
      </Reveal>
    </WarmSection>
  );
}

const INPUT_CLASS =
  "w-full rounded-2xl border border-line bg-surface px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none";

function LookupSection() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].search;
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LookupFounder | null>(null);
  const [status, setStatus] = useState<"idle" | "not_found" | "error">("idle");

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const q = query.trim();
      if (!q || busy) return;
      setBusy(true);
      setStatus("idle");
      setResult(null);
      try {
        const res = await fetch(`/api/founders/lookup?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as { founder?: LookupFounder };
          if (body.founder) setResult(body.founder);
          else setStatus("error");
        } else if (res.status === 404) {
          setStatus("not_found");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      } finally {
        setBusy(false);
      }
    },
    [busy, query],
  );

  return (
    <WarmSection
      id="lookup"
      tone="canvas-2"
      eyebrow={t.eyebrow}
      title={t.title}
      lead={t.lead}
      testId="transparency-lookup"
    >
      <Reveal>
        <form className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={submit}>
          <label className="sr-only" htmlFor="transparency-lookup-input">
            {t.placeholder}
          </label>
          <input
            id="transparency-lookup-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.placeholder}
            inputMode="text"
            autoComplete="off"
            className={INPUT_CLASS}
          />
          <button
            type="submit"
            disabled={busy || query.trim().length === 0}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-brand-ink transition hover:brightness-110 disabled:opacity-50"
            data-testid="transparency-lookup-submit"
          >
            {t.button}
          </button>
        </form>

        {status === "not_found" ? (
          <p className="mt-4 text-sm text-ink-2" role="status" data-testid="transparency-lookup-empty">
            {t.notFound}
          </p>
        ) : null}
        {status === "error" ? (
          <p className="mt-4 text-sm text-warm" role="alert">
            {t.error}
          </p>
        ) : null}

        {result ? (
          <dl
            className="mt-5 max-w-xl rounded-3xl border border-line bg-surface p-5 shadow-[var(--elev-1)]"
            data-testid="transparency-lookup-result"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-ink-3">{t.founderLabel}</dt>
                <dd className="mt-1 font-mono text-xl font-bold text-ink">
                  #{result.founderNumber.toLocaleString(lang)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-3">{t.walletLabel}</dt>
                <dd className="mt-1 font-mono text-sm text-ink">{result.walletShort}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-3">{t.countryLabel}</dt>
                <dd className="mt-1 text-sm text-ink">
                  {countryFlagEmoji(result.countryCode)} {countryName(result.countryCode)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-3">{t.registeredLabel}</dt>
                <dd className="mt-1 text-sm text-ink">
                  {new Date(result.registeredAt).toISOString().slice(0, 10)}
                </dd>
              </div>
            </div>
            {result.name ? <p className="mt-4 text-sm font-medium text-ink">{result.name}</p> : null}
            {!result.optedIn ? (
              <p className="mt-4 text-xs text-ink-3">{t.privateNote}</p>
            ) : null}
          </dl>
        ) : null}
      </Reveal>
    </WarmSection>
  );
}

function ReportSection({
  month,
  onMonthChange,
  report,
  failed,
}: {
  month: string;
  onMonthChange: (value: string) => void;
  report: MonthlyReport | null;
  failed: boolean;
}) {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang].report;
  if (failed) return null;
  return (
    <WarmSection id="report" eyebrow={t.eyebrow} title={t.title} lead={t.lead} testId="transparency-report">
      <Reveal>
        <div className="mt-6 max-w-xs">
          <label className="text-xs font-semibold text-ink-3" htmlFor="transparency-report-month">
            {t.monthLabel}
          </label>
          <input
            id="transparency-report-month"
            type="month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className={`${INPUT_CLASS} mt-1`}
          />
        </div>
      </Reveal>
      {report ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3" data-testid="transparency-report-body">
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              {t.growthLabel}
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-ink">
              <CountUpNumber value={report.newVerifiedPeople} lang={lang} />
            </p>
            <p className="mt-1 text-sm text-ink-2">{t.newPeople}</p>
          </div>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              {t.countriesLabel}
            </p>
            {report.topCountries.length ? (
              <ul className="mt-3 space-y-2">
                {report.topCountries.map((row) => (
                  <li key={row.countryCode} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {countryFlagEmoji(row.countryCode)} {countryName(row.countryCode)}
                    </span>
                    <span className="shrink-0 font-mono text-ink-2">{row.count.toLocaleString(lang)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-3">{t.nothing}</p>
            )}
          </div>
          <div className="rounded-3xl border border-line bg-surface p-6 shadow-[var(--elev-1)]">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              {t.launchedLabel}
            </p>
            {report.launches.length ? (
              <ul className="mt-3 space-y-2">
                {report.launches.map((launch) => (
                  <li key={launch.id} className="text-sm">
                    <Link href={`/discover/${launch.id}`} className="text-brand hover:underline">
                      {launch.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-3">{t.nothing}</p>
            )}
          </div>
        </div>
      ) : null}
    </WarmSection>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function TransparencyPage() {
  const { lang } = useLanguage();
  const t = transparencyCopy[lang];
  const [payload, setPayload] = useState<TransparencyPayload | null>(null);
  const [created, setCreated] = useState<{ tokens: number | null; nfts: number | null }>({
    tokens: null,
    nfts: null,
  });
  const [month, setMonth] = useState("");
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [reportFailed, setReportFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/founders/transparency", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as TransparencyPayload) : null))
      .then((body) => {
        if (alive && body) setPayload(body);
      })
      .catch(() => {});
    // Community-created assets come from the public node, not the database.
    void networkJson<{ assetId: string }[]>("assets")
      .then((body) => {
        const list = Array.isArray(body) ? visibleAssets(body) : [];
        if (alive) {
          setCreated((current) => ({
            ...current,
            tokens: list.filter((asset) => !NON_CREATED_ASSETS.has(asset.assetId.toLowerCase())).length,
          }));
        }
      })
      .catch(() => {});
    void networkJson<{ nftId: string }[]>("nfts")
      .then((body) => {
        const list = Array.isArray(body) ? visibleNfts(body) : [];
        if (alive) setCreated((current) => ({ ...current, nfts: list.length }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The month control needs the visitor's clock, so it is chosen after mount.
  useEffect(() => {
    setMonth((current) => current || new Date().toISOString().slice(0, 7));
  }, []);

  useEffect(() => {
    if (!month) return;
    let alive = true;
    void fetch(`/api/founders/report?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { report: MonthlyReport }).report : null))
      .then((body) => {
        if (!alive) return;
        setReport(body);
        setReportFailed(!body);
      })
      .catch(() => {
        if (alive) setReportFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [month]);

  return (
    <div data-testid="transparency-page">
      <Hero />

      <ProseSection
        id="investors"
        eyebrow={t.investors.eyebrow}
        title={t.investors.title}
        body={t.investors.body}
        points={t.investors.points}
      />
      <ProseSection
        id="team"
        tone="canvas-2"
        eyebrow={t.team.eyebrow}
        title={t.team.title}
        body={t.team.body}
        points={t.team.points}
      />

      <TokenomicsSection />

      <ProseSection
        id="treasury"
        tone="canvas-2"
        eyebrow={t.treasury.eyebrow}
        title={t.treasury.title}
        body={t.treasury.body}
        points={t.treasury.points}
      />

      <AuditSection />
      <LaunchSection />

      <CommunitySection payload={payload} created={created} />
      <AmbassadorsSection payload={payload} />
      <LookupSection />
      <ReportSection
        month={month}
        onMonthChange={setMonth}
        report={report}
        failed={reportFailed}
      />

    </div>
  );
}
