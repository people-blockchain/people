"use client";

import { useEffect, useState } from "react";
import type { FactoryPublicConfig } from "@/lib/factory-config";

export type PublicNetworkPhase = "checking" | "online" | "offline";

const HEALTH_RETRY_MS = 450;
const HEALTH_ATTEMPTS = 2;

import { isCosmosEvmChain } from "@/lib/chain-mode";

async function fetchHealthOk(): Promise<boolean> {
  try {
    const path = isCosmosEvmChain() ? "/api/evm/compat/health" : "/api/network/health";
    const res = await fetch(path, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves public testnet reachability for UI chips. Starts neutral (`checking`);
 * only marks `offline` after config says testnet is configured and health checks fail.
 */
export function usePublicNetworkStatus(): {
  phase: PublicNetworkPhase;
  config: FactoryPublicConfig | null;
} {
  const [phase, setPhase] = useState<PublicNetworkPhase>("checking");
  const [config, setConfig] = useState<FactoryPublicConfig | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let cfg: FactoryPublicConfig | null = null;
      try {
        const res = await fetch("/api/factory/config", { cache: "no-store" });
        if (res.ok) {
          cfg = (await res.json()) as FactoryPublicConfig;
        }
      } catch {
        cfg = null;
      }

      if (cancelled) return;
      setConfig(cfg);

      if (cfg?.networkStatus !== "testnet") {
        setPhase("offline");
        return;
      }

      for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt++) {
        if (await fetchHealthOk()) {
          if (!cancelled) setPhase("online");
          return;
        }
        if (attempt < HEALTH_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, HEALTH_RETRY_MS));
        }
      }

      if (!cancelled) setPhase("offline");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { phase, config };
}
