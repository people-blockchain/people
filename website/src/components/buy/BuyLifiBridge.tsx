"use client";

import { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChainType, LiFiWidget, WidgetEvent, widgetEvents, type WidgetConfig } from "@lifi/widget";
import { EthereumProvider } from "@lifi/widget-provider-ethereum";
import { SolanaProvider } from "@lifi/widget-provider-solana";
import type { Address } from "viem";

import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDT_ADDRESS,
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
  LIFI_FEATURED_SOURCE_TOKENS,
} from "@/lib/sale/bridge";

const queryClient = new QueryClient();

type BuyLifiBridgeProps = {
  recipient: Address;
  variant?: "cross-chain" | "base-usdt";
  onBridgeComplete?: () => void;
  testId?: string;
};

function useBridgeWidgetConfig(
  recipient: Address,
  variant: "cross-chain" | "base-usdt",
): WidgetConfig {
  return useMemo(() => {
    const shared: WidgetConfig = {
      integrator: "PEOPLE",
      providers: [EthereumProvider(), SolanaProvider()],
      toChain: BASE_CHAIN_ID,
      toToken: BASE_USDC_ADDRESS,
      toAddress: {
        name: "Your wallet on Base",
        address: recipient,
        chainType: ChainType.EVM,
      },
      chains: {
        to: { allow: [BASE_CHAIN_ID] },
        types: { allow: [ChainType.EVM, ChainType.SVM] },
      },
      hiddenUI: {
        toAddress: true,
        toToken: true,
      },
      explorerUrls: {
        [BASE_CHAIN_ID]: ["https://scan.li.fi"],
      },
      theme: {
        container: {
          border: "1px solid var(--line)",
          borderRadius: "16px",
        },
      },
    };

    if (variant === "base-usdt") {
      return {
        ...shared,
        fromChain: BASE_CHAIN_ID,
        fromToken: BASE_USDT_ADDRESS,
        chains: {
          ...shared.chains,
          from: { allow: [BASE_CHAIN_ID] },
        },
        tokens: {
          from: {
            allow: [{ chainId: BASE_CHAIN_ID, address: BASE_USDT_ADDRESS }],
          },
        },
        hiddenUI: {
          ...shared.hiddenUI,
          fromToken: true,
          fromChain: true,
        },
      };
    }

    return {
      ...shared,
      chains: {
        ...shared.chains,
        from: { allow: [...LIFI_BRIDGE_SOURCE_CHAIN_IDS] },
      },
      tokens: {
        featured: [...LIFI_FEATURED_SOURCE_TOKENS],
      },
    };
  }, [recipient, variant]);
}

function BridgeWidgetInner({
  recipient,
  variant = "cross-chain",
  onBridgeComplete,
  testId,
}: BuyLifiBridgeProps) {
  const config = useBridgeWidgetConfig(recipient, variant);

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
