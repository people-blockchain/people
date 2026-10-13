export type OutboundTxStatus = "pending" | "included" | "finalized" | "failed";

export interface OutboundTx {
  localId: string;
  txId?: string;
  status: OutboundTxStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
  from: string;
  to: string;
  amount: number;
  fee: number;
  nonce: number;
  memo?: string;
  recipients?: Array<{ to: string; amount: number; memo?: string }>;
  blockHeight?: number;
  confirmations?: number;
}

const TX_QUEUE_KEY = "ovn-tx-queue";
const MAX_QUEUE = 80;

export function loadTxQueue(address?: string): OutboundTx[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TX_QUEUE_KEY) ?? "[]") as OutboundTx[];
    const list = Array.isArray(parsed) ? parsed : [];
    if (!address) {
      return list;
    }
    return list.filter((item) => item.from.toLowerCase() === address.toLowerCase());
  } catch {
    return [];
  }
}

function saveAll(queue: OutboundTx[]): void {
  localStorage.setItem(TX_QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)));
}

export function upsertTxQueueItem(item: OutboundTx): OutboundTx[] {
  const all = loadTxQueue();
  const without = all.filter((entry) => entry.localId !== item.localId && entry.txId !== item.txId);
  without.unshift({ ...item, updatedAt: Date.now() });
  saveAll(without);
  return without.filter((entry) => entry.from.toLowerCase() === item.from.toLowerCase());
}

export function updateTxQueueStatus(
  localId: string,
  patch: Partial<OutboundTx>
): OutboundTx[] {
  const all = loadTxQueue().map((item) =>
    item.localId === localId ? { ...item, ...patch, updatedAt: Date.now() } : item
  );
  saveAll(all);
  const match = all.find((item) => item.localId === localId);
  return match ? all.filter((item) => item.from.toLowerCase() === match.from.toLowerCase()) : all;
}

export function syncTxQueueWithChain(options: {
  address: string;
  headHeight: number;
  finalizedHeight: number;
  knownTxIds: Set<string>;
  knownHeights: Map<string, number>;
}): OutboundTx[] {
  const { address, headHeight, finalizedHeight, knownTxIds, knownHeights } = options;
  const all = loadTxQueue().map((item) => {
    if (item.from.toLowerCase() !== address.toLowerCase()) {
      return item;
    }
    if (!item.txId || item.status === "failed") {
      return item;
    }
    if (!knownTxIds.has(item.txId) && item.status === "pending") {
      return item;
    }
    if (!knownTxIds.has(item.txId)) {
      return item;
    }
    const height = knownHeights.get(item.txId) ?? item.blockHeight;
    if (height === undefined) {
      return { ...item, status: "included" as const, updatedAt: Date.now() };
    }
    const confirmations = Math.max(0, headHeight - height);
    if (height <= finalizedHeight) {
      return {
        ...item,
        status: "finalized" as const,
        blockHeight: height,
        confirmations,
        updatedAt: Date.now()
      };
    }
    return {
      ...item,
      status: "included" as const,
      blockHeight: height,
      confirmations,
      updatedAt: Date.now()
    };
  });
  saveAll(all);
  return all.filter((item) => item.from.toLowerCase() === address.toLowerCase());
}
