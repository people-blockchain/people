"use client";

import { useEffect, useState } from "react";
import { bugReportCopy } from "@/lib/bug-reports/copy";
import type { Language } from "@/lib/preferences";

type MyBugReport = {
  id: string;
  description: string;
  status: "new" | "accepted" | "duplicate" | "fixed" | "rejected";
  severity: "low" | "medium" | "high" | "critical" | null;
  rewardPoints: number;
  createdAt: string;
};

const STATUS_TONE: Record<MyBugReport["status"], string> = {
  new: "bg-surface-2 text-ink-2",
  accepted: "bg-value/10 text-value",
  duplicate: "bg-surface-2 text-ink-2",
  fixed: "bg-value/10 text-value",
  rejected: "bg-warm/10 text-warm",
};

export function MyBugReportsPanel({ lang }: { lang: Language }) {
  const t = bugReportCopy[lang];
  const [reports, setReports] = useState<MyBugReport[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/bugs/mine", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data: { reports?: MyBugReport[] }) => {
        if (active) setReports(data.reports ?? []);
      })
      .catch(() => {
        if (active) setReports([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const statusLabel: Record<MyBugReport["status"], string> = {
    new: t.statusNew,
    accepted: t.statusAccepted,
    duplicate: t.statusDuplicate,
    fixed: t.statusFixed,
    rejected: t.statusRejected,
  };

  if (reports !== null && reports.length === 0) {
    return null;
  }

  return (
    <div className="mt-10 border-t border-line pt-6" data-testid="my-bug-reports">
      <h2 className="text-lg font-bold text-ink">{t.myReportsTitle}</h2>
      {reports === null ? null : (
        <ul className="mt-4 space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
                {r.rewardPoints > 0 ? (
                  <span className="text-xs font-semibold text-brand">
                    {t.myReportsReward}: {r.rewardPoints}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-ink-2">{r.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
