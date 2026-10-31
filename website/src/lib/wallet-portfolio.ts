/**
 * What /wallet shows for the connected account.
 *
 * A local or cloud session lives in WalletContext. An injected or WalletConnect account lives
 * only in ExternalWalletContext and never becomes a session, so the page used to stop at the
 * connect panel ("Connected wallet") and skip tokens, NFTs, and history. External accounts are
 * shown read-only: the address is enough to load balances and NFTs, and actions that need a
 * local private key stay hidden.
 */
export type WalletPortfolioTab = "tokens" | "nft" | "history";

export type WalletPortfolio = {
  status: "locked" | "local" | "external";
  address: string | null;
  readOnly: boolean;
  tabs: readonly WalletPortfolioTab[];
  /** Send, faucet, vault settings, and NFT transfer. They sign with the on-device key. */
  localKeyActions: boolean;
};

const TABS: readonly WalletPortfolioTab[] = ["tokens", "nft", "history"];

function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveWalletPortfolio(source: {
  sessionAddress?: string | null;
  externalAddress?: string | null;
}): WalletPortfolio {
  const sessionAddress = present(source.sessionAddress);
  if (sessionAddress) {
    return { status: "local", address: sessionAddress, readOnly: false, tabs: TABS, localKeyActions: true };
  }
  const externalAddress = present(source.externalAddress);
  if (externalAddress) {
    return { status: "external", address: externalAddress, readOnly: true, tabs: TABS, localKeyActions: false };
  }
  return { status: "locked", address: null, readOnly: false, tabs: [], localKeyActions: false };
}
