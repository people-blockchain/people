import type { LiveTransaction } from "./LiveContext.js";

export interface BalancePoint {
  at: number;
  balance: number;
  label: string;
}

/** Reconstruct approximate balance path from known transfers (newest history first). */
export function buildBalanceHistory(
  currentBalance: number,
  address: string,
  history: LiveTransaction[],
  limit = 12
): BalancePoint[] {
  const normalized = address.toLowerCase();
  const transfers = history
    .filter((tx) => tx.type === "transfer")
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp || b.blockHeight - a.blockHeight);

  const points: BalancePoint[] = [
    { at: Date.now(), balance: currentBalance, label: "now" }
  ];
  let balance = currentBalance;
  for (const tx of transfers) {
    const from = tx.from.toLowerCase() === normalized;
    const to = tx.to.toLowerCase() === normalized;
    if (from) {
      balance += tx.amount + tx.fee;
    } else if (to) {
      balance -= tx.amount;
    } else {
      continue;
    }
    points.push({
      at: tx.timestamp,
      balance: Math.max(0, balance),
      label: `#${tx.blockHeight}`
    });
    if (points.length >= limit) {
      break;
    }
  }
  return points.reverse();
}

export function incomeFromTransfers24h(address: string, history: LiveTransaction[]): number {
  const normalized = address.toLowerCase();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let delta = 0;
  for (const tx of history) {
    if (tx.type !== "transfer" || tx.timestamp < cutoff) {
      continue;
    }
    if (tx.to.toLowerCase() === normalized) {
      delta += tx.amount;
    }
    if (tx.from.toLowerCase() === normalized) {
      delta -= tx.amount + tx.fee;
    }
  }
  return delta;
}
