/**
 * Shared plumbing for the server components (explorer lists, home feed, swap) that pre-read the
 * same compat endpoints the browser hits, so the first paint carries real rows instead of a
 * skeleton that lasts until hydration finishes.
 */

/**
 * Budget for a single SSR prefetch. Past this we render with empty data and let the client pick
 * the fetch up (and its own cache/retry logic) the same way it always has, so a slow or
 * unreachable RPC node can never stall the initial page response.
 */
export const SSR_PREFETCH_BUDGET_MS = 1500;

/** Resolves with `fallback` if `promise` has not settled within `ms`; never rejects on its own. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
