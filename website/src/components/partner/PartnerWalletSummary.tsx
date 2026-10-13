"use client";

import { useCallback, useEffect, useState } from "react";
import { networkJson } from "@/lib/network-client";
import type { PartnerStrings } from "@/lib/partner/copy";
import {
  aggregateGrowthRewards,
  formatPplAmount,
  parseGrowthClaimsFromSnapshot,
  resolvePplBalanceFromAccount,
  type GrowthRewardTotals,
} from "@/lib/partner/wallet-summary";

type LoadState = "loading" | "ready" | "error";

export function PartnerWalletSummary({ address, t }: { address: string; t: PartnerStrings }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [balance, setBalance] = useState(0);
  const [growth, setGrowth] = useState<GrowthRewardTotals>({ accrued: 0, claimable: 0, claimed: 0 });

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountBody, snapshotBody] = await Promise.all([
        networkJson<unknown>(`address/${encodeURIComponent(address)}`),
        networkJson<unknown>("snapshot"),
      ]);
      setBalance(resolvePplBalanceFromAccount(accountBody));
      const claims = parseGrowthClaimsFromSnapshot(snapshotBody, address);
      setGrowth(aggregateGrowthRewards(claims));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === "loading") {
    return (
      <div className="mt-4 space-y-3" aria-busy="true">
        <div className="h-4 w-32 animate-pulse rounded bg-line/60" />
        <div className="h-6 w-40 animate-pulse rounded bg-line/60" />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="h-14 animate-pulse rounded-lg bg-line/40" />
          <div className="h-14 animate-pulse rounded-lg bg-line/40" />
          <div className="h-14 animate-pulse rounded-lg bg-line/40" />
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="mt-4 rounded-xl border border-line bg-surface-2 px-3 py-3">
        <p className="text-sm text-ink-2">{t.walletLoadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand"
        >
          {t.walletRefresh}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-3">{t.pplBalance}</p>
        <p className="mt-1 font-mono text-lg text-ink">{formatPplAmount(balance)}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-3">{t.growthRewardsTitle}</p>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-canvas-2 px-3 py-2">
            <dt className="text-xs text-ink-3">{t.growthAccrued}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{formatPplAmount(growth.accrued)}</dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas-2 px-3 py-2">
            <dt className="text-xs text-ink-3">{t.growthClaimable}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{formatPplAmount(growth.claimable)}</dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas-2 px-3 py-2">
            <dt className="text-xs text-ink-3">{t.growthClaimed}</dt>
            <dd className="mt-1 font-mono text-sm text-ink">{formatPplAmount(growth.claimed)}</dd>
          </div>
        </dl>
      </div>
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2"
      >
        {t.walletRefresh}
      </button>
    </div>
  );
}
