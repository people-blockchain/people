"use client";

import { Analytics } from "@vercel/analytics/react";
import { shouldSkipAnalyticsForPath } from "@/lib/analytics/paths";

function dropAdminOrSecretViewerUrls(url: string): boolean {
  try {
    const path = new URL(url, "https://example.invalid").pathname;
    return shouldSkipAnalyticsForPath(path);
  } catch {
    return url.includes("/admin");
  }
}

/** Vercel baseline analytics — excludes admin and secret analytics viewer routes. */
export function VercelWebAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (dropAdminOrSecretViewerUrls(event.url)) return null;
        return event;
      }}
    />
  );
}
