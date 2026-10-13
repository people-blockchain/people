"use client";

import Link from "next/link";
import { Chip } from "@/components/ui/primitives";
import { useLanguage } from "@/context/LanguageContext";
import { usePublicNetworkStatus } from "@/hooks/usePublicNetworkStatus";
import { walletCopy } from "@/lib/wallet-copy";

export function NetworkStatus({ phase }: { phase?: "checking" | "online" | "offline" } = {}) {
  return phase ? <NetworkStatusLabel phase={phase} /> : <CheckedNetworkStatus />;
}

function CheckedNetworkStatus() {
  const { phase } = usePublicNetworkStatus();
  return <NetworkStatusLabel phase={phase} />;
}

function NetworkStatusLabel({ phase }: { phase: "checking" | "online" | "offline" }) {
  const { lang } = useLanguage();
  const t = walletCopy[lang];

  const label =
    phase === "checking"
      ? t.networkChecking
      : phase === "online"
        ? t.testnet
        : t.networkUnavailable;

  const tone = phase === "checking" ? "neutral" : phase === "online" ? "value" : "warm";

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="network-status">
      <Chip tone={tone}>{label}</Chip>
      {phase === "online" ? (
        <Link href="/explorer" className="text-sm font-semibold text-brand hover:underline">
          Explorer
        </Link>
      ) : null}
    </div>
  );
}
