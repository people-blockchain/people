"use client";

import { useEffect, useState } from "react";

import {
  EMPTY_SALE_STATS,
  fetchRecentTrades,
  fetchSaleStats,
  type SaleStats,
  type SaleTrade,
} from "@/lib/sale/adapter";

/**
 * Live sale figures and the trade feed, from the chain adapter.
 *
 * Both start in the "no data" shape, which is also what they stay in until a
 * sale contract is configured — so the page renders "—" rather than a zero
 * dressed up as a reading.
 */
export function useSaleData(): { stats: SaleStats; trades: SaleTrade[]; loaded: boolean } {
  const [stats, setStats] = useState<SaleStats>(EMPTY_SALE_STATS);
  const [trades, setTrades] = useState<SaleTrade[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      const [nextStats, nextTrades] = await Promise.all([
        fetchSaleStats(controller.signal),
        fetchRecentTrades(8, controller.signal),
      ]);
      if (!active) return;
      setStats(nextStats);
      setTrades(nextTrades);
      setLoaded(true);
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return { stats, trades, loaded };
}
