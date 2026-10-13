export interface RateBucket {
  count: number;
  windowStart: number;
}

const MAX_RATE_KEYS = 10_000;
/** Fraction of the table dropped when it is full, so eviction is amortized. */
const EVICT_FRACTION = 0.1;

/**
 * Make room in a full table by dropping expired buckets and then the oldest ones. A full
 * table must never become an outage: refusing unknown keys would let any attacker lock out
 * every new client by churning keys first.
 */
function evictForRoom(
  map: Map<string, RateBucket>,
  now: number,
  windowMs: number
): void {
  if (map.size < MAX_RATE_KEYS) return;
  for (const [oldKey, value] of map) {
    if (now - value.windowStart > windowMs) map.delete(oldKey);
  }
  if (map.size < MAX_RATE_KEYS) return;
  const target = Math.max(1, Math.ceil(map.size * EVICT_FRACTION));
  const oldest = [...map.entries()]
    .sort((a, b) => a[1].windowStart - b[1].windowStart)
    .slice(0, target);
  for (const [oldKey] of oldest) map.delete(oldKey);
}

/**
 * `cost` charges more than one unit per call (M16-1: a JSON-RPC batch costs as
 * many units as it carries calls, so the limit counts work, not HTTP requests).
 */
export function allowKeyedRate(
  map: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  cost = 1
): boolean {
  evictForRoom(map, now, windowMs);
  const bucket = map.get(key) ?? { count: 0, windowStart: now };
  if (now - bucket.windowStart > windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += Math.max(1, Math.floor(cost));
  map.set(key, bucket);
  return bucket.count <= limit;
}
