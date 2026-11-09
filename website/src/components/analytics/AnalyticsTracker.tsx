"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  analyticsBaseContext,
  analyticsDntEnabled,
  flushAnalyticsEvents,
  track,
  trackEvent,
} from "@/lib/analytics/client-track";
import { ENGAGEMENT_EVENTS, SCROLL_DEPTH_EVENTS } from "@/lib/analytics/events-catalog";
import { shouldSkipAnalyticsForPath } from "@/lib/analytics/paths";

const HEARTBEAT_MS = 15_000;

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const lastPath = useRef<string | null>(null);
  const visibleSince = useRef<number>(0);
  const heartbeatTimer = useRef<number | null>(null);
  const hideBeaconSent = useRef(false);

  useEffect(() => {
    window.peopleTrack = track;
    return () => {
      delete window.peopleTrack;
    };
  }, []);

  useEffect(() => {
    if (analyticsDntEnabled() || shouldSkipAnalyticsForPath(pathname)) return;

    visibleSince.current = Date.now();
    hideBeaconSent.current = false;

    const ctx = () => analyticsBaseContext(pathname, search);

    const onOutboundClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor?.href) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin === window.location.origin) return;
        void flushAnalyticsEvents([
          {
            type: "outbound",
            href: url.href,
            ts: Date.now(),
            ...ctx(),
          },
        ]);
      } catch {
        /* ignore */
      }
    };

    document.addEventListener("click", onOutboundClick, true);

    const onDownloadClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const anchor = target?.closest("a[download], a[href$='.pdf'], a[href$='.zip']") as HTMLAnchorElement | null;
      if (!anchor?.href) return;
      trackEvent(ENGAGEMENT_EVENTS.fileDownload, { href: anchor.href });
    };
    document.addEventListener("click", onDownloadClick, true);

    const scrollMarks = new Set<number>();
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const ratio = (window.scrollY + window.innerHeight) / (doc.scrollHeight || max);
      const milestones: [number, string][] = [
        [0.25, SCROLL_DEPTH_EVENTS.p25],
        [0.5, SCROLL_DEPTH_EVENTS.p50],
        [0.75, SCROLL_DEPTH_EVENTS.p75],
        [0.9, SCROLL_DEPTH_EVENTS.p90],
      ];
      for (const [pct, name] of milestones) {
        if (ratio >= pct && !scrollMarks.has(pct)) {
          scrollMarks.add(pct);
          trackEvent(name, { percent: pct });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const params = new URLSearchParams(search);
    const searchQuery = params.get("q") ?? params.get("search");
    if (searchQuery?.trim()) {
      trackEvent(ENGAGEMENT_EVENTS.siteSearch, { query: searchQuery.trim().slice(0, 120) });
    }

    const pathKey = `${pathname}${search}`;
    if (lastPath.current !== pathKey) {
      lastPath.current = pathKey;
      void flushAnalyticsEvents([
        {
          type: "pageview",
          ts: Date.now(),
          ...ctx(),
        },
      ]);
    }

    const onVisibility = () => {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        const dur = now - visibleSince.current;
        hideBeaconSent.current = true;
        visibleSince.current = now;
        void flushAnalyticsEvents(
          [
            {
              type: "visibility",
              visibility: "hidden",
              durationMs: dur,
              ts: now,
              ...ctx(),
            },
          ],
          true,
        );
      } else {
        hideBeaconSent.current = false;
        visibleSince.current = now;
        void flushAnalyticsEvents([
          {
            type: "visibility",
            visibility: "visible",
            ts: now,
            ...ctx(),
          },
        ]);
      }
    };

    const onPageHide = () => {
      if (hideBeaconSent.current) return;
      const now = Date.now();
      void flushAnalyticsEvents(
        [
          {
            type: "heartbeat",
            durationMs: now - visibleSince.current,
            ts: now,
            ...ctx(),
          },
        ],
        true,
      );
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    heartbeatTimer.current = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      const dur = now - visibleSince.current;
      visibleSince.current = now;
      void flushAnalyticsEvents([
        {
          type: "heartbeat",
          durationMs: dur,
          ts: now,
          ...ctx(),
        },
      ]);
    }, HEARTBEAT_MS);

    return () => {
      document.removeEventListener("click", onOutboundClick, true);
      document.removeEventListener("click", onDownloadClick, true);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (heartbeatTimer.current) window.clearInterval(heartbeatTimer.current);

      const now = Date.now();
      const dur = now - visibleSince.current;
      if (dur > 0) {
        void flushAnalyticsEvents(
          [
            {
              type: "heartbeat",
              durationMs: dur,
              ts: now,
              ...ctx(),
            },
          ],
          true,
        );
      }
    };
  }, [pathname, search]);

  return null;
}

export { track };
