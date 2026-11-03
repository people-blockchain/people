import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PartnerDb } from "@/db";
import { analyticsEvents, analyticsSessions } from "@/db/schema";
import type { AnalyticsDashboard, DateRange } from "./aggregate";
import { classifyAcquisitionChannel, referrerDomain } from "./channels";
import { FUNNEL_EVENTS } from "./constants";
import { SCROLL_DEPTH_EVENTS } from "./events-catalog";
import { sqlTimestamptz } from "./sql-timestamptz";

export type RealtimeSnapshot = {
  active5Min: number;
  active30Min: number;
  livePages: { path: string; activeSessions: number }[];
  liveCountries: { country: string; activeSessions: number }[];
};

export type GaExtensions = {
  realtime: RealtimeSnapshot;
  overview: {
    newUsers: number;
    returningUsers: number;
    engagementRate: number;
    hourly: { bucket: string; sessions: number; pageviews: number; visitors: number }[];
  };
  acquisition: {
    channels: { channel: string; sessions: number }[];
    sourceMedium: { source: string; medium: string; sessions: number }[];
    utmCampaigns: { campaign: string; sessions: number }[];
    utmTerms: { term: string; sessions: number }[];
    utmContents: { content: string; sessions: number }[];
    referrerDomains: { domain: string; sessions: number }[];
    landingPages: { path: string; sessions: number }[];
  };
  geography: {
    regions: { region: string; country: string; sessions: number }[];
    mapCountries: { countryCode: string; country: string; sessions: number }[];
  };
  tech: {
    screenResolutions: { resolution: string; sessions: number }[];
  };
  engagement: {
    pages: {
      path: string;
      views: number;
      users: number;
      avgTimeSec: number;
      entrances: number;
      exits: number;
      exitRate: number;
    }[];
    scrollDepth: { milestone: string; events: number }[];
    outboundClicks: { href: string; clicks: number }[];
    fileDownloads: { href: string; downloads: number }[];
    siteSearches: { query: string; searches: number }[];
    namedEvents: { name: string; count: number }[];
  };
  conversions: {
    foundersFunnel: { step: string; count: number; rateFromPrevious: number | null }[];
    buyFunnel: { step: string; count: number; rateFromPrevious: number | null }[];
    retentionCohorts: {
      cohortWeek: string;
      weekOffset: number;
      users: number;
      retentionRate: number;
    }[];
  };
  journey: {
    fromPath: string | null;
    nextPages: { path: string; transitions: number }[];
  };
};

export type AnalyticsGaDashboard = AnalyticsDashboard & GaExtensions & { readOnly?: boolean };

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

function sessionHumanFilter(range: DateRange) {
  return and(
    gte(analyticsSessions.startedAt, range.start),
    lt(analyticsSessions.startedAt, range.end),
    eq(analyticsSessions.isBot, false),
  );
}

function eventHumanFilter(range: DateRange) {
  return and(
    gte(analyticsEvents.createdAt, range.start),
    lt(analyticsEvents.createdAt, range.end),
    eq(analyticsEvents.isBot, false),
  );
}

function funnelRates(steps: { step: string; count: number }[]) {
  return steps.map((s, i) => ({
    ...s,
    rateFromPrevious:
      i === 0 ? null : steps[i - 1]!.count > 0 ? s.count / steps[i - 1]!.count : 0,
  }));
}

export async function queryRealtimeSnapshot(db: PartnerDb): Promise<RealtimeSnapshot> {
  const cutoff5 = new Date(Date.now() - 5 * 60 * 1000);
  const cutoff30 = new Date(Date.now() - 30 * 60 * 1000);

  const [active5, active30, livePages, liveCountries] = await Promise.all([
    db
      .select({ n: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.lastSeenAt, cutoff5), eq(analyticsSessions.isBot, false))),
    db
      .select({ n: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.lastSeenAt, cutoff30), eq(analyticsSessions.isBot, false))),
    db
      .select({ path: analyticsSessions.exitPath, activeSessions: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.lastSeenAt, cutoff5), eq(analyticsSessions.isBot, false)))
      .groupBy(analyticsSessions.exitPath)
      .orderBy(desc(count()))
      .limit(12),
    db
      .select({ country: analyticsSessions.country, activeSessions: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.lastSeenAt, cutoff5), eq(analyticsSessions.isBot, false)))
      .groupBy(analyticsSessions.country)
      .orderBy(desc(count()))
      .limit(12),
  ]);

  return {
    active5Min: Number(active5[0]?.n ?? 0),
    active30Min: Number(active30[0]?.n ?? 0),
    livePages: livePages
      .filter((r) => r.path)
      .map((r) => ({ path: r.path!, activeSessions: Number(r.activeSessions) })),
    liveCountries: liveCountries.map((r) => ({
      country: r.country || "Unknown",
      activeSessions: Number(r.activeSessions),
    })),
  };
}

export async function queryNewReturningUsers(db: PartnerDb, range: DateRange) {
  const rangeStart = sqlTimestamptz(range.start);
  const rangeEnd = sqlTimestamptz(range.end);
  const result = await db.execute(sql`
    SELECT
      count(distinct s."visitorId")::int AS total,
      count(distinct CASE WHEN EXISTS (
        SELECT 1 FROM ${analyticsSessions} s2
        WHERE s2."visitorId" = s."visitorId"
          AND s2."isBot" = false
          AND s2."startedAt" < ${rangeStart}::timestamptz
      ) THEN s."visitorId" END)::int AS returning
    FROM ${analyticsSessions} s
    WHERE s."startedAt" >= ${rangeStart}::timestamptz
      AND s."startedAt" < ${rangeEnd}::timestamptz
      AND s."isBot" = false
  `);
  const row = rowsFromExecute(result)[0] as { total: number; returning: number } | undefined;
  const total = Number(row?.total ?? 0);
  const returning = Number(row?.returning ?? 0);
  return { newUsers: Math.max(0, total - returning), returningUsers: returning };
}

export async function queryHourlyTimeseries(db: PartnerDb, range: DateRange) {
  const spanMs = range.end.getTime() - range.start.getTime();
  if (spanMs > 8 * 24 * 60 * 60 * 1000) return [];

  const sessions = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('hour', ${analyticsSessions.startedAt}), 'YYYY-MM-DD HH24:00')`,
      sessions: count(),
      visitors: sql<number>`count(distinct ${analyticsSessions.visitorId})`,
    })
    .from(analyticsSessions)
    .where(sessionHumanFilter(range))
    .groupBy(sql`date_trunc('hour', ${analyticsSessions.startedAt})`)
    .orderBy(sql`date_trunc('hour', ${analyticsSessions.startedAt})`);

  const pageviews = await db
    .select({
      bucket: sql<string>`to_char(date_trunc('hour', ${analyticsEvents.createdAt}), 'YYYY-MM-DD HH24:00')`,
      pageviews: count(),
    })
    .from(analyticsEvents)
    .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "pageview")))
    .groupBy(sql`date_trunc('hour', ${analyticsEvents.createdAt})`);

  const pvMap = new Map(pageviews.map((r) => [r.bucket, Number(r.pageviews)]));
  return sessions.map((s) => ({
    bucket: s.bucket,
    sessions: Number(s.sessions),
    visitors: Number(s.visitors),
    pageviews: pvMap.get(s.bucket) ?? 0,
  }));
}

export async function queryChannelSessions(db: PartnerDb, range: DateRange) {
  const rows = await db
    .select({
      referrer: analyticsSessions.referrer,
      utmSource: analyticsSessions.utmSource,
      utmMedium: analyticsSessions.utmMedium,
      sessions: count(),
    })
    .from(analyticsSessions)
    .where(sessionHumanFilter(range))
    .groupBy(analyticsSessions.referrer, analyticsSessions.utmSource, analyticsSessions.utmMedium);

  const map = new Map<string, number>();
  for (const row of rows) {
    const channel = classifyAcquisitionChannel({
      referrer: row.referrer,
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
    });
    map.set(channel, (map.get(channel) ?? 0) + Number(row.sessions));
  }
  return [...map.entries()]
    .map(([channel, sessions]) => ({ channel, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
}

export async function queryReferrerDomains(db: PartnerDb, range: DateRange) {
  const rows = await db
    .select({ referrer: analyticsSessions.referrer, sessions: count() })
    .from(analyticsSessions)
    .where(sessionHumanFilter(range))
    .groupBy(analyticsSessions.referrer)
    .orderBy(desc(count()))
    .limit(40);

  const map = new Map<string, number>();
  for (const row of rows) {
    const domain = referrerDomain(row.referrer);
    map.set(domain, (map.get(domain) ?? 0) + Number(row.sessions));
  }
  return [...map.entries()]
    .map(([domain, sessions]) => ({ domain, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 25);
}

export async function queryRegions(db: PartnerDb, range: DateRange) {
  return db
    .select({
      region: analyticsSessions.region,
      country: analyticsSessions.country,
      sessions: count(),
    })
    .from(analyticsSessions)
    .where(and(sessionHumanFilter(range), sql`${analyticsSessions.region} is not null and ${analyticsSessions.region} <> ''`))
    .groupBy(analyticsSessions.region, analyticsSessions.country)
    .orderBy(desc(count()))
    .limit(30);
}

export async function queryScreenResolutions(db: PartnerDb, range: DateRange) {
  return db
    .select({
      resolution: sql<string>`concat(${analyticsSessions.screenW}, 'x', ${analyticsSessions.screenH})`,
      sessions: count(),
    })
    .from(analyticsSessions)
    .where(
      and(
        sessionHumanFilter(range),
        sql`${analyticsSessions.screenW} is not null and ${analyticsSessions.screenH} is not null`,
      ),
    )
    .groupBy(analyticsSessions.screenW, analyticsSessions.screenH)
    .orderBy(desc(count()))
    .limit(20);
}

async function countCustomNamed(db: PartnerDb, range: DateRange, name: string) {
  const [row] = await db
    .select({ c: count() })
    .from(analyticsEvents)
    .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "custom"), eq(analyticsEvents.eventName, name)));
  return Number(row?.c ?? 0);
}

export async function queryScrollDepth(db: PartnerDb, range: DateRange) {
  const names = Object.values(SCROLL_DEPTH_EVENTS);
  const counts = await Promise.all(names.map((n) => countCustomNamed(db, range, n)));
  return names.map((milestone, i) => ({ milestone, events: counts[i]! }));
}

export async function queryOutboundClicks(db: PartnerDb, range: DateRange) {
  const rows = await db
    .select({
      href: sql<string>`${analyticsEvents.props}->>'href'`,
      clicks: count(),
    })
    .from(analyticsEvents)
    .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "outbound")))
    .groupBy(sql`${analyticsEvents.props}->>'href'`)
    .orderBy(desc(count()))
    .limit(25);
  return rows
    .filter((r) => r.href)
    .map((r) => ({ href: r.href!, clicks: Number(r.clicks) }));
}

export async function queryPropEvents(
  db: PartnerDb,
  range: DateRange,
  eventName: string,
  propKey: "query" | "href",
) {
  const propExpr =
    propKey === "query"
      ? sql<string>`${analyticsEvents.props}->>'query'`
      : sql<string>`${analyticsEvents.props}->>'href'`;
  const rows = await db
    .select({
      value: propExpr,
      count: count(),
    })
    .from(analyticsEvents)
    .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "custom"), eq(analyticsEvents.eventName, eventName)))
    .groupBy(propExpr)
    .orderBy(desc(count()))
    .limit(25);
  return rows.filter((r) => r.value).map((r) => ({ query: r.value!, searches: Number(r.count) }));
}

export async function queryPageEngagementTable(db: PartnerDb, range: DateRange) {
  const [views, entrances, exits, engagementMs] = await Promise.all([
    db
      .select({
        path: analyticsEvents.path,
        views: count(),
        users: sql<number>`count(distinct ${analyticsEvents.visitorId})`,
      })
      .from(analyticsEvents)
      .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "pageview")))
      .groupBy(analyticsEvents.path)
      .orderBy(desc(count()))
      .limit(40),
    db
      .select({ path: analyticsSessions.entryPath, entrances: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.entryPath),
    db
      .select({ path: analyticsSessions.exitPath, exits: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.exitPath),
    db
      .select({
        path: analyticsEvents.path,
        totalMs: sql<number>`coalesce(sum(${analyticsEvents.durationMs}), 0)`,
      })
      .from(analyticsEvents)
      .where(
        and(
          eventHumanFilter(range),
          sql`${analyticsEvents.eventType} in ('heartbeat', 'visibility')`,
          sql`${analyticsEvents.durationMs} is not null`,
        ),
      )
      .groupBy(analyticsEvents.path),
  ]);

  const entMap = new Map(entrances.filter((e) => e.path).map((e) => [e.path!, Number(e.entrances)]));
  const exitMap = new Map(exits.filter((e) => e.path).map((e) => [e.path!, Number(e.exits)]));
  const msMap = new Map(engagementMs.filter((e) => e.path).map((e) => [e.path!, Number(e.totalMs)]));

  return views
    .filter((v) => v.path)
    .map((v) => {
      const path = v.path!;
      const viewCount = Number(v.views);
      const ent = entMap.get(path) ?? 0;
      const ex = exitMap.get(path) ?? 0;
      return {
        path,
        views: viewCount,
        users: Number(v.users),
        avgTimeSec: viewCount > 0 ? (msMap.get(path) ?? 0) / 1000 / viewCount : 0,
        entrances: ent,
        exits: ex,
        exitRate: ent > 0 ? ex / ent : 0,
      };
    });
}

export async function queryRetentionCohorts(db: PartnerDb, range: DateRange) {
  const rangeStart = sqlTimestamptz(range.start);
  const rangeEnd = sqlTimestamptz(range.end);
  const rows = await db.execute(sql`
    WITH first_visit AS (
      SELECT "visitorId" AS visitor_id,
             date_trunc('week', min("startedAt")) AS cohort_week
      FROM ${analyticsSessions}
      WHERE "isBot" = false
      GROUP BY "visitorId"
    ),
    cohorts AS (
      SELECT fv.cohort_week, fv.visitor_id
      FROM first_visit fv
      WHERE fv.cohort_week >= date_trunc('week', ${rangeStart}::timestamptz)
        AND fv.cohort_week < ${rangeEnd}::timestamptz
    ),
    activity AS (
      SELECT c.cohort_week,
             c.visitor_id,
             date_trunc('week', s."startedAt") AS activity_week
      FROM cohorts c
      JOIN ${analyticsSessions} s ON s."visitorId" = c.visitor_id AND s."isBot" = false
      WHERE s."startedAt" >= c.cohort_week
        AND s."startedAt" < ${rangeEnd}::timestamptz
      GROUP BY c.cohort_week, c.visitor_id, date_trunc('week', s."startedAt")
    ),
    sizes AS (
      SELECT cohort_week, count(*)::int AS cohort_size
      FROM cohorts
      GROUP BY cohort_week
    )
    SELECT to_char(a.cohort_week, 'IYYY-"W"IW') AS cohort_week,
           (extract(epoch from (a.activity_week - a.cohort_week)) / 604800)::int AS week_offset,
           count(distinct a.visitor_id)::int AS users,
           sz.cohort_size::int AS cohort_size
    FROM activity a
    JOIN sizes sz ON sz.cohort_week = a.cohort_week
    GROUP BY a.cohort_week, a.activity_week, sz.cohort_size
    ORDER BY a.cohort_week, week_offset
    LIMIT 120
  `);

  return rowsFromExecute(rows).map((r) => ({
    cohortWeek: String(r.cohort_week),
    weekOffset: Number(r.week_offset),
    users: Number(r.users),
    retentionRate: Number(r.cohort_size) > 0 ? Number(r.users) / Number(r.cohort_size) : 0,
  }));
}

export async function queryNextPagePaths(db: PartnerDb, range: DateRange, fromPath: string | null) {
  if (!fromPath) return [];
  const rangeStart = sqlTimestamptz(range.start);
  const rangeEnd = sqlTimestamptz(range.end);
  const rows = await db.execute(sql`
    WITH ordered AS (
      SELECT e."sessionId" AS session_id,
             e.path,
             e."createdAt" AS created_at,
             lead(e.path) OVER (PARTITION BY e."sessionId" ORDER BY e."createdAt") AS next_path
      FROM ${analyticsEvents} e
      WHERE e."isBot" = false
        AND e."eventType" = 'pageview'
        AND e."createdAt" >= ${rangeStart}::timestamptz
        AND e."createdAt" < ${rangeEnd}::timestamptz
        AND e.path IS NOT NULL
    )
    SELECT next_path AS path, count(*)::int AS transitions
    FROM ordered
    WHERE path = ${fromPath} AND next_path IS NOT NULL AND next_path <> path
    GROUP BY next_path
    ORDER BY transitions DESC
    LIMIT 20
  `);
  return rowsFromExecute(rows).map((r) => ({
    path: String(r.path),
    transitions: Number(r.transitions),
  }));
}

export async function enrichAnalyticsDashboard(
  db: PartnerDb,
  base: AnalyticsDashboard,
  range: DateRange,
  journeyFrom: string | null,
): Promise<GaExtensions> {
  const [
    realtime,
    newReturning,
    hourly,
    channels,
    sourceMedium,
    utmCampaigns,
    utmTerms,
    utmContents,
    referrerDomains,
    regions,
    screenResolutions,
    scrollDepth,
    outboundClicks,
    fileDownloads,
    siteSearches,
    pages,
    retentionCohorts,
    nextPages,
  ] = await Promise.all([
    queryRealtimeSnapshot(db),
    queryNewReturningUsers(db, range),
    queryHourlyTimeseries(db, range),
    queryChannelSessions(db, range),
    db
      .select({
        source: analyticsSessions.utmSource,
        medium: analyticsSessions.utmMedium,
        sessions: count(),
      })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.utmSource, analyticsSessions.utmMedium)
      .orderBy(desc(count()))
      .limit(25),
    db
      .select({ campaign: analyticsSessions.utmCampaign, sessions: count() })
      .from(analyticsSessions)
      .where(and(sessionHumanFilter(range), sql`${analyticsSessions.utmCampaign} is not null and ${analyticsSessions.utmCampaign} <> ''`))
      .groupBy(analyticsSessions.utmCampaign)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({ term: analyticsSessions.utmTerm, sessions: count() })
      .from(analyticsSessions)
      .where(and(sessionHumanFilter(range), sql`${analyticsSessions.utmTerm} is not null and ${analyticsSessions.utmTerm} <> ''`))
      .groupBy(analyticsSessions.utmTerm)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({ content: analyticsSessions.utmContent, sessions: count() })
      .from(analyticsSessions)
      .where(and(sessionHumanFilter(range), sql`${analyticsSessions.utmContent} is not null and ${analyticsSessions.utmContent} <> ''`))
      .groupBy(analyticsSessions.utmContent)
      .orderBy(desc(count()))
      .limit(20),
    queryReferrerDomains(db, range),
    queryRegions(db, range),
    queryScreenResolutions(db, range),
    queryScrollDepth(db, range),
    queryOutboundClicks(db, range),
    db
      .select({
        href: sql<string>`${analyticsEvents.props}->>'href'`,
        downloads: count(),
      })
      .from(analyticsEvents)
      .where(
        and(
          eventHumanFilter(range),
          eq(analyticsEvents.eventType, "custom"),
          eq(analyticsEvents.eventName, "file_download"),
        ),
      )
      .groupBy(sql`${analyticsEvents.props}->>'href'`)
      .orderBy(desc(count()))
      .limit(25),
    queryPropEvents(db, range, "site_search", "query"),
    queryPageEngagementTable(db, range),
    queryRetentionCohorts(db, range),
    queryNextPagePaths(db, range, journeyFrom),
  ]);

  const foundersSteps = funnelRates([
    { step: "Founders page views", count: base.funnels.founders.pageViews },
    { step: "Register (event)", count: base.funnels.founders.registerEvents },
    { step: "Verify (event)", count: base.funnels.founders.verifyEvents },
    { step: "DB registrations", count: base.funnels.founders.dbRegistrations },
    { step: "DB verified", count: base.funnels.founders.dbVerified },
  ]);

  const buySteps = funnelRates([
    { step: "Buy page views", count: base.funnels.buy.pageViews },
    { step: "Connect wallet", count: base.funnels.buy.connectWallet },
    { step: "Purchase submitted", count: base.funnels.buy.purchaseSubmitted },
    { step: "Purchase succeeded", count: base.funnels.buy.purchaseSucceeded },
    { step: "DB delivered", count: base.funnels.buy.dbDelivered },
  ]);

  return {
    realtime,
    overview: {
      newUsers: newReturning.newUsers,
      returningUsers: newReturning.returningUsers,
      engagementRate: 1 - base.kpis.bounceRate,
      hourly,
    },
    acquisition: {
      channels,
      sourceMedium: sourceMedium.map((r) => ({
        source: r.source || "(none)",
        medium: r.medium || "(none)",
        sessions: Number(r.sessions),
      })),
      utmCampaigns: utmCampaigns.map((r) => ({
        campaign: r.campaign || "(none)",
        sessions: Number(r.sessions),
      })),
      utmTerms: utmTerms.map((r) => ({ term: r.term || "(none)", sessions: Number(r.sessions) })),
      utmContents: utmContents.map((r) => ({
        content: r.content || "(none)",
        sessions: Number(r.sessions),
      })),
      referrerDomains,
      landingPages: base.entryPages,
    },
    geography: {
      regions: regions.map((r) => ({
        region: r.region || "Unknown",
        country: r.country || "—",
        sessions: Number(r.sessions),
      })),
      mapCountries: base.countries.map((c) => ({
        countryCode: (c.country || "XX").slice(0, 2).toUpperCase(),
        country: c.country,
        sessions: c.sessions,
      })),
    },
    tech: {
      screenResolutions: screenResolutions.map((r) => ({
        resolution: r.resolution,
        sessions: Number(r.sessions),
      })),
    },
    engagement: {
      pages,
      scrollDepth,
      outboundClicks,
      fileDownloads: fileDownloads
        .filter((r) => r.href)
        .map((r) => ({ href: r.href!, downloads: Number(r.downloads) })),
      siteSearches,
      namedEvents: base.customEvents,
    },
    conversions: {
      foundersFunnel: foundersSteps,
      buyFunnel: buySteps,
      retentionCohorts,
    },
    journey: {
      fromPath: journeyFrom,
      nextPages,
    },
  };
}

export async function queryAnalyticsGaDashboard(
  db: PartnerDb,
  range: DateRange,
  compareRange: DateRange | undefined,
  journeyFrom: string | null,
): Promise<AnalyticsGaDashboard> {
  const { queryAnalyticsDashboard } = await import("./aggregate");
  const base = await queryAnalyticsDashboard(db, range, compareRange);
  const ga = await enrichAnalyticsDashboard(db, base, range, journeyFrom);
  return { ...base, ...ga, realtimeActive: ga.realtime.active5Min };
}

export { FUNNEL_EVENTS };
