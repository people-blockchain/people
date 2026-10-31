import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

/** localStorage key for sell payouts that burned PPL and still need USDC. */
export const PENDING_PAYOUT_STORAGE_SLOT = "ppl.v2.pendingPayouts";

export type PendingPayout = {
  returnId: Hex;
  /** Burned PPL, decimal wei. This is the signed ceiling, not the unpaid slice. */
  amount: string;
  burnTx: Hex;
  status: "pending";
  account: Address;
  seller: Address;
  hub: Address;
  personId: Hex;
  destChainId: number;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SeenReturn = {
  returnId: Hex;
  claimedPpl: bigint;
  used: boolean;
  amount?: bigint;
  burnTx?: Hex;
  account?: Address;
  seller?: Address;
  hub?: Address;
  personId?: Hex;
  destChainId?: number;
};

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isPendingPayout(value: unknown): value is PendingPayout {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PendingPayout>;
  return (
    row.status === "pending" &&
    typeof row.returnId === "string" &&
    isHex(row.returnId) &&
    row.returnId.length === 66 &&
    typeof row.amount === "string" &&
    /^[1-9]\d*$/.test(row.amount) &&
    typeof row.burnTx === "string" &&
    isHex(row.burnTx) &&
    row.burnTx.length === 66 &&
    typeof row.account === "string" &&
    isAddress(row.account) &&
    typeof row.seller === "string" &&
    isAddress(row.seller) &&
    typeof row.hub === "string" &&
    isAddress(row.hub) &&
    typeof row.personId === "string" &&
    isHex(row.personId) &&
    row.personId.length === 66 &&
    typeof row.destChainId === "number" &&
    Number.isInteger(row.destChainId) &&
    row.destChainId > 0
  );
}

export function readPendingPayouts(storage: StorageLike): PendingPayout[] {
  const raw = storage.getItem(PENDING_PAYOUT_STORAGE_SLOT);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingPayout).map(normalizePending);
  } catch {
    return [];
  }
}

export function writePendingPayouts(storage: StorageLike, items: readonly PendingPayout[]): void {
  storage.setItem(PENDING_PAYOUT_STORAGE_SLOT, JSON.stringify(items.map(normalizePending)));
}

function normalizePending(item: PendingPayout): PendingPayout {
  return {
    returnId: item.returnId,
    amount: item.amount,
    burnTx: item.burnTx,
    status: "pending",
    account: getAddress(item.account),
    seller: getAddress(item.seller),
    hub: getAddress(item.hub),
    personId: item.personId,
    destChainId: item.destChainId,
  };
}

export function pendingForAccount(items: readonly PendingPayout[], account: Address): PendingPayout[] {
  return items.filter((item) => same(item.account, account));
}

export function upsertPending(items: readonly PendingPayout[], item: PendingPayout): PendingPayout[] {
  const next = normalizePending(item);
  return [...items.filter((row) => !same(row.returnId, next.returnId)), next];
}

export function dropPending(items: readonly PendingPayout[], returnId: string): PendingPayout[] {
  return items.filter((row) => !same(row.returnId, returnId));
}

export function rememberPending(storage: StorageLike, item: PendingPayout): PendingPayout[] {
  const next = upsertPending(readPendingPayouts(storage), item);
  writePendingPayouts(storage, next);
  return next;
}

export function forgetPending(storage: StorageLike, returnId: string): PendingPayout[] {
  const next = dropPending(readPendingPayouts(storage), returnId);
  writePendingPayouts(storage, next);
  return next;
}

/**
 * Chain state wins when a burn was observed. A stored payout the scan did not
 * mention stays, so a closed tab can still resume if the log query is short.
 * A fully paid id is removed.
 */
export function reconcilePending(stored: readonly PendingPayout[], seen: readonly SeenReturn[]): PendingPayout[] {
  const next = new Map<string, PendingPayout>();
  for (const item of stored) next.set(item.returnId.toLowerCase(), normalizePending(item));
  for (const row of seen) {
    const id = row.returnId.toLowerCase();
    const prev = next.get(id);
    const amount = row.amount ?? (prev ? BigInt(prev.amount) : BigInt(0));
    const paid = row.used || (amount > BigInt(0) && row.claimedPpl >= amount);
    if (paid) {
      next.delete(id);
      continue;
    }
    if (amount <= BigInt(0)) continue;
    const burnTx = row.burnTx && isHex(row.burnTx) && row.burnTx.length === 66 ? row.burnTx : prev?.burnTx;
    const account = row.account ?? prev?.account;
    const seller = row.seller ?? prev?.seller;
    const hub = row.hub ?? prev?.hub;
    const personId = row.personId ?? prev?.personId;
    const destChainId = row.destChainId ?? prev?.destChainId;
    if (!burnTx || !account || !seller || !hub || !personId || !destChainId) continue;
    next.set(id, normalizePending({
      returnId: row.returnId,
      amount: amount.toString(),
      burnTx,
      status: "pending",
      account,
      seller,
      hub,
      personId,
      destChainId,
    }));
  }
  return [...next.values()];
}

/** A new burn is offered only when nothing is waiting, or the seller confirmed. */
export function newBurnAllowed(pendingCount: number, confirmed: boolean): boolean {
  return pendingCount <= 0 || confirmed;
}

export function browserPendingStorage(): StorageLike | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
