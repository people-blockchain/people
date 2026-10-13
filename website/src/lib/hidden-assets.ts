/**
 * Central visibility + display rules for node assets and pools.
 * The node keeps everything; the site simply does not list retired demo tokens,
 * and shows the current demo tokens under their plain names.
 */

/** Retired testnet demo tokens (asset ids, lower-case). */
export const HIDDEN_ASSETS: ReadonlySet<string> = new Set(["trosc", "tpitp", "tmark"]);

/** Pools of the retired tokens. */
export const HIDDEN_POOLS: ReadonlySet<string> = new Set(["pool-ppl-trosc", "pool-ppl-tpitp", "pool-ppl-tmark"]);

/** NFTs that are not part of the public demo set (not listed on the site). */
export const HIDDEN_NFTS: ReadonlySet<string> = new Set(["nft-87703857aea9f15b37182e08"]);

/**
 * Test tokens minted by the E2E and stable-fee audit suites. They are real on-chain tokens, but
 * they are fixtures, not catalogue entries, so the public explorer lists and the swap picker must
 * not offer them. Matching is by address (authoritative) *and* by name pattern, so a re-run that
 * deploys a fresh instance of the same fixture is hidden too without a code change.
 *
 * Direct-address navigation still works: only listings are filtered.
 */
export const HIDDEN_ASSET_ADDRESSES: ReadonlySet<string> = new Set([
  "0x64646b2e2a6f1efbf7519fd137b5334c64c9c199",
  "0xb3713bf87eaa5b648ec771c8a5bf16413a90e570",
  "0xcff6151573a1ed15289fd9b9e960a7e8ae03023e",
  "0x172ebc64aa4a77f3c8ce8f001dd0ceae9bf01aa0",
  "0x16743e90a955c16ae7d491e929d555930d06af87",
  "0x2d75f5a8199ad28ac10a6ea3352f5fd3a954c3f6",
  "0x00e96a531476ef710fdb646a5ac6eb1c3d5143a3",
]);

/** Fixture name prefixes: "E2E Audit Token E2E236070", "Stable Fee SF019644", "Test Audit …". */
export const HIDDEN_ASSET_NAME_PATTERNS: readonly RegExp[] = [
  /^E2E Audit Token\b/i,
  /^Stable\s?Fee\b/i,
  /^Test Audit\b/i,
];

const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

export function isHiddenAssetAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  const lower = String(address).trim().toLowerCase();
  return ADDRESS_RE.test(lower) && HIDDEN_ASSET_ADDRESSES.has(lower);
}

function isHiddenName(name: string | undefined | null): boolean {
  if (!name) return false;
  const trimmed = String(name).trim();
  return HIDDEN_ASSET_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Row-level visibility used by every public list (explorer tokens, swap picker). Rows are hidden
 * when any identifying field matches the fixture denylist — the `assetId` of an uncurated token is
 * its lower-case address, so both fields are checked.
 */
export function isHiddenAssetRow(row: {
  assetId?: string | null;
  tokenAddress?: string | null;
  name?: string | null;
  symbol?: string | null;
} | null | undefined): boolean {
  if (!row) return false;
  return (
    isHiddenAsset(row.assetId) ||
    isHiddenAssetAddress(row.tokenAddress) ||
    isHiddenAssetAddress(row.assetId) ||
    isHiddenName(row.name) ||
    isHiddenName(row.symbol)
  );
}

export function visibleNfts<T extends { nftId: string }>(list: readonly T[]): T[] {
  return list.filter((n) => !HIDDEN_NFTS.has(n.nftId.toLowerCase()));
}

/** Asset ids whose displayed name/symbol drop the "v2" / "2" suffix. Ids stay unchanged. */
export const DISPLAY_NAME_OVERRIDES: Readonly<Record<string, { symbol: string; stripName: boolean }>> = {
  trosc2: { symbol: "TROSC", stripName: true },
  tpitp2: { symbol: "TPITP", stripName: true },
  tmark2: { symbol: "TMARK", stripName: true },
};

export function isHiddenAsset(assetId: string | undefined | null): boolean {
  return Boolean(assetId) && HIDDEN_ASSETS.has(String(assetId).toLowerCase());
}

export function isHiddenPool(
  pool: { poolId?: string; tokenAssetId?: string; tokenAddress?: string } | null | undefined,
): boolean {
  if (!pool) return false;
  return (
    (Boolean(pool.poolId) && HIDDEN_POOLS.has(String(pool.poolId).toLowerCase())) ||
    isHiddenAsset(pool.tokenAssetId) ||
    isHiddenAssetAddress(pool.tokenAddress) ||
    isHiddenAssetAddress(pool.tokenAssetId)
  );
}

export function visibleAssets<
  T extends { assetId: string; tokenAddress?: string; name?: string; symbol?: string },
>(list: readonly T[]): T[] {
  return list.filter((a) => !isHiddenAssetRow(a));
}

export function visiblePools<
  T extends { poolId?: string; tokenAssetId?: string; tokenAddress?: string },
>(list: readonly T[]): T[] {
  return list.filter((p) => !isHiddenPool(p));
}

/** Displayed symbol: "TROSC2" -> "TROSC" (case of the node symbol kept, e.g. tROSC2 -> tROSC). */
export function displayAssetSymbol(assetId: string, symbol: string | undefined): string {
  const id = assetId.toLowerCase();
  const raw = symbol ?? assetId.toUpperCase();
  if (!DISPLAY_NAME_OVERRIDES[id]) return raw;
  return raw.replace(/\s*v?2$/i, "") || DISPLAY_NAME_OVERRIDES[id].symbol;
}

/** Displayed name: "ROSCASH v2 (Testnet demo)" -> "ROSCASH (Testnet demo)". */
export function displayAssetName(assetId: string, name: string | undefined): string {
  const id = assetId.toLowerCase();
  const raw = name ?? assetId;
  const rule = DISPLAY_NAME_OVERRIDES[id];
  if (!rule?.stripName) return raw;
  return raw.replace(/\s+v2(?=\s*\(|\s*$)/i, "").replace(/(\D)2$/, "$1").trim() || raw;
}
