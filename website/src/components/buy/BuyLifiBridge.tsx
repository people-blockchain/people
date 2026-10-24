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
  BASE_USDT_ADDRESS,
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
  LIFI_FEATURED_SOURCE_TOKENS,
  LIFI_LANG,
} from "@/lib/sale/bridge";

type LanguageKey = NonNullable<NonNullable<WidgetConfig["languages"]>["default"]>;

const queryClient = new QueryClient();

type BuyLifiBridgeProps = {
  recipient: Address;
  variant?: "cross-chain" | "base-usdt";
  lang?: string;
  toAddressName?: string;
  /** Called with the completed LI.FI route (payload of `RouteExecutionCompleted`). */
  onBridgeComplete?: (route?: unknown) => void;
  onBridgeFailed?: (reason: "rejected" | "failed") => void;
  onBridgeProgress?: (info: { txLink?: string }) => void;
  testId?: string;
};

function isUserRejection(error: unknown): boolean {
  const e = error as { code?: number | string; name?: string; message?: string; cause?: { code?: number } } | null;
  if (!e) return false;
  return (
    e.code === 4001 ||
    e.code === 1012 ||
    e.cause?.code === 4001 ||
    e.name === "UserRejectedRequestError" ||
    /user (rejected|denied)/i.test(e.message ?? "")
  );
}

function useBridgeWidgetConfig(
  recipient: Address,
  variant: "cross-chain" | "base-usdt",
  lang: string,
  toAddressName: string,
): WidgetConfig {
  return useMemo(() => {
    const widgetLang = (LIFI_LANG[lang] ?? "en") as LanguageKey;
    const shared: WidgetConfig = {
      integrator: "PEOPLE",
      providers: [EthereumProvider(), SolanaProvider(), TronProvider()],
      languages: { default: widgetLang, allow: [widgetLang, "en"] },
      toChain: BASE_CHAIN_ID,
      toToken: BASE_USDC_ADDRESS,
      toAddress: {
        name: toAddressName,
        address: recipient,
        chainType: ChainType.EVM,
      },
      chains: {
        to: { allow: [BASE_CHAIN_ID] },
        types: { allow: [ChainType.EVM, ChainType.SVM, ChainType.TVM] },
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
  }, [recipient, variant, lang, toAddressName]);
}

function BridgeWidgetInner({
  recipient,
  variant = "cross-chain",
  lang = "en",
  toAddressName = "Your wallet on Base",
  onBridgeComplete,
  onBridgeFailed,
  onBridgeProgress,
  testId,
}: BuyLifiBridgeProps) {
  const config = useBridgeWidgetConfig(recipient, variant, lang, toAddressName);

  useEffect(() => {
    if (!onBridgeFailed) return;
    const failed = (update: { process?: { error?: unknown } }) => {
      onBridgeFailed(isUserRejection(update?.process?.error) ? "rejected" : "failed");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      if (reason?.name === "SDKError" && /user rejected/i.test(reason.message ?? "")) {
        event.preventDefault();
        onBridgeFailed("rejected");
      }
    };
    widgetEvents.on(WidgetEvent.RouteExecutionFailed, failed as never);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      widgetEvents.off(WidgetEvent.RouteExecutionFailed, failed as never);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [onBridgeFailed]);

  useEffect(() => {
    if (!onBridgeProgress) return;
    const updated = (update: { route?: { steps?: { execution?: { process?: { txLink?: string }[] } }[] } }) => {
      const processes = update?.route?.steps?.[0]?.execution?.process ?? [];
      onBridgeProgress({ txLink: processes[processes.length - 1]?.txLink });
    };
    widgetEvents.on(WidgetEvent.RouteExecutionUpdated, updated as never);
    return () => {
      widgetEvents.off(WidgetEvent.RouteExecutionUpdated, updated as never);
    };
  }, [onBridgeProgress]);

  useEffect(() => {
    if (!onBridgeComplete) return;
    const handler = (route?: unknown) => {
      onBridgeComplete(route);
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
