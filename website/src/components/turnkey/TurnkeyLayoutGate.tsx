"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { isTurnkeyWalletProvider } from "@/lib/wallet-provider-flag";

const TurnkeyEmbeddedProvider = dynamic(
  () => import("./TurnkeyEmbeddedProvider").then((mod) => mod.TurnkeyEmbeddedProvider),
  { ssr: false },
);

/** Loads the Turnkey React kit only when `WALLET_PROVIDER=turnkey`. Legacy is unchanged. */
export function TurnkeyLayoutGate({ children }: { children: ReactNode }) {
  if (!isTurnkeyWalletProvider()) return children;
  return <TurnkeyEmbeddedProvider>{children}</TurnkeyEmbeddedProvider>;
}
