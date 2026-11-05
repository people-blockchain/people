"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PartnersAdminOverview, PartnersAdminRow } from "@/lib/partner/admin-overview";
import { KOL_TIER_OVERRIDE_PRESET_USDC_BPS } from "@/lib/partner/admin-tier-override";

type CabinetSnapshot = Awaited<ReturnType<typeof import("@/lib/partner/service")["loadCabinet"]>>;

function microUsdLabel(micro: string): string {
  const n = Number(micro) / 1_000_000;
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(0)}%`;
}

export function PartnersAdminPanel({
  demoOverview,
  demoCabinetsByUserId,
}: {
  demoOverview?: PartnersAdminOverview;
  demoCabinetsByUserId?: Record<string, CabinetSnapshot>;
}) {
  const [overview, setOverview] = useState<PartnersAdminOverview | null>(demoOverview ?? null);
  const [loading, setLoading] = useState(!demoOverview);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CabinetSnapshot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tierOverrideInput, setTierOverrideInput] = useState("");
  const [tierSaveState, setTierSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [tierSaveError, setTierSaveError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (demoOverview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/referral/partners", { credentials: "include" });
      if (res.status === 403) {
        setError("Forbidden");
        return;
      }
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as PartnersAdminOverview & { ok?: boolean };
      setOverview({ summary: data.summary, partners: data.partners });
    } finally {
      setLoading(false);
    }
  }, [demoOverview]);

  useEffect(() => {
    if (demoOverview) return;
    void loadOverview();
  }, [loadOverview, demoOverview]);

  const loadDetail = useCallback(async (userId: string) => {
    setSelectedId(userId);
    setDetailLoading(true);
    setTierSaveState("idle");
    setTierSaveError(null);
    try {
      const demoCabinet = demoCabinetsByUserId?.[userId];
      if (demoCabinet) {
        setDetail(demoCabinet);
        setTierOverrideInput(
          demoCabinet.kolTierOverrideBps != null ? String(demoCabinet.kolTierOverrideBps) : "",
        );
        return;
      }
      const res = await fetch("/api/admin/referral/partners", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { detail?: CabinetSnapshot };
      const next = data.detail ?? null;
      setDetail(next);
      setTierOverrideInput(next?.kolTierOverrideBps != null ? String(next.kolTierOverrideBps) : "");
    } finally {
      setDetailLoading(false);
    }
  }, [demoCabinetsByUserId]);

  const saveTierOverride = useCallback(async () => {
    if (!selectedId || !detail) return;
    if (demoOverview) {
      setTierSaveState("saved");
      return;
    }
    setTierSaveState("saving");
    setTierSaveError(null);
    const trimmed = tierOverrideInput.trim();
    const kolTierOverrideBps = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && !Number.isInteger(kolTierOverrideBps)) {
      setTierSaveState("error");
      setTierSaveError("Enter a whole-number bps value or leave empty to clear.");
      return;
    }
    const res = await fetch("/api/admin/referral/partners", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedId, kolTierOverrideBps }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setTierSaveState("error");
      setTierSaveError(payload?.error ?? `HTTP ${res.status}`);
      return;
    }
    const payload = (await res.json()) as { kolTierOverrideBps?: number | null };
    setDetail({
      ...detail,
      kolTierOverrideBps: payload.kolTierOverrideBps ?? null,
    });
    setTierSaveState("saved");
  }, [demoOverview, detail, selectedId, tierOverrideInput]);

  const summary = overview?.summary;
  const partners = useMemo(() => overview?.partners ?? [], [overview?.partners]);

  const selectedRow: PartnersAdminRow | undefined = useMemo(
    () => partners.find((p) => p.userId === selectedId),
    [partners, selectedId],
  );

  const volumeTierFloorBps = detail?.volumeTierUsdcBps ?? selectedRow?.tierUsdcBps ?? 700;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-neutral-100">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partner program</h1>
          <p className="text-neutral-400">Internal admin — referral partners, commissions, payouts.</p>
        </div>
        <a
          className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
          href="/api/admin/referral/payout-export?format=csv"
        >
          Download payout CSV
        </a>
      </header>

      {loading ? <p className="text-neutral-400">Loading…</p> : null}
      {error ? <p className="text-red-400">{error}</p> : null}

      {summary ? (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5" data-testid="partner-admin-summary">
          <Stat label="Partners" value={String(summary.totalPartners)} />
          <Stat label="Link clicks" value={String(summary.totalClicks)} />
          <Stat label="L1 sign-ups" value={String(summary.totalSignUps)} />
          <Stat label="Attributed volume" value={microUsdLabel(summary.totalVolumeUsdMicro)} />
          <Stat label="Approved USDC (due)" value={microUsdLabel(summary.totalApprovedUsdcMicro)} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-full divide-y divide-neutral-800" data-testid="partner-admin-table">
            <thead className="bg-neutral-900/80 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Clicks</th>
                <th className="px-3 py-2">L1 / L2</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">USDC (pend / appr / paid)</th>
                <th className="px-3 py-2">PPL (pend / appr / paid)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {partners.map((row) => (
                <tr
                  key={row.userId}
                  className={`cursor-pointer hover:bg-neutral-900/60 ${selectedId === row.userId ? "bg-neutral-900" : ""}`}
                  onClick={() => void loadDetail(row.userId)}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.email ?? row.userId.slice(0, 8)}</div>
                    <div className="text-xs text-neutral-500">{new Date(row.createdAt).toLocaleDateString("en-US")}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.kolCode ?? row.referralCode}</td>
                  <td className="px-3 py-2">{bpsToPct(row.tierUsdcBps)}</td>
                  <td className="px-3 py-2">{row.clicks}</td>
                  <td className="px-3 py-2">
                    {row.l1Count} / {row.l2Count}
                  </td>
                  <td className="px-3 py-2">{row.volumeUsd}</td>
                  <td className="px-3 py-2 text-xs">
                    {microUsdLabel(row.usdcPendingMicro)} / {microUsdLabel(row.usdcApprovedMicro)} /{" "}
                    {microUsdLabel(row.usdcPaidMicro)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {microUsdLabel(row.pplPendingMicro)} / {microUsdLabel(row.pplApprovedMicro)} /{" "}
                    {microUsdLabel(row.pplPaidMicro)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-lg border border-neutral-800 p-4" data-testid="partner-admin-detail">
          <h2 className="mb-3 text-lg font-semibold">Partner detail</h2>
          {!selectedRow ? <p className="text-neutral-500">Select a row to view referrals and ledger.</p> : null}
          {detailLoading ? <p className="text-neutral-400">Loading detail…</p> : null}
          {selectedRow && detail ? (
            <div className="space-y-4">
              <div>
                <div className="font-medium">{selectedRow.email}</div>
                <div className="text-xs text-neutral-500">{selectedRow.tierLabel}</div>
              </div>
              <section data-testid="partner-admin-tier-override" className="rounded border border-neutral-800 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-400">KOL tier override (USDC bps)</h3>
                <p className="mb-2 text-xs text-neutral-500">
                  Presets 700 / 900 / 1200 (7% / 9% / 12%). Must be at or above volume tier ({volumeTierFloorBps} bps).
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {KOL_TIER_OVERRIDE_PRESET_USDC_BPS.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                      onClick={() => setTierOverrideInput(String(bps))}
                    >
                      {bpsToPct(bps)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                    onClick={() => setTierOverrideInput("")}
                  >
                    Clear
                  </button>
                </div>
                <label className="mb-2 block text-xs text-neutral-400">
                  Override bps
                  <input
                    className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm"
                    inputMode="numeric"
                    value={tierOverrideInput}
                    onChange={(e) => setTierOverrideInput(e.target.value.replace(/\D/g, ""))}
                    placeholder={`≥ ${volumeTierFloorBps}`}
                  />
                </label>
                <button
                  type="button"
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                  disabled={tierSaveState === "saving"}
                  onClick={() => void saveTierOverride()}
                >
                  {tierSaveState === "saving" ? "Saving…" : "Save tier override"}
                </button>
                {tierSaveState === "saved" ? <p className="mt-2 text-xs text-emerald-400">Saved.</p> : null}
                {tierSaveError ? <p className="mt-2 text-xs text-red-400">{tierSaveError}</p> : null}
              </section>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-400">L1 referrals</h3>
                <ul className="space-y-1 text-xs">
                  {detail.l1.length === 0 ? <li className="text-neutral-500">None</li> : null}
                  {detail.l1.map((r) => (
                    <li key={r.userId}>
                      {r.email ?? r.referralCode} <span className="text-neutral-500">({r.referralCode})</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-400">L2 referrals</h3>
                <ul className="space-y-1 text-xs">
                  {detail.l2.length === 0 ? <li className="text-neutral-500">None</li> : null}
                  {detail.l2.map((r) => (
                    <li key={r.userId}>
                      {r.email ?? r.referralCode} <span className="text-neutral-500">({r.referralCode})</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-400">Commission feed</h3>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {detail.commissions.length === 0 ? <li className="text-neutral-500">No rows</li> : null}
                  {detail.commissions.slice(0, 20).map((c) => (
                    <li key={c.id} className="rounded border border-neutral-800 p-2">
                      <div>
                        L{c.level} · {c.status} · {c.usdcFormatted} + {c.pplFormatted} PPL
                      </div>
                      <div className="text-neutral-500">{new Date(c.createdAt).toLocaleString("en-US")}</div>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-400">Payout batches</h3>
                <ul className="space-y-1 text-xs">
                  {detail.payouts.length === 0 ? <li className="text-neutral-500">None</li> : null}
                  {detail.payouts.map((p) => (
                    <li key={p.id}>
                      {p.periodKey} · {p.status} · {p.usdcFormatted}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-3">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
