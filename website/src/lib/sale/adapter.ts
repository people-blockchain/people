/**
 * Chain adapter for the PPL sale.
 *
 * The curve hub is **not deployed yet**, so every reader here returns the
 * "no data" shape: `null` figures and an empty trade list. The page renders
 * "—" / "not open yet" for those, and never substitutes a made-up number
 * (AGENTS.md §8).
 *
 * Wiring it to the real contract is a single change: set
 * `NEXT_PUBLIC_SALE_HUB_ADDRESS` (and optionally `NEXT_PUBLIC_SALE_STATS_URL`).
 * Figures are read from the hub on Base; the trade feed needs the indexer.
 */

import { CURVE, SALE, explorerTxUrl, saleContractAddress } from "./config";
import { spotPriceUsd } from "./curve";

export type SaleStatus =
  /** No contract address configured — the state the site ships in today. */
  | "not_deployed"
  /** Contract deployed but `openedAt` is still 0. */
  | "not_open"
  | "open"
  | "paused"
  /** finalized, sold out, or past the 730-day window (`closesAt`). */
  | "ended";

export type SaleStats = {
  status: SaleStatus;
  /** Sale contract address, or `null` while it is not deployed. */
  contractAddress: string | null;
  /** Net USD raised on the curve, or `null` when there is no on-chain data. */
  raisedUsd: number | null;
  /** PPL sold on the curve, or `null`. */
  soldPpl: number | null;
  /** Spot price derived from `soldPpl`, or `null`. */
  spotPriceUsd: number | null;
  /** Distinct buyers, or `null`. */
  buyers: number | null;
  /** Sale start, ISO-8601, or `null` before the sale opens. */
  startedAt: string | null;
  /** Whole days left in the sale window (sold-out or duration cap), or `null`. */
  daysLeft: number | null;
};

export type SaleTrade = {
  id: string;
  kind: "buy" | "sell";
  usd: number;
  ppl: number;
  /** ISO-8601. */
  at: string;
  /** Shortened payer address, already safe to render. */
  addressShort: string;
  /** Block-explorer link for the transaction. */
  explorerUrl: string;
};

/** The shape returned while nothing is deployed. No numbers, by design. */
export const EMPTY_SALE_STATS: SaleStats = {
  status: "not_deployed",
  contractAddress: null,
  raisedUsd: null,
  soldPpl: null,
  spotPriceUsd: null,
  buyers: null,
  startedAt: null,
  daysLeft: null,
};

/** Optional indexer endpoint; unset today. */
function statsEndpoint(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SALE_STATS_URL ?? "").trim();
  return raw || null;
}

type RawStats = Partial<{
  status: SaleStatus;
  raisedUsd: number;
  soldPpl: number;
  buyers: number;
  startedAt: string;
  /** ISO-8601 end of the sale window (`closesAt`), when known. */
  closesAt: string;
}>;

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Whole days left; the window ends at `closesAtMs` when the contract gave it, else open + 730 days. */
function daysLeftFrom(startedAt: string | null, closesAtMs?: number | null): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const endsAt = closesAtMs ?? start + SALE.durationDays * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

/** Normalises whatever the indexer returned into `SaleStats`. Exported for tests. */
export function toSaleStats(contractAddress: string, raw: RawStats): SaleStats {
  const soldPpl = numberOrNull(raw.soldPpl);
  const startedAt = typeof raw.startedAt === "string" ? raw.startedAt : null;
  const closesAtMs = typeof raw.closesAt === "string" ? Date.parse(raw.closesAt) : NaN;
  const windowOver = Number.isFinite(closesAtMs) && Date.now() >= closesAtMs;
  const soldOutByCount = soldPpl !== null && soldPpl >= CURVE.supplyPpl;
  return {
    status: raw.status ?? (windowOver || soldOutByCount ? "ended" : "open"),
    contractAddress,
    raisedUsd: numberOrNull(raw.raisedUsd),
    soldPpl,
    spotPriceUsd: soldPpl === null ? null : spotPriceUsd(soldPpl),
    buyers: numberOrNull(raw.buyers),
    startedAt,
    daysLeft: daysLeftFrom(startedAt, Number.isFinite(closesAtMs) ? closesAtMs : null),
  };
}

/**
 * Reads the hub directly (no indexer needed): window, sold-out, finalized and
 * paused flags, PPL sold, USDC reserve and buyer count. Returns `null` when the
 * RPC is unreachable so the caller can fall back to the "open, no figures" shape.
 */
async function fetchOnChainSaleStats(contractAddress: string): Promise<SaleStats | null> {
  try {
    const { readHubSaleState } = await import("./hub-quote");
    const hub = await readHubSaleState();
    const soldPpl = Number(hub.sold) / 1e18;
    const opened = hub.openedAt > BigInt(0);
    const status: SaleStatus = !opened
      ? "not_open"
      : hub.closed
        ? "ended"
        : hub.paused
          ? "paused"
          : "open";
    return {
      status,
      contractAddress,
      raisedUsd: Number(hub.reserve) / 1e6,
      soldPpl,
      spotPriceUsd: spotPriceUsd(soldPpl),
      buyers: Number(hub.buyers),
      startedAt: opened ? new Date(Number(hub.openedAt) * 1000).toISOString() : null,
      daysLeft: opened
        ? hub.closed
          ? 0
          : daysLeftFrom(
              new Date(Number(hub.openedAt) * 1000).toISOString(),
              Number(hub.closesAt) * 1000,
            )
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Live sale figures: from the indexer at `NEXT_PUBLIC_SALE_STATS_URL` when set,
 * otherwise straight from the hub contract over the Base RPC. The sale counts
 * as closed when finalized, sold out, or past `closesAt` (730 days from open).
 */
export async function fetchSaleStats(signal?: AbortSignal): Promise<SaleStats> {
  const contractAddress = saleContractAddress();
  if (!contractAddress) return EMPTY_SALE_STATS;

  const fallback: SaleStats = { ...EMPTY_SALE_STATS, status: "open", contractAddress };
  const endpoint = statsEndpoint();
  if (endpoint) {
    try {
      const res = await fetch(endpoint, { cache: "no-store", signal });
      if (res.ok) return toSaleStats(contractAddress, (await res.json()) as RawStats);
    } catch {
      /* fall through to the chain */
    }
  }
  return (await fetchOnChainSaleStats(contractAddress)) ?? fallback;
}

type RawTrade = Partial<{
  id: string;
  kind: "buy" | "sell";
  usd: number;
  ppl: number;
  at: string;
  address: string;
  txHash: string;
}>;

function shortenAddress(address: string): string {
  const a = address.trim();
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Explorer link for a hub transaction — the People network explorer, in-app. */
export function tradeExplorerUrl(txHash: string): string {
  return explorerTxUrl(txHash);
}

/** Exported for tests: maps an indexer row to the row the feed renders. */
export function toSaleTrade(raw: RawTrade, index: number): SaleTrade | null {
  const usd = numberOrNull(raw.usd);
  const ppl = numberOrNull(raw.ppl);
  if (usd === null || ppl === null || !raw.txHash || !raw.at) return null;
  return {
    id: raw.id ?? `${raw.txHash}-${index}`,
    kind: raw.kind === "sell" ? "sell" : "buy",
    usd,
    ppl,
    at: raw.at,
    addressShort: shortenAddress(raw.address ?? ""),
    explorerUrl: tradeExplorerUrl(raw.txHash),
  };
}

/**
 * Recent buys and sells for the activity feed.
 *
 * TODO(sale-deploy): read `Bought`/`Sold` events from the hub (or the indexer)
 * and map them with `toSaleTrade`. Empty until then — the feed renders its
 * empty state rather than sample rows.
 */
export async function fetchRecentTrades(limit = 8, signal?: AbortSignal): Promise<SaleTrade[]> {
  const contractAddress = saleContractAddress();
  const endpoint = statsEndpoint();
  if (!contractAddress || !endpoint) return [];
  try {
    const res = await fetch(`${endpoint}/trades?limit=${limit}`, { cache: "no-store", signal });
    if (!res.ok) return [];
    const rows = (await res.json()) as RawTrade[];
    return Array.isArray(rows)
      ? rows.map(toSaleTrade).filter((t): t is SaleTrade => t !== null).slice(0, limit)
      : [];
  } catch {
    return [];
  }
}
