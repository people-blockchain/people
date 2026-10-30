"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentsPublicCopy } from "@/lib/agents-public-content";
import type { Language } from "@/lib/preferences";
import { weiFromField } from "@/lib/asset-amounts";
import { PplAmount } from "@/components/ui/PplAmount";

type LiveAgentCopy = AgentsPublicCopy["liveAgent"];

type AgentSpendEvent = {
  recipient: string;
  amountWei: string;
  blockNumber: number;
  transactionHash: string;
  timestampMs: number | null;
};

type Snapshot = {
  wallet: string;
  executor: string;
  guardian: string;
  balanceWei: string;
  events: AgentSpendEvent[];
};

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right">
        <Link
          href={`/explorer/address/${address}`}
          className="font-mono text-sm text-brand hover:underline"
          title={address}
        >
          {shortAddress(address)}
        </Link>
      </dd>
    </div>
  );
}

export function CommunityAgentLive({ copy, lang }: { copy: LiveAgentCopy; lang: Language }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch("/api/agents/community-agent")
      .then((res) => {
        if (!res.ok) throw new Error(`status_${res.status}`);
        return res.json();
      })
      .then((data: Snapshot) => {
        if (cancelled) return;
        setSnapshot(data);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface-2 p-4 sm:p-6"
      data-testid="agents-community-live"
    >
      <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
        {copy.badge}
      </span>
      <h2 className="mt-3 text-h3 font-bold text-ink">{copy.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy.lead}</p>

      {snapshot ? (
        <dl className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface p-3 sm:p-4">
          <AddressRow label={copy.walletLabel} address={snapshot.wallet} />
          <AddressRow label={copy.executorLabel} address={snapshot.executor} />
          <AddressRow label={copy.guardianLabel} address={snapshot.guardian} />
          <div className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-xs text-ink-3">{copy.balanceLabel}</dt>
            <dd className="font-mono text-sm font-semibold text-ink">
              <PplAmount wei={weiFromField(snapshot.balanceWei) ?? BigInt(0)} />
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="mt-4 rounded-2xl border border-line bg-surface p-3 sm:p-4">
        <p className="text-xs text-ink-3">{copy.limitsLabel}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{copy.limitsText}</p>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink">{copy.eventsTitle}</h3>

        {status === "loading" ? (
          <p className="mt-3 text-sm text-ink-3">{copy.eventsLoading}</p>
        ) : status === "error" ? (
          <p className="mt-3 text-sm text-ink-3">{copy.eventsError}</p>
        ) : snapshot && snapshot.events.length === 0 ? (
          <p className="mt-3 text-sm text-ink-3">{copy.eventsEmpty}</p>
        ) : snapshot ? (
          <ul className="mt-3 space-y-2">
            {snapshot.events.map((event) => (
              <li
                key={event.transactionHash}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              >
                <span className="font-mono font-semibold text-ink">
                  <PplAmount wei={weiFromField(event.amountWei) ?? BigInt(0)} />
                </span>
                <Link
                  href={`/explorer/address/${event.recipient}`}
                  className="font-mono text-brand hover:underline"
                  title={event.recipient}
                >
                  {shortAddress(event.recipient)}
                </Link>
                <span className="text-xs text-ink-3">
                  {event.timestampMs ? new Date(event.timestampMs).toLocaleString(lang) : `#${event.blockNumber}`}
                </span>
                <Link
                  href={`/explorer/tx/${event.transactionHash}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  {copy.viewTx}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
