import { NextResponse } from "next/server";
import { getDbReady, isDatabaseConfigured } from "@/db";
import { parseAnalyticsRange } from "@/lib/analytics/aggregate";
import { queryAnalyticsGaDashboard } from "@/lib/analytics/aggregate-ga";
import { canViewAnalyticsDashboardRequest } from "@/lib/analytics/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(section: string, key: string, value: string | number) {
  return [section, csvEscape(key), value].join(",");
}

export async function GET(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await canViewAnalyticsDashboardRequest(req))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const preset = url.searchParams.get("preset");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const section = url.searchParams.get("section") ?? "all";
  const journeyFrom = url.searchParams.get("journeyFrom");

  let ranges;
  try {
    ranges = parseAnalyticsRange(preset, from, to);
  } catch {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  const db = await getDbReady();
  const data = await queryAnalyticsGaDashboard(db, ranges.range, ranges.compare, journeyFrom);

  const lines: string[] = ["section,key,value"];

  const include = (name: string) => section === "all" || section === name;

  if (include("kpi") || include("all")) {
    lines.push(row("kpi", "users", data.kpis.uniqueVisitors));
    lines.push(row("kpi", "new_users", data.overview.newUsers));
    lines.push(row("kpi", "returning_users", data.overview.returningUsers));
    lines.push(row("kpi", "sessions", data.kpis.sessions));
    lines.push(row("kpi", "pageviews", data.kpis.pageviews));
    lines.push(row("kpi", "avg_engagement_sec", data.kpis.avgSessionDurationSec.toFixed(1)));
    lines.push(row("kpi", "bounce_rate", data.kpis.bounceRate.toFixed(4)));
    lines.push(row("kpi", "engagement_rate", data.overview.engagementRate.toFixed(4)));
    lines.push(row("kpi", "pages_per_session", data.kpis.pagesPerSession.toFixed(2)));
  }

  if (include("realtime_pages") || include("all")) {
    for (const r of data.realtime.livePages) lines.push(row("realtime_page", r.path, r.activeSessions));
  }
  if (include("realtime_countries") || include("all")) {
    for (const r of data.realtime.liveCountries) lines.push(row("realtime_country", r.country, r.activeSessions));
  }
  if (include("countries") || include("all")) {
    for (const r of data.countries) lines.push(row("country", r.country, r.sessions));
  }
  if (include("regions") || include("all")) {
    for (const r of data.geography.regions) lines.push(row("region", `${r.region}|${r.country}`, r.sessions));
  }
  if (include("cities") || include("all")) {
    for (const r of data.cities) lines.push(row("city", `${r.city}|${r.country}`, r.sessions));
  }
  if (include("channels") || include("all")) {
    for (const r of data.acquisition.channels) lines.push(row("channel", r.channel, r.sessions));
  }
  if (include("source_medium") || include("all")) {
    for (const r of data.acquisition.sourceMedium)
      lines.push(row("source_medium", `${r.source}|${r.medium}`, r.sessions));
  }
  if (include("pages_engagement") || include("all")) {
    for (const r of data.engagement.pages)
      lines.push(row("page", r.path, `${r.views}|users=${r.users}|exit=${r.exitRate.toFixed(3)}`));
  }
  if (include("events") || include("all")) {
    for (const r of data.engagement.namedEvents) lines.push(row("event", r.name, r.count));
  }
  if (include("journey") || include("all")) {
    for (const r of data.journey.nextPages) lines.push(row("journey_next", r.path, r.transitions));
  }
  if (include("retention_cohorts") || include("all")) {
    for (const r of data.conversions.retentionCohorts)
      lines.push(row("cohort", `${r.cohortWeek}|w${r.weekOffset}`, `${r.users}|${r.retentionRate.toFixed(4)}`));
  }

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="analytics-${section}.csv"`,
    },
  });
}
