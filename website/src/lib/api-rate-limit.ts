/** In-process per-key sliding window rate limit (website API routes; not consensus). */

type Bucket = { count: number; windowStart: number };

const stores = new Map<string, Map<string, Bucket>>();

function storeFor(namespace: string): Map<string, Bucket> {
  let map = stores.get(namespace);
  if (!map) {
    map = new Map();
    stores.set(namespace, map);
  }
  return map;
}

export function checkSlidingWindowRateLimit(
  namespace: string,
  key: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const map = storeFor(namespace);
  if (map.size >= 10_000) {
    for (const [oldKey, value] of map) if (now - value.windowStart > windowMs) map.delete(oldKey);
    if (!map.has(key) && map.size >= 10_000) return false;
  }
  const bucket = map.get(key) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  map.set(key, bucket);
  return bucket.count <= maxPerWindow;
}

export function resetRateLimitStoresForTests(): void {
  stores.clear();
}
