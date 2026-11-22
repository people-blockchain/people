/** Shared CDN cache headers for anonymous GET routes with identical payloads per URL. */
export const PUBLIC_CACHE_45S = {
  "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120",
} as const;

export const PUBLIC_CACHE_60S = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
} as const;

export const PUBLIC_CACHE_30S = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=90",
} as const;