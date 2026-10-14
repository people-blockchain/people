import { isAddress, parseUnits, formatUnits, type Address, type Hex } from "viem";
export const CHAIN_ID = 97401;
export const UNIT = BigInt(10) ** BigInt(18);
export const LOT = BigInt(10) ** BigInt(14);
export const DISPUTE_SECONDS = 48 * 60 * 60;
export type Deployment = { chainId: number; address: string | null; runtimeCodeHash: string | null; genesisHash: string | null; startBlock: number | null; release: string | null };
export function configuredDeployment(d: Deployment): d is Deployment & { address: Address; runtimeCodeHash: Hex; genesisHash: Hex; startBlock: number; release: string } {
  if (d.chainId !== CHAIN_ID) throw new Error("invalid_deployment");
  if (d.address === null && d.runtimeCodeHash === null && d.genesisHash === null && d.startBlock === null && d.release === null) return false;
  if (d.chainId !== CHAIN_ID || !d.address || !isAddress(d.address) || /^0x0{40}$/i.test(d.address) ||
    !/^0x[0-9a-f]{64}$/i.test(d.runtimeCodeHash ?? "") || !/^0x[0-9a-f]{64}$/i.test(d.genesisHash ?? "") ||
    !Number.isSafeInteger(d.startBlock) || d.startBlock! < 0 || !d.release) throw new Error("invalid_deployment");
  return true;
}
export function parseLots(input: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(input)) throw new Error("precision");
  const result = parseUnits(input, 18);
  if (result <= BigInt(0) || result > (BigInt(1) << BigInt(128)) - BigInt(1)) throw new Error("amount");
  return result;
}
export function parsePrice(input: string): bigint {
  const result = parseLots(input);
  if (result >= UNIT) throw new Error("price");
  return result;
}
export function costOf(amount: bigint, price: bigint): bigint {
  if (amount <= BigInt(0) || amount % LOT || price <= BigInt(0) || price >= UNIT || price % LOT) throw new Error("precision");
  return amount * price / UNIT;
}
export function displayAtoms(value: string): string { return formatUnits(BigInt(value), 18); }
export function safeSource(value: string): string | null {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export type Market = { id: string; title: string; terms: string; source: string; category: string; closeAt: number; resolver: Address; arbiter: Address; proposedAt: number; proposedOutcome: number; disputed: boolean; outcome: number; collateral: string; yes?: string; no?: string };
export type Order = { id: string; maker: Address; marketId: string; yes: boolean; buy: boolean; price: string; remaining: string; expiresAt: number };
export type Trade = { blockNumber: string; blockHash: string; txHash: string; logIndex: number; marketId: string; orderId: string; taker: Address; maker: Address; yes: boolean; buy: boolean; amount: string; price: string; cost: string };
export function canonicalTrades(rows: Trade[]): Trade[] {
  const seen = new Set<string>();
  return [...rows].sort((a,b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.logIndex - b.logIndex)
    .filter(row => { const key = `${row.blockHash}:${row.logIndex}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
export type Snapshot = { status: "ready" | "undeployed"; chainId: number; height: string; blockHash: string; timestamp: number; contract: Address | null; markets: Market[]; marketCount: string; orders: Order[]; orderCount: string; trades: Trade[]; historyFrom: string | null; credits: string | null; accountBalance: string | null; admin: Address | null; page: number; orderPage: number };
