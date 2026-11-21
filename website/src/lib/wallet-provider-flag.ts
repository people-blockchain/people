/**
 * Wallet custody backend. Default `legacy` keeps Web3Auth + `user_wallet_vault` AES-GCM
 * wrap keys. `turnkey` provisions a Turnkey sub-organization per user and signs in the
 * enclave (no private keys on this server).
 *
 * Server source of truth: `WALLET_PROVIDER`. Optional `NEXT_PUBLIC_WALLET_PROVIDER` is
 * the same value for the client bundle; `/api/auth/features` always reports the server flag.
 */
export type WalletProviderKind = "legacy" | "turnkey";

function parseWalletProvider(raw: string | undefined): WalletProviderKind {
  const value = raw?.trim().toLowerCase();
  if (value === "turnkey") return "turnkey";
  return "legacy";
}

export function readWalletProvider(): WalletProviderKind {
  return parseWalletProvider(process.env.WALLET_PROVIDER ?? process.env.NEXT_PUBLIC_WALLET_PROVIDER);
}

export function isTurnkeyWalletProvider(): boolean {
  return readWalletProvider() === "turnkey";
}

export function isLegacyWalletProvider(): boolean {
  return readWalletProvider() === "legacy";
}
