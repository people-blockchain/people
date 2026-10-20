"use client";

import { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChainType, LiFiWidget, WidgetEvent, widgetEvents, type WidgetConfig } from "@lifi/widget";
import { EthereumProvider } from "@lifi/widget-provider-ethereum";
import { SolanaProvider } from "@lifi/widget-provider-solana";
import type { Address } from "viem";

import { useTheme } from "@/context/ThemeContext";
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDT_ADDRESS,
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
  LIFI_FEATURED_SOURCE_TOKENS,
} from "@/lib/sale/bridge";

const queryClient = new QueryClient();

type BuyLifiBridgeProps = {
  open: boolean;
  onClose: () => void;
  recipient: Address;
  fromChain: number;
  fromToken: string;
  fromAmount: string;
  variant?: "cross-chain" | "base-usdt";
  onBridgeComplete?: () => void;
  testId?: string;
};

function useBridgeWidgetConfig(
  recipient: Address,
  variant: "cross-chain" | "base-usdt",
  fromChain: number,
  fromToken: string,
  fromAmount: string,
  appearance: "light" | "dark",
): WidgetConfig {
  return useMemo(() => {
    const hiddenBase = {
      toAddress: true,
      toToken: true,
      appearance: true,
      language: true,
      poweredBy: true,
    } as const;

    const shared: WidgetConfig = {
      integrator: "PEOPLE",
      variant: "compact",
      appearance,
      languages: { default: "en" },
      providers: [EthereumProvider(), SolanaProvider()],
      fromChain,
      fromToken,
      fromAmount,
      toChain: BASE_CHAIN_ID,
      toToken: BASE_USDC_ADDRESS,
      toAddress: {
        address: recipient,
        chainType: ChainType.EVM,
      },
      chains: {
        to: { allow: [BASE_CHAIN_ID] },
        types: { allow: [ChainType.EVM, ChainType.SVM] },
      },
      hiddenUI: hiddenBase,
      disabledUI: { toAddress: true, toToken: true },
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
        hiddenUI: { ...hiddenBase, fromToken: true, fromChain: true },
      };
    }

    return {
      ...shared,
      chains: {
        ...shared.chains,
        from: { allow: [...LIFI_BRIDGE_SOURCE_CHAIN_IDS, BASE_CHAIN_ID] },
      },
      tokens: {
        featured: [...LIFI_FEATURED_SOURCE_TOKENS],
      },
    };
  }, [recipient, variant, fromChain, fromToken, fromAmount, appearance]);
}

function BridgeWidgetInner({
  open,
  onClose,
  recipient,
  variant = "cross-chain",
  fromChain,
  fromToken,
  fromAmount,
  onBridgeComplete,
  testId,
}: BuyLifiBridgeProps) {
  const { theme } = useTheme();
  const appearance = theme === "dark" ? "dark" : "light";
  const config = useBridgeWidgetConfig(
    recipient,
    variant,
    fromChain,
    fromToken,
    fromAmount,
    appearance,
  );

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--elev-3)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-end border-b border-line px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-ink-2 hover:text-ink"
          >
            ×
          </button>
        </div>
        <div data-testid={testId} className="max-h-[calc(90vh-3rem)] overflow-y-auto p-2">
          <LiFiWidget integrator="PEOPLE" config={config} />
        </div>
      </div>
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
