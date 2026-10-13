"use client";

import type { ReactNode } from "react";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { ExternalWalletProvider } from "@/context/ExternalWalletContext";

export function ChainProviders({ children }: { children: ReactNode }) {
  if (!isCosmosEvmChain()) return children;
  return <ExternalWalletProvider>{children}</ExternalWalletProvider>;
}
