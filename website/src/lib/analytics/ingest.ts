import { and, desc, eq, gte } from "drizzle-orm";
import type { PartnerDb } from "@/db";
import { analyticsEvents, analyticsSessions } from "@/db/schema";
import { detectBot } from "./bots";
import { ANALYTICS_SESSION_TIMEOUT_MS } from "./constants";
import type { GeoFromHeaders } from "./geo";
import {
  isAnalyticsExcludedPathname,
  normalizeAnalyticsStoredPath,
  shouldSkipAnalyticsForPath,
} from "./paths";
import { parseUserAgent } from "./ua-parse";
import type { TrackPayload, TrackPayloadEvent } from "./validate";
import { visitorIdFromIpUa } from "./visitor";

type IngestContext = {
  db: PartnerDb;
  ip: string;
  userAgent: string;
  geo: GeoFromHeaders;
  payload: TrackPayload;
};

function eventCreatedAt(ev: TrackPayloadEvent): Date {
  if (ev.ts != null && ev.ts > 1_600_000_000_000 && ev.ts < 4_000_000_000_000) {
    return new Date(ev.ts);
  }
  return new Date();
}

function storedPath(ev: TrackPayloadEvent): string | null {
  if (!ev.path) return null;
  const pathname = ev.path.split("?")[0] ?? ev.path;
  const search = ev.path.includes("?") ? ev.path.slice(ev.path.indexOf("?")) : "";
  return normalizeAnalyticsStoredPath(pathname, search);
}

function contextFromEvent(ev: TrackPayloadEvent) {
  const path = storedPath(ev);
  return {
    path,
    title: ev.title ?? null,
    referrer: ev.referrer ?? null,
    utmSource: ev.utmSource ?? null,
    utmMedium: ev.utmMedium ?? null,
    utmCampaign: ev.utmCampaign ?? null,
    utmTerm: ev.utmTerm ?? null,
    utmContent: ev.utmContent ?? null,
    refParam: ev.ref ?? null,
    kolParam: ev.kol ?? null,
    screenW: ev.screenW ?? null,
    screenH: ev.screenH ?? null,
    language: ev.lang ?? null,
    timezone: ev.tz ?? null,
  };
}

export function trackPayloadHasExcludedPath(payload: TrackPayload): boolean {
  for (const ev of payload.events) {
    if (!ev.path) continue;
    const pathname = ev.path.split("?")[0] ?? ev.path;
    if (shouldSkipAnalyticsForPath(pathname)) return true;
  }
  return false;
}

export async function ingestTrackBatch(ctx: IngestContext): Promise<{ accepted: number; isBot: boolean }> {
  if (trackPayloadHasExcludedPath(ctx.payload)) {
    return { accepted: 0, isBot: false };
  }

  const webdriverHint = ctx.payload.events.some((e) => e.webdriver);
  const bot = detectBot(ctx.userAgent, { webdriver: webdriverHint });
  const visitorId = visitorIdFromIpUa(ctx.ip, ctx.userAgent);
  const parsedUa = parseUserAgent(ctx.userAgent);
  const now = new Date();
  const cutoff = new Date(now.getTime() - ANALYTICS_SESSION_TIMEOUT_MS);

  const existing = await ctx.db
    .select()
    .from(analyticsSessions)
    .where(
      and(
        eq(analyticsSessions.clientSessionId, ctx.payload.sid),
        gte(analyticsSessions.lastSeenAt, cutoff),
      ),
    )
    .orderBy(desc(analyticsSessions.lastSeenAt))
    .limit(1);

  let session = existing[0];
  const first = ctx.payload.events[0]!;
  const firstCtx = contextFromEvent(first);

  if (!session) {
    const id = crypto.randomUUID();
    await ctx.db.insert(analyticsSessions).values({
      id,
      clientSessionId: ctx.payload.sid,
      visitorId,
      startedAt: eventCreatedAt(first),
      lastSeenAt: eventCreatedAt(first),
      durationSec: 0,
      pageviewCount: 0,
      isBounce: true,
      entryPath: firstCtx.path,
      exitPath: firstCtx.path,
      referrer: firstCtx.referrer,
      utmSource: firstCtx.utmSource,
      utmMedium: firstCtx.utmMedium,
      utmCampaign: firstCtx.utmCampaign,
      utmTerm: firstCtx.utmTerm,
      utmContent: firstCtx.utmContent,
      refParam: firstCtx.refParam,
      kolParam: firstCtx.kolParam,
      country: ctx.geo.country,
      region: ctx.geo.region,
      city: ctx.geo.city,
      browser: parsedUa.browser,
      os: parsedUa.os,
      deviceType: parsedUa.deviceType,
      language: firstCtx.language,
      timezone: firstCtx.timezone,
      screenW: firstCtx.screenW,
      screenH: firstCtx.screenH,
      isBot: bot.isBot,
    });
    session = {
      id,
      clientSessionId: ctx.payload.sid,
      visitorId,
      startedAt: eventCreatedAt(first),
      lastSeenAt: eventCreatedAt(first),
      durationSec: 0,
      pageviewCount: 0,
      isBounce: true,
      entryPath: firstCtx.path,
      exitPath: firstCtx.path,
      referrer: firstCtx.referrer,
      utmSource: firstCtx.utmSource,
      utmMedium: firstCtx.utmMedium,
      utmCampaign: firstCtx.utmCampaign,
      utmTerm: firstCtx.utmTerm,
      utmContent: firstCtx.utmContent,
      refParam: firstCtx.refParam,
      kolParam: firstCtx.kolParam,
      country: ctx.geo.country,
      region: ctx.geo.region,
      city: ctx.geo.city,
      browser: parsedUa.browser,
      os: parsedUa.os,
      deviceType: parsedUa.deviceType,
      language: firstCtx.language,
      timezone: firstCtx.timezone,
      screenW: firstCtx.screenW,
      screenH: firstCtx.screenH,
      isBot: bot.isBot,
    } as typeof existing[0];
  }

  const sessionId = session!.id;
  let pageviewDelta = 0;
  let durationSec = session!.durationSec ?? 0;
  let lastSeenAt = session!.lastSeenAt;
  let exitPath = session!.exitPath;

  const rows: (typeof analyticsEvents.$inferInsert)[] = [];

  for (const ev of ctx.payload.events) {
    const at = eventCreatedAt(ev);
    if (at > lastSeenAt) lastSeenAt = at;
    const path = storedPath(ev);
    if (path) {
      const pathname = path.split("?")[0] ?? path;
      if (isAnalyticsExcludedPathname(pathname)) continue;
    }
    if (ev.type === "pageview") {
      pageviewDelta += 1;
      if (path) exitPath = path;
    }
    if (ev.type === "heartbeat" && ev.durationMs) {
      durationSec += Math.round(ev.durationMs / 1000);
    }
    if (ev.type === "visibility" && ev.durationMs) {
      durationSec += Math.round(ev.durationMs / 1000);
    }

    const eventName =
      ev.type === "custom"
        ? ev.name!
        : ev.type === "outbound"
          ? "outbound_click"
          : ev.type === "visibility"
            ? `visibility_${ev.visibility ?? "change"}`
            : ev.type;

    rows.push({
      id: crypto.randomUUID(),
      sessionId,
      visitorId,
      eventType: ev.type,
      eventName,
      path,
      title: ev.title ?? null,
      props: {
        ...(ev.props ?? {}),
        ...(ev.href ? { href: ev.href } : {}),
      },
      durationMs: ev.durationMs ?? null,
      createdAt: at,
      isBot: bot.isBot,
    });
  }

  if (rows.length) {
    await ctx.db.insert(analyticsEvents).values(rows);
  }

  const newPageviews = (session!.pageviewCount ?? 0) + pageviewDelta;
  const isBounce = newPageviews <= 1 && durationSec < 10;

  await ctx.db
    .update(analyticsSessions)
    .set({
      lastSeenAt,
      durationSec,
      pageviewCount: newPageviews,
      exitPath,
      isBounce,
    })
    .where(eq(analyticsSessions.id, sessionId));

  return { accepted: rows.length, isBot: bot.isBot };
}
