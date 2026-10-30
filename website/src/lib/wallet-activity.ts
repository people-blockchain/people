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

export type ParsedHistory = {
  items: WalletOperation[];
  hasMore: boolean;
  partial: boolean;
  nextBeforeBlock?: number;
};

function historyTimestamp(value: unknown, now: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : now;
}

/** Accept a legacy array or the `{ items, hasMore, partial, nextBeforeBlock }` page. */
export function parseHistoryResponse(body: unknown, now = Date.now()): ParsedHistory {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const raw = Array.isArray(body) ? body : Array.isArray(record?.items) ? record.items : [];
  const items: WalletOperation[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const tx = row as Record<string, unknown>;
    if (typeof tx.id !== "string" || typeof tx.from !== "string") continue;
    const item: WalletOperation = {
      id: tx.id,
      from: tx.from,
      to: typeof tx.to === "string" ? tx.to : "",
      amount: typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0,
      fee: typeof tx.fee === "number" && Number.isFinite(tx.fee) ? tx.fee : 0,
      timestamp: historyTimestamp(tx.timestamp, now),
      type: typeof tx.type === "string" ? tx.type : "transfer",
    };
    if (typeof tx.nonce === "number") item.nonce = tx.nonce;
    if (typeof tx.assetId === "string") item.assetId = tx.assetId;
    if (typeof tx.blockHeight === "number") item.blockHeight = tx.blockHeight;
    if (tx.payload && typeof tx.payload === "object") item.payload = tx.payload as Record<string, unknown>;
    items.push(item);
  }
  const nextBeforeBlock = typeof record?.nextBeforeBlock === "number" ? record.nextBeforeBlock : undefined;
  return {
    items,
    hasMore: Boolean(record?.hasMore),
    partial: Boolean(record?.partial || record?.truncated),
    ...(nextBeforeBlock !== undefined ? { nextBeforeBlock } : {}),
  };
}
