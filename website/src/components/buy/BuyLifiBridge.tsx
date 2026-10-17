"use client";

import { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChainType, LiFiWidget, WidgetEvent, widgetEvents, type WidgetConfig } from "@lifi/widget";
import { EthereumProvider } from "@lifi/widget-provider-ethereum";
import { SolanaProvider } from "@lifi/widget-provider-solana";
import { TronProvider } from "@lifi/widget-provider-tron";
import type { Address } from "viem";

import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
} from "@/lib/sale/bridge";

const queryClient = new QueryClient();

type BuyLifiBridgeProps = {
  recipient: Address;
  onBridgeComplete?: () => void;
  testId?: string;
};

function useBridgeWidgetConfig(recipient: Address): WidgetConfig {
  return useMemo(
    () => ({
      integrator: "PEOPLE",
      providers: [EthereumProvider(), SolanaProvider(), TronProvider()],
      toChain: BASE_CHAIN_ID,
      toToken: BASE_USDC_ADDRESS,
      toAddress: {
        name: "Your wallet on Base",
        address: recipient,
        chainType: ChainType.EVM,
      },
      chains: {
        to: { allow: [BASE_CHAIN_ID] },
        from: { allow: [...LIFI_BRIDGE_SOURCE_CHAIN_IDS] },
      },
      hiddenUI: {
        toAddress: true,
        toToken: true,
      },
      theme: {
        container: {
          border: "1px solid var(--line)",
          borderRadius: "16px",
        },
      },
    }),
    [recipient],
  );
}

function BridgeWidgetInner({ recipient, onBridgeComplete, testId }: BuyLifiBridgeProps) {
  const config = useBridgeWidgetConfig(recipient);

  useEffect(() => {
    if (!onBridgeComplete) return;
    const handler = () => {
      onBridgeComplete();
    };
    widgetEvents.on(WidgetEvent.RouteExecutionCompleted, handler);
    return () => {
      widgetEvents.off(WidgetEvent.RouteExecutionCompleted, handler);
    };
  }, [onBridgeComplete]);

  return (
    <div data-testid={testId} className="min-h-[420px] overflow-hidden rounded-2xl border border-line bg-surface-2">
      <LiFiWidget integrator="PEOPLE" config={config} />
    </div>
  );
}

/** LI.FI bridge widget — client-only; wrapped in its own React Query provider. */
export function BuyLifiBridge(props: BuyLifiBridgeProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <BridgeWidgetInner {...props} />
    </QueryClientProvider>
  );
}
