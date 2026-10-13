export type WalletModalAction = { type: "open" } | { type: "close" };

export function walletModalReducer(open: boolean, action: WalletModalAction): boolean {
  switch (action.type) {
    case "open":
      return true;
    case "close":
      return false;
    default:
      return open;
  }
}
