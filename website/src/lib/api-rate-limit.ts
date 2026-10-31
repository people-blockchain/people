/** Per-key rate limits for website API routes (not consensus). */

import { isIP } from "node:net";

type Bucket = { count: number; windowStart: number };

export type RateLimitVerdict = {
  allowed: boolean;
  /** Seconds a rejected caller should wait. Zero when the call was allowed. */
  retryAfterSeconds: number;
};

function retryAfterFromWindow(windowStart: number, windowMs: number, now: number): number {
  return Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
}

export function normalizeRateLimitVerdict(value: boolean | RateLimitVerdict, windowMs: number): RateLimitVerdict {
  if (typeof value === "boolean") {
    return { allowed: value, retryAfterSeconds: value ? 0 : Math.max(1, Math.ceil(windowMs / 1000)) };
  }
  return {
    allowed: value.allowed,
    retryAfterSeconds: value.allowed ? 0 : Math.max(1, Math.ceil(value.retryAfterSeconds)),
  };
}

/** Per-namespace key cap; past it the least recently used key is evicted (never a new key refused). */
export const MAX_KEYS_PER_NAMESPACE = 10_000;

const stores = new Map<string, Map<string, Bucket>>();

function storeFor(namespace: string): Map<string, Bucket> {
  let map = stores.get(namespace);
  if (!map) {
    map = new Map();
    stores.set(namespace, map);
  }
  return map;
}

function expandIpv6(ip: string): number[] | null {
  let addr = ip.split("%")[0].toLowerCase();
  // Trailing dotted IPv4 (e.g. ::ffff:a.b.c.d) becomes two hextets.
  const dotted = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null;
    const [a, b, c, d] = dotted[2].split(".").map(Number);
    addr = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array<string>(fill).fill("0"), ...tail].map((h) => Number.parseInt(h, 16));
  return parts.length === 8 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? parts : null;
}

/**
 * Rate-limit identity for a subject. A single IPv6 client typically controls a whole /64, so
 * IPv6 addresses are keyed by that prefix (IPv4-mapped addresses by their IPv4). Anything that is
 * not an IP (user ids, "unknown") is returned unchanged.
 */
export function rateLimitKey(subject: string): string {
  if (isIP(subject) !== 6) return subject;
  const parts = expandIpv6(subject);
  if (!parts) return subject;
  if (parts.slice(0, 5).every((n) => n === 0) && parts[5] === 0xffff) {
    return [parts[6] >> 8, parts[6] & 0xff, parts[7] >> 8, parts[7] & 0xff].join(".");
  }
  return `${parts.slice(0, 4).map((n) => n.toString(16)).join(":")}::/64`;
}

function takeSlidingWindow(
  namespace: string,
  key: string,
  maxPerWindow: number,
  windowMs: number,
): RateLimitVerdict {
  const now = Date.now();
  const map = storeFor(namespace);
  const id = rateLimitKey(key);
  const bucket = map.get(id) ?? { count: 0, windowStart: now };
  // Re-insert so Map order tracks recency; the first key is then the least recently used.
  map.delete(id);
  while (map.size >= MAX_KEYS_PER_NAMESPACE) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  if (now - bucket.windowStart > windowMs) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  map.set(id, bucket);
  const allowed = bucket.count <= maxPerWindow;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : retryAfterFromWindow(bucket.windowStart, windowMs, now),
  };
}

/** In-process per-key sliding window rate limit. Prefer `checkSharedRateLimit` in routes. */
export function checkSlidingWindowRateLimit(
  namespace: string,
  key: string,
  maxPerWindow: number,
  windowMs: number
): boolean {
  return takeSlidingWindow(namespace, key, maxPerWindow, windowMs).allowed;
}

type SharedBackend = (
  namespace: string,
  subject: string,
  maxPerWindow: number,
  windowMs: number,
) => Promise<boolean | RateLimitVerdict>;

/** A slow shared store must not stall the route; past this the in-memory verdict is used. */
const SHARED_TIMEOUT_MS = 1_500;
/** After a shared-store failure, skip it for this long instead of paying the timeout per request. */
const SHARED_COOLDOWN_MS = 30_000;

let sharedBackendOverride: SharedBackend | null | undefined;
let sharedDisabledUntil = 0;

async function defaultSharedBackend(): Promise<SharedBackend | null> {
  if (!process.env.DATABASE_URL?.trim()) return null;
  const { checkDurableRateLimitDetail } = await import("@/lib/durable-rate-limit");
  return checkDurableRateLimitDetail;
}

/**
 * Rate limit shared across instances and cold starts. The in-process window is checked first (a
 * local rejection never touches the store, and the global count is never below the local one);
 * then the Postgres fixed-window counter decides. Without DATABASE_URL, or when the store errors
 * or is slow, it fails open to the in-process verdict rather than crashing the route.
 *
 * `retryAfterSeconds` is how long a rejected caller should wait. Boolean callers keep using
 * `checkSharedRateLimit`. A backend that still returns a boolean is treated as "wait out the
 * whole window".
 */
export async function checkSharedRateLimitDetail(
  namespace: string,
  key: string,
  maxPerWindow: number,
  windowMs: number,
): Promise<RateLimitVerdict> {
  const local = takeSlidingWindow(namespace, key, maxPerWindow, windowMs);
  if (!local.allowed || Date.now() < sharedDisabledUntil) return local;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const backend = sharedBackendOverride !== undefined ? sharedBackendOverride : await defaultSharedBackend();
    if (!backend) return local;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("shared rate limit timed out")), SHARED_TIMEOUT_MS);
    });
    const raw = await Promise.race([backend(namespace, rateLimitKey(key), maxPerWindow, windowMs), timeout]);
    return normalizeRateLimitVerdict(raw, windowMs);
  } catch (error) {
    sharedDisabledUntil = Date.now() + SHARED_COOLDOWN_MS;
    console.warn(
      "[api-rate-limit] shared store unavailable, using in-memory limiter",
      error instanceof Error ? error.message : error
    );
    return local;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkSharedRateLimit(
  namespace: string,
  key: string,
  maxPerWindow: number,
  windowMs: number
): Promise<boolean> {
  return (await checkSharedRateLimitDetail(namespace, key, maxPerWindow, windowMs)).allowed;
}

/** @internal test hook — `null` forces in-memory only, `undefined` restores the default. */
export function setSharedRateLimitBackendForTests(backend: SharedBackend | null | undefined): void {
  sharedBackendOverride = backend;
  sharedDisabledUntil = 0;
}

export function resetRateLimitStoresForTests(): void {
  stores.clear();
  sharedDisabledUntil = 0;
}
