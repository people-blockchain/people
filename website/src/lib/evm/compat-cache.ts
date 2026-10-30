/** Edge cache for pool quotes. The token list must not be stored: a new token would stay hidden. */
const POOL_CACHE = "public, s-maxage=30, stale-while-revalidate=300";
const TX_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * Cache-Control for a compat GET path. The token list (`assets` with no id) is `no-store` so a
 * CDN cannot keep serving a snapshot from before a token was created.
 */
export function evmCompatCacheControl(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  const [root] = parts;
  if (root === "assets" && parts.length === 1) return "no-store";
  if (root === "liquidity-pools") return POOL_CACHE;
  if (root === "address" && parts[2] === "transactions") return TX_CACHE;
  return null;
}
