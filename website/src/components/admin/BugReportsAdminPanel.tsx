"use client";

import { useCallback, useEffect, useState } from "react";
import { BUG_SEVERITIES, BUG_STATUSES, type BugSeverity, type BugStatus } from "@/lib/bug-reports/constants";

type AdminBugReport = {
  id: string;
  userId: string | null;
  type?: string;
  source?: string;
  telegramUsername?: string | null;
  description: string;
  screenshotData: string | null;
  context: Record<string, unknown>;
  status: BugStatus;
  severity: BugSeverity | null;
  rewardPoints: number;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_FILTERS: ("all" | BugStatus)[] = ["all", ...BUG_STATUSES];

export function BugReportsAdminPanel() {
  const [reports, setReports] = useState<AdminBugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | BugStatus>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (status: "all" | BugStatus) => {
    setLoading(true);
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const res = await fetch(`/api/bugs/admin${qs}`, { credentials: "include" });
      const data = (await res.json()) as { reports?: AdminBugReport[] };
      setReports(data.reports ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function patch(id: string, body: Partial<Pick<AdminBugReport, "status" | "severity" | "rewardPoints" | "adminNote">>) {
    setSavingId(id);
    try {
      const res = await fetch("/api/bugs/admin", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (res.ok) {
        const data = (await res.json()) as { report: AdminBugReport };
        setReports((prev) => prev.map((r) => (r.id === id ? data.report : r)));
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink">Bug reports</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              filter === s ? "border-brand bg-brand/10 text-brand" : "border-line text-ink-2"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink-3">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">No reports.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-ink-3">
                    {r.type ?? "bug"} · {r.source === "telegram" ? `tg @${r.telegramUsername ?? "?"}` : r.userId} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{r.description}</p>
                  {typeof r.context?.url === "string" ? (
                    <p className="mt-1 truncate text-xs text-ink-3">{r.context.url as string}</p>
                  ) : null}
                </div>
                {r.screenshotData ? (
                  // eslint-disable-next-line @next/next/no-img-element -- stored data URL, not an optimizable asset
                  <img src={r.screenshotData} alt="" className="h-20 w-32 shrink-0 rounded-lg border border-line object-cover" />
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={r.status}
                  disabled={savingId === r.id}
                  onChange={(e) => patch(r.id, { status: e.target.value as BugStatus })}
                  className="rounded-lg border border-line bg-canvas-2 px-2 py-1 text-sm text-ink"
                >
                  {BUG_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  value={r.severity ?? ""}
                  disabled={savingId === r.id}
                  onChange={(e) => patch(r.id, { severity: (e.target.value || null) as BugSeverity | null })}
                  className="rounded-lg border border-line bg-canvas-2 px-2 py-1 text-sm text-ink"
                >
                  <option value="">severity: —</option>
                  {BUG_SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min={0}
                  defaultValue={r.rewardPoints}
                  disabled={savingId === r.id}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isInteger(value) && value !== r.rewardPoints) {
                      void patch(r.id, { rewardPoints: value });
                    }
                  }}
                  className="w-24 rounded-lg border border-line bg-canvas-2 px-2 py-1 text-sm text-ink"
                  aria-label="Reward points"
                />

                <input
                  type="text"
                  defaultValue={r.adminNote ?? ""}
                  disabled={savingId === r.id}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value !== (r.adminNote ?? "")) {
                      void patch(r.id, { adminNote: value || null });
                    }
                  }}
                  placeholder="Admin note"
                  className="min-w-[10rem] flex-1 rounded-lg border border-line bg-canvas-2 px-2 py-1 text-sm text-ink"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
