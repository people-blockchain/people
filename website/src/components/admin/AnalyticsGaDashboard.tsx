"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyticsGaDashboard } from "@/lib/analytics/aggregate-ga";
import { FunnelChart, SimpleBarChart, SimplePieChart, TimeSeriesArea } from "./analytics/AnalyticsCharts";
import { WorldChoropleth } from "./analytics/WorldChoropleth";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
] as const;

const TABS = [
  "Realtime",
  "Overview",
  "Acquisition",
  "Geography",
  "Tech",
  "Engagement",
  "Conversions",
  "Journey",
] as const;

type Tab = (typeof TABS)[number];

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function delta(cur: number, prev?: number): string | null {
  if (prev == null || prev === 0) return null;
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs prev`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

function DataTable({
  title,
  rows,
  columns,
  exportSection,
  onExport,
}: {
  title: string;
  rows: Record<string, string | number>[];
  columns: { key: string; label: string }[];
  exportSection: string;
  onExport: (section: string) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <button
          type="button"
          className="text-xs font-medium text-brand hover:underline"
          onClick={() => onExport(exportSection)}
        >
          CSV
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-ink-3">
              {columns.map((c) => (
                <th key={c.key} className="py-2 pe-3 font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-3 text-ink-3">
                  No data in range.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pe-3 text-ink-2">
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnalyticsGaDashboard({ readOnly }: { readOnly?: boolean }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [journeyFrom, setJourneyFrom] = useState("/");
  const [data, setData] = useState<AnalyticsGaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const qs = new URLSearchParams();
    if (customFrom && customTo) {
      qs.set("from", new Date(customFrom).toISOString());
      qs.set("to", new Date(customTo).toISOString());
    } else {
      qs.set("preset", preset);
    }
    if (journeyFrom.trim()) qs.set("journeyFrom", journeyFrom.trim());
    return qs.toString();
  }, [preset, customFrom, customTo, journeyFrom]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?${query}`, { credentials: "include" });
      if (!res.ok) {
        setError("Unable to load analytics.");
        setData(null);
        return;
      }
      setData((await res.json()) as AnalyticsGaDashboard);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "Realtime") return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [tab, load]);

  async function exportCsv(section: string) {
    const res = await fetch(`/api/admin/analytics/export?${query}&section=${encodeURIComponent(section)}`, {
      credentials: "include",
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${section}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Visitor analytics</h1>
          <p className="mt-1 text-sm text-ink-2">First-party GA-style reporting (bots excluded from KPIs).</p>
          {readOnly || data?.readOnly ? <p className="mt-1 text-xs text-ink-3">Read-only stats link</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportCsv("all")}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Export all CSV
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-brand bg-brand/10 px-4 py-2 text-sm font-medium text-brand"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setCustomFrom("");
              setCustomTo("");
              setPreset(p.id);
            }}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              preset === p.id && !customFrom ? "border-brand bg-brand/10 text-brand" : "border-line text-ink-2"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1" />
          <span className="text-ink-3">→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1" />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? <p className="mt-8 text-sm text-ink-3">Loading…</p> : null}
      {error ? <p className="mt-8 text-sm text-warm">{error}</p> : null}

      {data && !loading ? (
        <>
          {tab === "Realtime" ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Active (5 min)" value={String(data.realtime.active5Min)} />
                <Kpi label="Active (30 min)" value={String(data.realtime.active30Min)} />
                <Kpi label="Live pages" value={String(data.realtime.livePages.length)} />
                <Kpi label="Live countries" value={String(data.realtime.liveCountries.length)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <DataTable
                  title="Live pages"
                  exportSection="realtime_pages"
                  onExport={exportCsv}
                  columns={[
                    { key: "path", label: "Path" },
                    { key: "activeSessions", label: "Sessions" },
                  ]}
                  rows={data.realtime.livePages}
                />
                <DataTable
                  title="Live countries"
                  exportSection="realtime_countries"
                  onExport={exportCsv}
                  columns={[
                    { key: "country", label: "Country" },
                    { key: "activeSessions", label: "Sessions" },
                  ]}
                  rows={data.realtime.liveCountries}
                />
              </div>
            </div>
          ) : null}

          {tab === "Overview" ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Users" value={String(data.kpis.uniqueVisitors)} hint={delta(data.kpis.uniqueVisitors, data.compare?.uniqueVisitors)} />
                <Kpi label="New users" value={String(data.overview.newUsers)} />
                <Kpi label="Returning users" value={String(data.overview.returningUsers)} />
                <Kpi label="Sessions" value={String(data.kpis.sessions)} hint={delta(data.kpis.sessions, data.compare?.sessions)} />
                <Kpi label="Page views" value={String(data.kpis.pageviews)} hint={delta(data.kpis.pageviews, data.compare?.pageviews)} />
                <Kpi label="Avg engagement" value={fmtDuration(data.kpis.avgSessionDurationSec)} />
                <Kpi label="Engagement rate" value={pct(data.overview.engagementRate)} />
                <Kpi label="Bounce rate" value={pct(data.kpis.bounceRate)} />
                <Kpi label="Pages / session" value={data.kpis.pagesPerSession.toFixed(2)} />
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-bold text-ink">Daily trend</h3>
                <TimeSeriesArea data={data.timeseries} dataKey="pageviews" label="Page views" />
              </div>
              {data.overview.hourly.length ? (
                <div className="rounded-xl border border-line bg-surface p-4">
                  <h3 className="text-sm font-bold text-ink">Hourly trend</h3>
                  <TimeSeriesArea data={data.overview.hourly} dataKey="sessions" label="Sessions" />
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "Acquisition" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4 lg:col-span-2">
                <h3 className="text-sm font-bold text-ink">Default channel grouping</h3>
                <SimpleBarChart data={data.acquisition.channels} xKey="channel" yKey="sessions" layout="horizontal" />
              </div>
              <DataTable title="Source / medium" exportSection="source_medium" onExport={exportCsv} columns={[{ key: "source", label: "Source" }, { key: "medium", label: "Medium" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.sourceMedium} />
              <DataTable title="UTM campaigns" exportSection="utm_campaigns" onExport={exportCsv} columns={[{ key: "campaign", label: "Campaign" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.utmCampaigns} />
              <DataTable title="UTM terms" exportSection="utm_terms" onExport={exportCsv} columns={[{ key: "term", label: "Term" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.utmTerms} />
              <DataTable title="UTM content" exportSection="utm_content" onExport={exportCsv} columns={[{ key: "content", label: "Content" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.utmContents} />
              <DataTable title="Referrer domains" exportSection="referrer_domains" onExport={exportCsv} columns={[{ key: "domain", label: "Domain" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.referrerDomains} />
              <DataTable title="Landing pages" exportSection="landing_pages" onExport={exportCsv} columns={[{ key: "path", label: "Path" }, { key: "sessions", label: "Sessions" }]} rows={data.acquisition.landingPages} />
            </div>
          ) : null}

          {tab === "Geography" ? (
            <div className="mt-6 space-y-6">
              <div className="overflow-hidden rounded-xl border border-line bg-surface p-2">
                <WorldChoropleth values={data.geography.mapCountries} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <DataTable title="Countries" exportSection="countries" onExport={exportCsv} columns={[{ key: "country", label: "Country" }, { key: "sessions", label: "Sessions" }]} rows={data.countries} />
                <DataTable title="Regions" exportSection="regions" onExport={exportCsv} columns={[{ key: "region", label: "Region" }, { key: "country", label: "Country" }, { key: "sessions", label: "Sessions" }]} rows={data.geography.regions} />
                <DataTable title="Cities" exportSection="cities" onExport={exportCsv} columns={[{ key: "city", label: "City" }, { key: "country", label: "Country" }, { key: "sessions", label: "Sessions" }]} rows={data.cities} />
              </div>
            </div>
          ) : null}

          {tab === "Tech" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-bold text-ink">Devices</h3>
                <SimplePieChart data={data.devices} nameKey="device" valueKey="sessions" />
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-bold text-ink">Browsers</h3>
                <SimplePieChart data={data.browsers} nameKey="browser" valueKey="sessions" />
              </div>
              <DataTable title="Operating systems" exportSection="os" onExport={exportCsv} columns={[{ key: "os", label: "OS" }, { key: "sessions", label: "Sessions" }]} rows={data.os} />
              <DataTable title="Screen resolution" exportSection="screen_resolution" onExport={exportCsv} columns={[{ key: "resolution", label: "Resolution" }, { key: "sessions", label: "Sessions" }]} rows={data.tech.screenResolutions} />
              <DataTable title="Languages" exportSection="languages" onExport={exportCsv} columns={[{ key: "language", label: "Language" }, { key: "sessions", label: "Sessions" }]} rows={data.languages} />
            </div>
          ) : null}

          {tab === "Engagement" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <DataTable
                  title="Pages & screens"
                  exportSection="pages_engagement"
                  onExport={exportCsv}
                  columns={[
                    { key: "path", label: "Path" },
                    { key: "views", label: "Views" },
                    { key: "users", label: "Users" },
                    { key: "avg", label: "Avg time" },
                    { key: "entrances", label: "Entrances" },
                    { key: "exits", label: "Exits" },
                    { key: "exitRate", label: "Exit rate" },
                  ]}
                  rows={data.engagement.pages.map((p) => ({
                    path: p.path,
                    views: p.views,
                    users: p.users,
                    avg: fmtDuration(p.avgTimeSec),
                    entrances: p.entrances,
                    exits: p.exits,
                    exitRate: pct(p.exitRate),
                  }))}
                />
              </div>
              <DataTable title="Scroll depth" exportSection="scroll_depth" onExport={exportCsv} columns={[{ key: "milestone", label: "Milestone" }, { key: "events", label: "Events" }]} rows={data.engagement.scrollDepth} />
              <DataTable title="Outbound clicks" exportSection="outbound" onExport={exportCsv} columns={[{ key: "href", label: "URL" }, { key: "clicks", label: "Clicks" }]} rows={data.engagement.outboundClicks} />
              <DataTable title="File downloads" exportSection="downloads" onExport={exportCsv} columns={[{ key: "href", label: "File" }, { key: "downloads", label: "Downloads" }]} rows={data.engagement.fileDownloads} />
              <DataTable title="Site search" exportSection="site_search" onExport={exportCsv} columns={[{ key: "query", label: "Query" }, { key: "searches", label: "Searches" }]} rows={data.engagement.siteSearches} />
              <DataTable title="Events" exportSection="events" onExport={exportCsv} columns={[{ key: "name", label: "Event" }, { key: "count", label: "Count" }]} rows={data.engagement.namedEvents} />
            </div>
          ) : null}

          {tab === "Conversions" ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-bold text-ink">Founders funnel</h3>
                <FunnelChart steps={data.conversions.foundersFunnel} />
              </div>
              <div className="rounded-xl border border-line bg-surface p-4">
                <h3 className="text-sm font-bold text-ink">Buy funnel</h3>
                <FunnelChart steps={data.conversions.buyFunnel} />
              </div>
              <div className="lg:col-span-2">
                <DataTable
                  title="Weekly retention cohorts"
                  exportSection="retention_cohorts"
                  onExport={exportCsv}
                  columns={[
                    { key: "cohortWeek", label: "Cohort week" },
                    { key: "weekOffset", label: "Week +" },
                    { key: "users", label: "Users" },
                    { key: "retentionRate", label: "Retention" },
                  ]}
                  rows={data.conversions.retentionCohorts.map((r) => ({
                    cohortWeek: r.cohortWeek,
                    weekOffset: r.weekOffset,
                    users: r.users,
                    retentionRate: pct(r.retentionRate),
                  }))}
                />
              </div>
            </div>
          ) : null}

          {tab === "Journey" ? (
            <div className="mt-6 space-y-4">
              <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                From page
                <input
                  value={journeyFrom}
                  onChange={(e) => setJourneyFrom(e.target.value)}
                  className="min-w-[240px] rounded-lg border border-line bg-surface px-2 py-1 font-mono text-sm"
                />
                <button type="button" className="rounded-full border border-brand px-3 py-1 text-sm text-brand" onClick={() => void load()}>
                  Apply
                </button>
              </label>
              <DataTable
                title={`Next pages from ${data.journey.fromPath ?? journeyFrom}`}
                exportSection="journey"
                onExport={exportCsv}
                columns={[
                  { key: "path", label: "Next page" },
                  { key: "transitions", label: "Transitions" },
                ]}
                rows={data.journey.nextPages}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
