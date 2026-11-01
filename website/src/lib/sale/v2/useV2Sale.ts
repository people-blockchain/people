"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, http, type Address, type Hex } from "viem";

import { PPL_CURVE_HUB_V2_ABI, ZERO_BYTES32 } from "./abi";
import { V2_PHASES, type V2Phase, type V2PreviewState } from "./constants";
import { previewSnapshot, type V2Chain } from "./logic";

export type V2SaleSnapshot = {
  phase: V2Phase;
  openedAtSec: number;
  spotPriceWad: bigint;
  personId: Hex | null;
};

export type V2Verification = {
  signedIn: boolean;
  verifiedHuman: boolean;
  loading: boolean;
};

type State = {
  snapshot: V2SaleSnapshot | null;
  loading: boolean;
  error: boolean;
};

const INITIAL: State = { snapshot: null, loading: true, error: false };

function asPhase(raw: number | bigint): V2Phase {
  const n = Number(raw);
  return (n >= 0 && n <= 4 ? n : V2_PHASES.NotOpen) as V2Phase;
}

/**
 * Reads the small V2 surface the panel needs. Preview mode is resolved before
 * any effect runs, so screenshots never touch the RPC.
 */
export function useV2Sale(input: {
  chain: V2Chain;
  account: Address | null;
  previewState: V2PreviewState | null;
  refreshKey?: number;
}) {
  const { chain, account, previewState, refreshKey = 0 } = input;
  const preview = useMemo(() => (previewState ? previewSnapshot(previewState) : null), [previewState]);

  const [state, setState] = useState<State>(INITIAL);
  const [verification, setVerification] = useState<V2Verification>(
    preview
      ? { signedIn: true, verifiedHuman: preview.siteVerified, loading: false }
      : { signedIn: false, verifiedHuman: false, loading: true },
  );

  useEffect(() => {
    if (preview) return;
    let active = true;
    void fetch("/api/founders/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { signedIn?: boolean; saleVerified?: boolean } | null) => {
        if (!active) return;
        setVerification({
          signedIn: json?.signedIn === true,
          verifiedHuman: json?.saleVerified === true,
          loading: false,
        });
      })
      .catch(() => {
        if (active) setVerification({ signedIn: false, verifiedHuman: false, loading: false });
      });
    return () => {
      active = false;
    };
  }, [preview, refreshKey]);

  useEffect(() => {
    if (preview) return;
    if (!chain.hubAddress) {
      setState({ snapshot: null, loading: false, error: true });
      return;
    }
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const client = createPublicClient({
      chain: chain.chain,
      transport: http(undefined, { timeout: 12_000 }),
    });
    const hub = chain.hubAddress as Address;
    void Promise.all([
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "phase" }),
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "openedAt" }),
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "spotPriceWad" }),
      account
        ? client.readContract({
            address: hub,
            abi: PPL_CURVE_HUB_V2_ABI,
            functionName: "personOf",
            args: [account],
          })
        : Promise.resolve(ZERO_BYTES32),
    ])
      .then(([phase, openedAt, spotPriceWad, personId]) => {
        if (!active) return;
        setState({
          snapshot: {
            phase: asPhase(phase),
            openedAtSec: Number(openedAt),
            spotPriceWad,
            personId: personId === ZERO_BYTES32 ? null : (personId as Hex),
          },
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (active) setState({ snapshot: null, loading: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [chain.chain, chain.hubAddress, account, preview, refreshKey]);

  if (preview) {
    return {
      snapshot: {
        phase: preview.phase,
        openedAtSec: preview.openedAtSec,
        spotPriceWad: preview.spotPriceWad,
        personId: preview.personId as Hex | null,
      } satisfies V2SaleSnapshot,
      loading: false,
      error: false,
      verification: { signedIn: true, verifiedHuman: preview.siteVerified, loading: false },
      preview,
    };
  }

  return { ...state, verification, preview: null };
}

/** Re-runs the on-chain reads after a verify/buy transaction. */
export function useV2Refresh() {
  const [key, setKey] = useState(0);
  const refresh = useCallback(() => setKey((n) => n + 1), []);
  return { refreshKey: key, refresh };
}

export type V2PhaseSnapshot = {
  phase: V2Phase | null;
  openedAtSec: number;
  spotPriceWad: bigint | null;
};

/**
 * Reads only the phase needed by the page hero, so the heading can follow the
 * V2 whitelist state without duplicating the rest of the sale snapshot.
 */
export function useV2Phase(input: {
  chain: V2Chain;
  previewState: V2PreviewState | null;
  refreshKey?: number;
  enabled?: boolean;
}): V2PhaseSnapshot {
  const { chain, previewState, refreshKey = 0, enabled = true } = input;
  const preview = useMemo(() => (previewState ? previewSnapshot(previewState) : null), [previewState]);
  const [state, setState] = useState<V2PhaseSnapshot>(() => ({
    phase: enabled ? (preview?.phase ?? null) : null,
    openedAtSec: enabled ? (preview?.openedAtSec ?? 0) : 0,
    spotPriceWad: enabled ? (preview?.spotPriceWad ?? null) : null,
  }));

  useEffect(() => {
    if (!enabled) {
      setState({ phase: null, openedAtSec: 0, spotPriceWad: null });
      return;
    }
    if (preview) {
      setState({ phase: preview.phase, openedAtSec: preview.openedAtSec, spotPriceWad: preview.spotPriceWad });
      return;
    }
    if (!chain.hubAddress) {
      setState({ phase: null, openedAtSec: 0, spotPriceWad: null });
      return;
    }
    let active = true;
    const client = createPublicClient({
      chain: chain.chain,
      transport: http(undefined, { timeout: 12_000 }),
    });
    const hub = chain.hubAddress as Address;
    void Promise.all([
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "phase" }),
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "openedAt" }),
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "spotPriceWad" }),
    ])
      .then(([phase, openedAt, spotPriceWad]) => {
        if (active) {
          setState({ phase: asPhase(phase), openedAtSec: Number(openedAt), spotPriceWad });
        }
      })
      .catch(() => {
        if (active) setState({ phase: null, openedAtSec: 0, spotPriceWad: null });
      });
    return () => {
      active = false;
    };
  }, [chain.chain, chain.hubAddress, enabled, preview, refreshKey]);

  return state;
}

/**
 * Today's remaining sell-back room for all sellers together, read from
 * `sellBackCapToday()` in USD. `null` while there is no live reading (flag off,
 * no hub, preview, or a failed read) — the page then says so instead of
 * showing a number.
 */
export type V2SellBackToday = {
  /** Global sell-back room left in the rolling 24 hours (USD), or null when unknown. */
  remainingUsd: number | null;
  /** True once the reserve has moved to liquidity: sell-back is closed for good. */
  released: boolean;
};

/**
 * Sell-back room for `/buy`. Graduation does not close sell-back in the contract; only the
 * liquidity release does, so the page reads `liquidityReleased` instead of the phase.
 */
export function useV2SellBackToday(input: {
  chain: V2Chain;
  enabled: boolean;
  refreshKey?: number;
}): V2SellBackToday {
  const { chain, enabled, refreshKey = 0 } = input;
  const [state, setState] = useState<V2SellBackToday>({ remainingUsd: null, released: false });

  useEffect(() => {
    if (!enabled || !chain.hubAddress) {
      setState({ remainingUsd: null, released: false });
      return;
    }
    let active = true;
    const client = createPublicClient({
      chain: chain.chain,
      transport: http(undefined, { timeout: 12_000 }),
    });
    const hub = chain.hubAddress as Address;
    void Promise.all([
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "sellBackCapToday" }),
      client.readContract({ address: hub, abi: PPL_CURVE_HUB_V2_ABI, functionName: "liquidityReleased" }),
    ])
      .then(([[globalRemainingUsd6], released]) => {
        if (active) setState({ remainingUsd: Number(globalRemainingUsd6) / 1_000_000, released });
      })
      .catch(() => {
        if (active) setState({ remainingUsd: null, released: false });
      });
    return () => {
      active = false;
    };
  }, [chain.chain, chain.hubAddress, enabled, refreshKey]);

  return state;
}
