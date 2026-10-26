"use client";

import { useEffect, useRef } from "react";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { base } from "viem/chains";

import {
  INITIAL_DELIVERY_STATE,
  reduceBalanceSample,
  type BalanceDelivery,
  type DeliveryState,
} from "@/lib/sale/autoBuy";
import { BASE_MAINNET_USDC } from "@/lib/sale/saleChain";

/** How often the owner's USDC balance on Base mainnet is read while watching. */
export const DELIVERY_POLL_MS = 6000;

/**
 * Watches the USDC balance of `owner` on Base mainnet and reports increases. Read-only; the first
 * read only sets the baseline, so existing funds never trigger anything. Does nothing while
 * `enabled` is false.
 */
export function useUsdcDelivery({
  enabled,
  owner,
  rpcUrl,
  onDelivery,
}: {
  enabled: boolean;
  owner: Address | "";
  rpcUrl: string;
  onDelivery: (delivery: BalanceDelivery) => void;
}) {
  const onDeliveryRef = useRef(onDelivery);
  useEffect(() => {
    onDeliveryRef.current = onDelivery;
  }, [onDelivery]);

  useEffect(() => {
    if (!enabled || !owner) return;
    let active = true;
    let inFlight = false;
    let state: DeliveryState = INITIAL_DELIVERY_STATE;
    const client = createPublicClient({ chain: base, transport: http(rpcUrl) });

    const sample = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const balance = await client.readContract({
          address: BASE_MAINNET_USDC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        if (!active) return;
        const next = reduceBalanceSample(state, balance);
        state = next.state;
        if (next.delivery) onDeliveryRef.current(next.delivery);
      } catch {
        /* transient RPC error: try again on the next tick */
      } finally {
        inFlight = false;
      }
    };

    void sample();
    const timer = window.setInterval(() => void sample(), DELIVERY_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled, owner, rpcUrl]);
}
