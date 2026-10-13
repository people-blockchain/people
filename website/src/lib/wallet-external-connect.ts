import { walletFeatures } from "./wallet-features.ts";

/**
 * External EVM wallets sign Cosmos EVM txs via injected providers / WalletConnect.
 */
export function externalWalletConnectAvailable(): boolean {
  return walletFeatures.externalWallets;
}

export function walletConnectProjectIdConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim());
}
