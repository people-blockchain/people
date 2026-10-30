/** Duplicate check for the token launch form: name or symbol match, across every creator. */

export type CatalogToken = {
  address: string;
  name: string;
  symbol: string;
  creator?: string;
};

function norm(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Catalog tokens whose trimmed, case-insensitive name OR symbol equals the draft's (same semantics
 * as the former per-creator check). There is no creator filter: a token created by anyone counts. Duplicate addresses are collapsed.
 */
export function findDuplicateTokens<T extends CatalogToken>(
  catalog: readonly T[],
  query: { name: string; symbol: string },
): T[] {
  const name = norm(query.name);
  const symbol = norm(query.symbol);
  if (!name && !symbol) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of catalog) {
    const address = norm(row.address);
    if (!address || seen.has(address)) continue;
    const nameMatch = Boolean(name) && norm(row.name) === name;
    const symbolMatch = Boolean(symbol) && norm(row.symbol) === symbol;
    if (!nameMatch && !symbolMatch) continue;
    seen.add(address);
    out.push(row);
  }
  return out;
}

export type CatalogAssetRow = {
  assetId?: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  creator?: string;
  imageUri?: string;
};

export type DuplicateCatalogToken = CatalogToken & { creator: string; image?: string };

/** Maps server catalog rows (`GET assets`) to duplicate-check entries, creators included but never filtered. */
export function catalogRowsToTokens(rows: unknown): DuplicateCatalogToken[] {
  if (!Array.isArray(rows)) return [];
  const out: DuplicateCatalogToken[] = [];
  for (const row of rows as CatalogAssetRow[]) {
    const address = (row?.tokenAddress ?? row?.assetId ?? "").toLowerCase();
    if (!address) continue;
    out.push({
      creator: (row.creator ?? "").toLowerCase(),
      address,
      name: row.name ?? "",
      symbol: row.symbol ?? "",
      ...(row.imageUri ? { image: row.imageUri } : {}),
    });
  }
  return out;
}

/**
 * Whole-catalog source for the duplicate warning. It reads only the server-side catalog (factory
 * logs, every creator), never browser storage, so the warning is identical in a clean browser.
 */
export async function loadDuplicateCatalog(
  fetchAssets: () => Promise<unknown>,
): Promise<DuplicateCatalogToken[]> {
  return catalogRowsToTokens(await fetchAssets());
}
