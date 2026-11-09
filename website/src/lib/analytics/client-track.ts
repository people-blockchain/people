"use client";

/** Client-side custom event helper (also exposed as `window.peopleTrack`). */

import {
  normalizeAnalyticsStoredPath,
  shouldSkipAnalyticsForPath,
} from "@/lib/analytics/paths";

type QueuedEvent = Record<string, unknown>;

function dntEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  const dnt = navigator.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack;
  return dnt === "1" || dnt === "yes";
}

const SID_KEY = "people_analytics_sid";
let memorySessionId: string | null = null;

export function analyticsSessionId(): string {
  try {
    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    if (!memorySessionId) memorySessionId = crypto.randomUUID();
    return memorySessionId;
  }
}

export function parseAttribution(search: string) {
  const params = new URLSearchParams(search);
  return {
    utmSource: params.get("utm_source") ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
    utmTerm: params.get("utm_term") ?? undefined,
    utmContent: params.get("utm_content") ?? undefined,
    ref: params.get("ref") ?? undefined,
    kol: params.get("kol") ?? undefined,
  };
}

export function analyticsBaseContext(pathname: string, search: string): QueuedEvent {
  if (shouldSkipAnalyticsForPath(pathname)) {
    return { path: pathname };
  }
  const attr = parseAttribution(search);
  const path = normalizeAnalyticsStoredPath(pathname, search);
  return {
    path,
    title: typeof document !== "undefined" ? document.title : "",
    referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
    screenW: typeof window !== "undefined" ? window.screen.width : undefined,
    screenH: typeof window !== "undefined" ? window.screen.height : undefined,
    lang: typeof navigator !== "undefined" ? navigator.language : undefined,
    tz: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
    webdriver: typeof navigator !== "undefined" ? Boolean(navigator.webdriver) : undefined,
    ...attr,
  };
}

export async function flushAnalyticsEvents(events: QueuedEvent[], beacon = false) {
  if (dntEnabled() || events.length === 0) return;
  if (typeof window !== "undefined" && shouldSkipAnalyticsForPath(window.location.pathname)) return;
  const body = JSON.stringify({ sid: analyticsSessionId(), events });
  if (beacon && typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    return;
  }
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* best effort */
  }
}

export function track(event: string, props?: Record<string, unknown>) {
  if (dntEnabled() || (typeof window !== "undefined" && shouldSkipAnalyticsForPath(window.location.pathname))) {
    return;
  }
  const ctx = analyticsBaseContext(window.location.pathname, window.location.search);
  void flushAnalyticsEvents([
    {
      type: "custom",
      name: event,
      props: props ?? {},
      ts: Date.now(),
      ...ctx,
    },
  ]);
}

/** GA-style named event helper (alias of `track`). */
export const trackEvent = track;

declare global {
  interface Window {
    peopleTrack?: typeof track;
  }
}

export function analyticsDntEnabled(): boolean {
  return dntEnabled();
}
