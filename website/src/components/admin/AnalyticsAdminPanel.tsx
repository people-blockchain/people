"use client";

import dynamic from "next/dynamic";

const AnalyticsGaDashboard = dynamic(() => import("./AnalyticsGaDashboard"), {
  ssr: false,
  loading: () => <p className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-3">Loading analytics…</p>,
});

export function AnalyticsAdminPanel({ readOnly }: { readOnly?: boolean }) {
  return <AnalyticsGaDashboard readOnly={readOnly} />;
}
