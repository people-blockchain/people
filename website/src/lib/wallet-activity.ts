export interface WalletOperation {
  id: string; from: string; to: string; amount: number; fee: number; nonce?: number;
  timestamp: number; type: string; assetId?: string; blockHeight?: number;
  payload?: Record<string, unknown>;
}
const key = (chain: string, address: string) => `people-wallet-activity:${chain}:${address.toLowerCase()}`;
export function readPending(chain: string, address: string): WalletOperation[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(key(chain, address)) ?? "[]");
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is WalletOperation => row && typeof row.id === "string" && typeof row.from === "string" && typeof row.to === "string" && Number.isFinite(row.amount) && Number.isFinite(row.timestamp)).slice(0, 100);
  } catch { return []; }
}
/** Store only public transaction fields, never a signature, signing key or seed. */
export function trackPending(chain: string, address: string, tx: WalletOperation) {
  const record: WalletOperation = { id: tx.id, from: tx.from, to: tx.to, amount: tx.amount, fee: tx.fee, nonce: tx.nonce, timestamp: tx.timestamp, type: tx.type, assetId: tx.assetId, payload: tx.payload };
  try { localStorage.setItem(key(chain, address), JSON.stringify([record, ...readPending(chain, address).filter((item) => item.id !== tx.id)].slice(0, 100))); } catch { /* Storage may be disabled; live history still works. */ }
}
export function forgetPending(chain: string, address: string, confirmedIds: string[]) {
  const ids = new Set(confirmedIds);
  try { localStorage.setItem(key(chain, address), JSON.stringify(readPending(chain, address).filter((row) => !ids.has(row.id)))); } catch {}
}
export function operationStatus(tx: WalletOperation, finalizedHeight: number, now: number) {
  if (tx.blockHeight && tx.blockHeight > 0) return tx.blockHeight <= finalizedHeight ? "finalized" : "included";
  return now - tx.timestamp > 120000 ? "unresolved" : "pending";
}
export function parseWalletAddress(value: string): string | null {
  const text = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/(?:explorer\/)?address\/(0x[0-9a-fA-F]{40})\/?$/);
    return match?.[1] ?? null;
  } catch { return null; }
}
export function maxTransferAmount(balance: number, fee: number): string {
  if (!Number.isFinite(balance) || balance <= fee) return "0";
  // Round down so floating-point subtraction cannot overspend the account.
  return String(Math.max(0, Math.floor((balance - fee) * 1e8) / 1e8));
}
