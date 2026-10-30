import { visibleAssets } from "@/lib/hidden-assets";

/**
 * Rows for the explorer token list. There is no viewport, page size, or visible-count cutoff:
 * every public token the server returned is shown. Fixture tokens stay hidden.
 */
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
export function mergeTokenCatalogRows<T extends { assetId: string }>(current: readonly T[], incoming: readonly T[]): T[] {
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
    if (replace) order[at] = row;
  };
  for (const row of current) put(row, false);
  for (const row of incoming) put(row, true);
  return order;
}
