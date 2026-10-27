"use client";

import { useEffect, useState } from "react";

import { saleContractConfigured } from "@/lib/sale/config";

export type SalePhase = "closed" | "open";

type Resolved = { open: boolean; hubAcceptsUsdt: boolean };

let cached: Promise<Resolved> | null = null;

function loadConfig(): Promise<Resolved> {
  if (!cached) {
    cached = fetch("/api/sale/config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("config"))))
      .then((json: { hub?: { enabled?: boolean; stables?: string[] } }) => ({
        open: json.hub?.enabled === true,
        hubAcceptsUsdt: Array.isArray(json.hub?.stables) && json.hub.stables.includes("usdt"),
      }))
      .catch(() => {
        cached = null;
        return { open: false, hubAcceptsUsdt: false };
      });
  }
  return cached;
}

/**
 * The sale is "open" only when BOTH owner-controlled switches are on: the hub address
 * (env, visible to the client) and `hub.enabled` from `/api/sale/config`.
 * Until that is known — or if it cannot be loaded — the page says "closed".
 */
export function useSalePhase(initialOpen?: boolean): {
  phase: SalePhase;
  loading: boolean;
  hubAcceptsUsdt: boolean;
} {
  const configured = saleContractConfigured();
  const [state, setState] = useState<{ done: boolean; value: Resolved }>(() =>
    initialOpen !== undefined
      ? { done: true, value: { open: initialOpen, hubAcceptsUsdt: false } }
      : { done: !configured, value: { open: false, hubAcceptsUsdt: false } },
  );

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void loadConfig().then((value) => {
      if (active) setState({ done: true, value });
    });
    return () => {
      active = false;
    };
  }, [configured]);

  return {
    phase: configured && state.done && state.value.open ? "open" : "closed",
    loading: !state.done,
    hubAcceptsUsdt: state.value.hubAcceptsUsdt,
  };
}
