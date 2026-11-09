import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PartnerDb } from "@/db";
import { analyticsEvents, analyticsSessions, founders, pplSaleOrders } from "@/db/schema";
import { FUNNEL_EVENTS } from "./constants";

export type DateRange = { start: Date; end: Date };

const MAX_ANALYTICS_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export type AnalyticsKpis = {
  visitors: number;
  uniqueVisitors: number;
  sessions: number;
  pageviews: number;
  avgSessionDurationSec: number;
  bounceRate: number;
  pagesPerSession: number;
};

export type AnalyticsDashboard = {
  range: { start: string; end: string };
  compare?: AnalyticsKpis;
  kpis: AnalyticsKpis;
  realtimeActive: number;
  timeseries: { bucket: string; sessions: number; pageviews: number; visitors: number }[];
  topPages: { path: string; views: number; avgTimeSec: number }[];
  entryPages: { path: string; sessions: number }[];
  exitPages: { path: string; sessions: number }[];
  referrers: { referrer: string; sessions: number }[];
  utmSources: { source: string; medium: string; campaign: string; sessions: number }[];
  countries: { country: string; sessions: number }[];
  cities: { city: string; country: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  browsers: { browser: string; sessions: number }[];
  os: { os: string; sessions: number }[];
  languages: { language: string; sessions: number }[];
  customEvents: { name: string; count: number }[];
  refTraffic: { ref: string; sessions: number }[];
  kolTraffic: { kol: string; sessions: number }[];
  funnels: {
    founders: {
      pageViews: number;
      registerEvents: number;
      verifyEvents: number;
      dbRegistrations: number;
      dbVerified: number;
    };
    buy: {
      pageViews: number;
      connectWallet: number;
      purchaseSubmitted: number;
      purchaseSucceeded: number;
      dbOrders: number;
      dbDelivered: number;
    };
  };
};

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

export async function queryAnalyticsKpis(db: PartnerDb, range: DateRange): Promise<AnalyticsKpis> {
  const [sessionRow] = await db
    .select({
      sessions: count(),
      visitors: sql<number>`count(distinct ${analyticsSessions.visitorId})`,
      avgDuration: sql<number>`coalesce(avg(${analyticsSessions.durationSec}), 0)`,
      bounces: sql<number>`coalesce(sum(case when ${analyticsSessions.isBounce} then 1 else 0 end), 0)`,
      pageviewsSum: sql<number>`coalesce(sum(${analyticsSessions.pageviewCount}), 0)`,
    })
    .from(analyticsSessions)
    .where(sessionHumanFilter(range));

  const [pvRow] = await db
    .select({ pageviews: count() })
    .from(analyticsEvents)
    .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "pageview")));

  const sessions = Number(sessionRow?.sessions ?? 0);
  const visitors = Number(sessionRow?.visitors ?? 0);
  const pageviews = Number(pvRow?.pageviews ?? 0);
  const avgSessionDurationSec = sessions ? Number(sessionRow?.avgDuration ?? 0) : 0;
  const bounces = Number(sessionRow?.bounces ?? 0);
  const bounceRate = sessions ? bounces / sessions : 0;
  const pagesPerSession = sessions ? Number(sessionRow?.pageviewsSum ?? 0) / sessions : 0;

  return {
    visitors,
    uniqueVisitors: visitors,
    sessions,
    pageviews,
    avgSessionDurationSec,
    bounceRate,
    pagesPerSession,
  };
}

export async function queryPageEngagementMsByPath(
  db: PartnerDb,
  range: DateRange,
): Promise<Map<string, number>> {
  const rows = await db
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
    .groupBy(analyticsEvents.path);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.path) map.set(row.path, Number(row.totalMs));
  }
  return map;
}

export async function queryAnalyticsDashboard(
  db: PartnerDb,
  range: DateRange,
  compareRange?: DateRange,
): Promise<AnalyticsDashboard> {
  const realtimeCutoff = new Date(Date.now() - 5 * 60 * 1000);

  const [
    kpis,
    compare,
    rt,
    timeseries,
    pvByDay,
    pageViewCounts,
    engagementMs,
    entryPages,
    exitPages,
    referrers,
    utmSources,
    countries,
    cities,
    devices,
    browsers,
    osRows,
    languages,
    customEvents,
    refTraffic,
    kolTraffic,
    founderDb,
    saleDb,
  ] = await Promise.all([
    queryAnalyticsKpis(db, range),
    compareRange ? queryAnalyticsKpis(db, compareRange) : Promise.resolve(undefined),
    db
      .select({ n: count() })
      .from(analyticsSessions)
      .where(and(gte(analyticsSessions.lastSeenAt, realtimeCutoff), eq(analyticsSessions.isBot, false))),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${analyticsSessions.startedAt}), 'YYYY-MM-DD')`,
        sessions: count(),
        visitors: sql<number>`count(distinct ${analyticsSessions.visitorId})`,
      })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(sql`date_trunc('day', ${analyticsSessions.startedAt})`)
      .orderBy(sql`date_trunc('day', ${analyticsSessions.startedAt})`),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`,
        pageviews: count(),
      })
      .from(analyticsEvents)
      .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "pageview")))
      .groupBy(sql`date_trunc('day', ${analyticsEvents.createdAt})`),
    db
      .select({
        path: analyticsEvents.path,
        views: count(),
      })
      .from(analyticsEvents)
      .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "pageview")))
      .groupBy(analyticsEvents.path)
      .orderBy(desc(count()))
      .limit(25),
    queryPageEngagementMsByPath(db, range),
    db
      .select({ path: analyticsSessions.entryPath, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.entryPath)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ path: analyticsSessions.exitPath, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.exitPath)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ referrer: analyticsSessions.referrer, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.referrer)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({
        source: analyticsSessions.utmSource,
        medium: analyticsSessions.utmMedium,
        campaign: analyticsSessions.utmCampaign,
        sessions: count(),
      })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.utmSource, analyticsSessions.utmMedium, analyticsSessions.utmCampaign)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({ country: analyticsSessions.country, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.country)
      .orderBy(desc(count()))
      .limit(30),
    db
      .select({
        city: analyticsSessions.city,
        country: analyticsSessions.country,
        sessions: count(),
      })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.city, analyticsSessions.country)
      .orderBy(desc(count()))
      .limit(25),
    db
      .select({ device: analyticsSessions.deviceType, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.deviceType)
      .orderBy(desc(count())),
    db
      .select({ browser: analyticsSessions.browser, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.browser)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ os: analyticsSessions.os, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.os)
      .orderBy(desc(count()))
      .limit(15),
    db
      .select({ language: analyticsSessions.language, sessions: count() })
      .from(analyticsSessions)
      .where(sessionHumanFilter(range))
      .groupBy(analyticsSessions.language)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({ name: analyticsEvents.eventName, count: count() })
      .from(analyticsEvents)
      .where(and(eventHumanFilter(range), eq(analyticsEvents.eventType, "custom")))
      .groupBy(analyticsEvents.eventName)
      .orderBy(desc(count()))
      .limit(40),
    db
      .select({ ref: analyticsSessions.refParam, sessions: count() })
      .from(analyticsSessions)
      .where(and(sessionHumanFilter(range), sql`${analyticsSessions.refParam} is not null and ${analyticsSessions.refParam} <> ''`))
      .groupBy(analyticsSessions.refParam)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({ kol: analyticsSessions.kolParam, sessions: count() })
      .from(analyticsSessions)
      .where(and(sessionHumanFilter(range), sql`${analyticsSessions.kolParam} is not null and ${analyticsSessions.kolParam} <> ''`))
      .groupBy(analyticsSessions.kolParam)
      .orderBy(desc(count()))
      .limit(20),
    db
      .select({
        registrations: count(),
        verified: sql<number>`coalesce(sum(case when ${founders.verificationLevel} > 0 then 1 else 0 end), 0)`,
      })
      .from(founders)
      .where(and(gte(founders.registeredAt, range.start), lt(founders.registeredAt, range.end))),
    db
      .select({
        orders: count(),
        delivered: sql<number>`coalesce(sum(case when ${pplSaleOrders.status} = 'delivered' then 1 else 0 end), 0)`,
      })
      .from(pplSaleOrders)
      .where(and(gte(pplSaleOrders.createdAt, range.start), lt(pplSaleOrders.createdAt, range.end))),
  ]);

  const pvMap = new Map(pvByDay.map((r) => [r.bucket, Number(r.pageviews)]));

  async function countCustom(name: string) {
    const [row] = await db
      .select({ c: count() })
      .from(analyticsEvents)
      .where(
        and(eventHumanFilter(range), eq(analyticsEvents.eventType, "custom"), eq(analyticsEvents.eventName, name)),
      );
    return Number(row?.c ?? 0);
  }

  async function countPathViews(prefix: string) {
    const [row] = await db
      .select({ c: count() })
      .from(analyticsEvents)
      .where(
        and(
          eventHumanFilter(range),
          eq(analyticsEvents.eventType, "pageview"),
          sql`starts_with(${analyticsEvents.path}, ${prefix})`,
        ),
      );
    return Number(row?.c ?? 0);
  }

  const [foundersRegister, foundersVerify, buyConnect, buySubmit, buySuccess] = await Promise.all([
    countCustom(FUNNEL_EVENTS.foundersRegister),
    countCustom(FUNNEL_EVENTS.foundersVerifySuccess),
    countCustom(FUNNEL_EVENTS.buyConnectWallet),
    countCustom(FUNNEL_EVENTS.buyPurchaseSubmitted),
    countCustom(FUNNEL_EVENTS.buyPurchaseSucceeded),
  ]);

  const [foundersPageViews, buyPageViews] = await Promise.all([
    countPathViews("/founders"),
    countPathViews("/buy"),
  ]);

  const topPages = pageViewCounts
    .filter((p) => p.path)
    .map((p) => {
      const views = Number(p.views);
      const totalMs = engagementMs.get(p.path!) ?? 0;
      return {
        path: p.path!,
        views,
        avgTimeSec: views > 0 ? totalMs / 1000 / views : 0,
      };
    });

  return {
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    compare,
    kpis,
    realtimeActive: Number(rt[0]?.n ?? 0),
    timeseries: timeseries.map((t) => ({
      bucket: t.bucket,
      sessions: Number(t.sessions),
      visitors: Number(t.visitors),
      pageviews: pvMap.get(t.bucket) ?? 0,
    })),
    topPages,
    entryPages: entryPages
      .filter((p) => p.path)
      .map((p) => ({ path: p.path!, sessions: Number(p.sessions) })),
    exitPages: exitPages
      .filter((p) => p.path)
      .map((p) => ({ path: p.path!, sessions: Number(p.sessions) })),
    referrers: referrers.map((r) => ({
      referrer: r.referrer || "(direct)",
      sessions: Number(r.sessions),
    })),
    utmSources: utmSources.map((u) => ({
      source: u.source || "(none)",
      medium: u.medium || "(none)",
      campaign: u.campaign || "(none)",
      sessions: Number(u.sessions),
    })),
    countries: countries.map((c) => ({
      country: c.country || "Unknown",
      sessions: Number(c.sessions),
    })),
    cities: cities.map((c) => ({
      city: c.city || "Unknown",
      country: c.country || "—",
      sessions: Number(c.sessions),
    })),
    devices: devices.map((d) => ({ device: d.device || "other", sessions: Number(d.sessions) })),
    browsers: browsers.map((b) => ({ browser: b.browser || "Unknown", sessions: Number(b.sessions) })),
    os: osRows.map((o) => ({ os: o.os || "Unknown", sessions: Number(o.sessions) })),
    languages: languages.map((l) => ({
      language: l.language || "Unknown",
      sessions: Number(l.sessions),
    })),
    customEvents: customEvents
      .filter((e) => e.name)
      .map((e) => ({ name: e.name!, count: Number(e.count) })),
    refTraffic: refTraffic.map((r) => ({ ref: r.ref!, sessions: Number(r.sessions) })),
    kolTraffic: kolTraffic.map((r) => ({ kol: r.kol!, sessions: Number(r.sessions) })),
    funnels: {
      founders: {
        pageViews: foundersPageViews,
        registerEvents: foundersRegister,
        verifyEvents: foundersVerify,
        dbRegistrations: Number(founderDb[0]?.registrations ?? 0),
        dbVerified: Number(founderDb[0]?.verified ?? 0),
      },
      buy: {
        pageViews: buyPageViews,
        connectWallet: buyConnect,
        purchaseSubmitted: buySubmit,
        purchaseSucceeded: buySuccess,
        dbOrders: Number(saleDb[0]?.orders ?? 0),
        dbDelivered: Number(saleDb[0]?.delivered ?? 0),
      },
    },
  };
}

export function parseAnalyticsRange(
  preset: string | null,
  fromIso: string | null,
  toIso: string | null,
): { range: DateRange; compare?: DateRange } {
  const now = new Date();
  const end = new Date(now);
  end.setMilliseconds(0);

  if (preset === "today") {
    const start = new Date(end);
    start.setUTCHours(0, 0, 0, 0);
    const span = end.getTime() - start.getTime();
    const compareEnd = new Date(start);
    const compareStart = new Date(compareEnd.getTime() - span);
    return {
      range: { start, end },
      compare: { start: compareStart, end: compareEnd },
    };
  }
  if (preset === "7d") {
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const span = end.getTime() - start.getTime();
    return {
      range: { start, end },
      compare: { start: new Date(start.getTime() - span), end: start },
    };
  }
  if (preset === "30d") {
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const span = end.getTime() - start.getTime();
    return {
      range: { start, end },
      compare: { start: new Date(start.getTime() - span), end: start },
    };
  }
  if (preset === "90d") {
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const span = end.getTime() - start.getTime();
    return {
      range: { start, end },
      compare: { start: new Date(start.getTime() - span), end: start },
    };
  }
  if (fromIso && toIso) {
    const start = new Date(fromIso);
    const endCustom = new Date(toIso);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(endCustom.getTime())) {
      throw new Error("invalid_range");
    }
    if (endCustom.getTime() <= start.getTime()) {
      throw new Error("invalid_range");
    }
    if (endCustom.getTime() - start.getTime() > MAX_ANALYTICS_RANGE_MS) {
      throw new Error("invalid_range");
    }
    const span = endCustom.getTime() - start.getTime();
    return {
      range: { start, end: endCustom },
      compare: { start: new Date(start.getTime() - span), end: start },
    };
  }
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const span = end.getTime() - start.getTime();
  return {
    range: { start, end },
    compare: { start: new Date(start.getTime() - span), end: start },
  };
}
