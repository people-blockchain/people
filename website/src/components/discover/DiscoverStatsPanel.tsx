"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { discoverCopy } from "@/lib/discover-content";

export function DiscoverStatsPanel() {
  const { lang } = useLanguage();
  const t = discoverCopy[lang];
  const [stats, setStats] = useState<{
    uniqueVisitors: number;
    returningWithinDays: number;
    totalVisitEvents: number;
    windowDays: number;
  } | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void fetch("/api/discover/admin/stats")
      .then((r) => {
        if (r.status === 403) {
          setDenied(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) setStats(d);
      });
  }, []);

  if (denied) {
    return <p className="px-4 py-16 text-sm text-ink-2">{t.errors.generic}</p>;
  }

  if (!stats) {
    return <p className="px-4 py-16 text-sm text-ink-3">…</p>;
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-h2 font-bold text-ink">{t.stats.title}</h1>
      <dl className="mt-8 space-y-4">
        <div className="flex justify-between border-b border-line pb-2 text-sm">
          <dt>{t.stats.uniqueVisitors}</dt>
          <dd className="font-semibold">{stats.uniqueVisitors}</dd>
        </div>
        <div className="flex justify-between border-b border-line pb-2 text-sm">
          <dt>{t.stats.returning}</dt>
          <dd className="font-semibold">{stats.returningWithinDays}</dd>
        </div>
        <div className="flex justify-between border-b border-line pb-2 text-sm">
          <dt>{t.stats.totalEvents}</dt>
          <dd className="font-semibold">{stats.totalVisitEvents}</dd>
        </div>
        <div className="flex justify-between text-sm text-ink-3">
          <dt>{t.stats.window}</dt>
          <dd>{stats.windowDays}</dd>
        </div>
      </dl>
    </section>
  );
}
