import { visibleAssets } from "@/lib/hidden-assets";
import { withStableImage } from "@/lib/token-image-merge";

/**
 * Rows for the explorer token list. There is no viewport, page size, or visible-count cutoff:
 * every public token the server returned is shown. Fixture tokens stay hidden.
 */
/** Rows from `GET /assets`, whether the body is the full array or `{ assets, partial: true }`. */
export function compatAssetRows<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object" && Array.isArray((body as { assets?: unknown }).assets)) {
    return (body as { assets: T[] }).assets;
  }
  return [];
}

export function tokenCatalogRows<
  T extends { assetId: string; tokenAddress?: string; name?: string; symbol?: string },
>(rows: readonly T[]): T[] {
  return visibleAssets(rows);
}

/**
 * Merge a background refresh into the rows already on screen. A token present in either list is
 * kept, so a stale refresh cannot hide a token the first response already had, and a token that
 * appears only in the refresh is added. Fields from the refresh win when both have the row.
 */
export function mergeTokenCatalogRows<
  T extends { assetId: string; imageUri?: string; creationMetadata?: { image?: unknown; [key: string]: unknown } },
>(current: readonly T[], incoming: readonly T[]): T[] {
  const order: T[] = [];
  const index = new Map<string, number>();
  const put = (row: T, replace: boolean) => {
    const id = row.assetId.toLowerCase();
    const at = index.get(id);
    if (at === undefined) {
      index.set(id, order.length);
      order.push(row);
      return;
    }
    if (replace) order[at] = withStableImage(order[at], row);
  };
  for (const row of current) put(row, false);
  for (const row of incoming) put(row, true);
  return order;
}

/** How long a token this browser has seen stays in the list after the server omits it. */
export const SEEN_TOKENS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SEEN_TOKENS_STORAGE_KEY = "people.seenTokens.v1";
const SEEN_TOKENS_MAX = 200;

export type RememberedToken = {
  assetId: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: number;
  creator?: string;
  status?: string;
  type?: string;
  verified?: boolean;
  imageUri?: string;
  creationMetadata?: { image?: string; description?: string };
  seenAt: number;
};

type TokenStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

function rememberedToken(value: unknown): RememberedToken | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const assetId = typeof raw.assetId === "string" ? raw.assetId.trim() : "";
  if (!assetId) return null;
  const seenAt = typeof raw.seenAt === "number" && Number.isFinite(raw.seenAt) ? raw.seenAt : 0;
  const image = typeof raw.imageUri === "string" ? raw.imageUri : undefined;
  const meta = raw.creationMetadata;
  const creationImage =
    meta && typeof meta === "object" && typeof (meta as { image?: unknown }).image === "string"
      ? (meta as { image: string }).image
      : undefined;
  return {
    assetId,
    ...(typeof raw.tokenAddress === "string" ? { tokenAddress: raw.tokenAddress } : {}),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.symbol === "string" ? { symbol: raw.symbol } : {}),
    ...(typeof raw.decimals === "number" ? { decimals: raw.decimals } : {}),
    ...(typeof raw.totalSupply === "number" ? { totalSupply: raw.totalSupply } : {}),
    ...(typeof raw.creator === "string" ? { creator: raw.creator } : {}),
    ...(typeof raw.status === "string" ? { status: raw.status } : {}),
    ...(typeof raw.type === "string" ? { type: raw.type } : {}),
    ...(raw.verified === true ? { verified: true } : {}),
    ...(image ? { imageUri: image } : {}),
    ...(creationImage || (meta && typeof meta === "object" && "description" in meta)
      ? {
          creationMetadata: {
            ...(creationImage ? { image: creationImage } : {}),
            ...(meta && typeof meta === "object" && typeof (meta as { description?: unknown }).description === "string"
              ? { description: (meta as { description: string }).description }
              : {}),
          },
        }
      : {}),
    seenAt,
  };
}

export function readSeenTokens(storage: TokenStorage | null | undefined, now = Date.now()): RememberedToken[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SEEN_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(rememberedToken)
      .filter((row): row is RememberedToken => row !== null && (row.seenAt <= 0 || now - row.seenAt <= SEEN_TOKENS_TTL_MS));
  } catch {
    return [];
  }
}

export function rememberSeenTokens(
  storage: TokenStorage | null | undefined,
  rows: readonly { assetId: string; tokenAddress?: string; name?: string; symbol?: string; decimals?: number; totalSupply?: number; creator?: string; status?: string; type?: string; verified?: boolean; imageUri?: string; creationMetadata?: { image?: unknown; description?: unknown } }[],
  now = Date.now(),
): void {
  if (!storage) return;
  const next: RememberedToken[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.assetId.trim();
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());
    const image = typeof row.creationMetadata?.image === "string" ? row.creationMetadata.image : row.imageUri;
    next.push({
      assetId: id,
      ...(row.tokenAddress ? { tokenAddress: row.tokenAddress } : {}),
      ...(row.name ? { name: row.name } : {}),
      ...(row.symbol ? { symbol: row.symbol } : {}),
      ...(typeof row.decimals === "number" ? { decimals: row.decimals } : {}),
      ...(typeof row.totalSupply === "number" ? { totalSupply: row.totalSupply } : {}),
      ...(row.creator ? { creator: row.creator } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.type ? { type: row.type } : {}),
      ...(row.verified ? { verified: true } : {}),
      ...(typeof image === "string" && image ? { imageUri: image, creationMetadata: { image } } : {}),
      seenAt: now,
    });
    if (next.length >= SEEN_TOKENS_MAX) break;
  }
  try {
    storage.setItem(SEEN_TOKENS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or disabled: the server list is still shown.
  }
}

function rowKeys<T extends { assetId: string; tokenAddress?: string }>(row: T): string[] {
  const keys = [row.assetId.toLowerCase()];
  if (row.tokenAddress) keys.push(row.tokenAddress.toLowerCase());
  return keys;
}

/**
 * Keeps tokens this browser already showed, or just created, until the server list contains them
 * or the TTL passes. Server fields win when both sides have the row.
 */
export function mergeSeenIntoCatalog<T extends { assetId: string; tokenAddress?: string }>(
  serverRows: readonly T[],
  seen: readonly (T & { seenAt?: number; createdAt?: number })[],
  now = Date.now(),
  ttl = SEEN_TOKENS_TTL_MS,
): T[] {
  const merged: T[] = [...serverRows];
  const ids = new Set(serverRows.flatMap((row) => rowKeys(row)));
  for (const row of seen) {
    const at = row.seenAt ?? row.createdAt;
    if (typeof at === "number" && at > 0 && now - at > ttl) continue;
    const keys = rowKeys(row);
    if (keys.some((key) => ids.has(key))) continue;
    for (const key of keys) ids.add(key);
    merged.push(row);
  }
  return merged;
}

export function findRememberedToken(rows: readonly RememberedToken[], assetId: string): RememberedToken | null {
  const key = assetId.trim().toLowerCase();
  if (!key) return null;
  return rows.find((row) => row.assetId.toLowerCase() === key || row.tokenAddress?.toLowerCase() === key) ?? null;
}
