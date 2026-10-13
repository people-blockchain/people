export type ExplorerAccount = { address: string; balance?: number; balances?: Record<string, number> };
export const ACCOUNT_SCAN_LIMIT = 10_000;

/** Wallet balances only: protocol reserves are not fabricated as wallet holders. */
export function tokenHolders(accounts: ExplorerAccount[], assetId: string) {
  const id = assetId.toLowerCase();
  const holders = accounts.map(account => ({
    address: account.address,
    balance: id === "ppl" ? account.balances?.ppl ?? account.balance ?? 0 : account.balances?.[id] ?? 0,
  })).filter(row => Number.isFinite(row.balance) && row.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));
  const total = holders.reduce((sum, row) => sum + row.balance, 0);
  return { total, holders: holders.map(row => ({ ...row, share: total > 0 ? row.balance / total * 100 : 0 })) };
}

export function holderChart(holders: ReturnType<typeof tokenHolders>["holders"], top = 5) {
  const shown = holders.slice(0, top);
  const other = holders.slice(top).reduce((sum, row) => sum + row.share, 0);
  return [...shown.map(row => ({ label: row.address, share: row.share })), ...(other > 0 ? [{ label: "other", share: other }] : [])];
}

/** Creation metadata contains a block height, never a Unix timestamp. */
export function creationTimestamp(block: { header?: { height?: number; timestamp?: number } } | null, height: number) {
  const timestamp = block?.header?.timestamp;
  return block?.header?.height === height && typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function formatShare(value: number): string {
  return value > 0 && value < 0.01 ? "<0.01%" : `${value.toFixed(2)}%`;
}
