import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One wall-clock budget for a compat API request. Every retry, `eth_getLogs` window,
 * `balanceOf`, metadata fetch and backoff sleep must stop when this elapses so the
 * function returns a partial 200 instead of running until the platform kills it.
 */
export const API_REQUEST_DEADLINE_MS = 12_000;

type DeadlineStore = { at: number; signal: AbortSignal };

const deadlines = new AsyncLocalStorage<DeadlineStore>();

export function currentDeadline(): DeadlineStore | undefined {
  return deadlines.getStore();
}

export function deadlineExpired(deadlineAt?: number): boolean {
  const store = currentDeadline();
  if (store?.signal.aborted) return true;
  const at = deadlineAt ?? store?.at;
  return typeof at === "number" && Date.now() >= at;
}

/**
 * Timeout for one attempt. A deadline that has already passed still allows a short try
 * (a tail read started after history gave up) but never another full RPC wait.
 */
export function boundedTimeoutMs(capMs: number, deadlineAt?: number): number {
  const at = deadlineAt ?? currentDeadline()?.at;
  if (typeof at !== "number") return capMs;
  const remaining = at - Date.now();
  if (remaining <= 0) return Math.min(capMs, 1_000);
  return Math.max(1, Math.min(capMs, remaining));
}

/** Delay before the next retry, or null when the request deadline cannot fit it. */
export function retryDelayMs(delayMs: number, deadlineAt?: number): number | null {
  if (deadlineExpired(deadlineAt)) return null;
  const at = deadlineAt ?? currentDeadline()?.at;
  if (typeof at !== "number") return delayMs;
  const wait = Math.min(delayMs, at - Date.now());
  return wait > 0 ? wait : null;
}

export class RequestDeadlineError extends Error {
  constructor() {
    super("request_deadline");
    this.name = "RequestDeadlineError";
  }
}

export function isRequestDeadlineError(error: unknown): boolean {
  return error instanceof RequestDeadlineError;
}

/** Drop a timer once. A second clearTimeout after mock-timer reset deletes the next test's timer on Node 22. */
function armTimer(ms: number, onFire: () => void): () => void {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    onFire();
  }, ms);
  // A leftover deadline must not keep the test process alive after the request settled.
  timer.unref?.();
  return () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };
}

/** Resolves when `ms` elapses or the request deadline aborts. Never rejects. */
export function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  const parent = signal ?? currentDeadline()?.signal;
  if (ms <= 0 || parent?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const cancel = armTimer(ms, finish);
    const onAbort = () => finish();
    function finish() {
      cancel();
      parent?.removeEventListener("abort", onAbort);
      resolve();
    }
    parent?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Abort signal that fires after `ms` or when `parent` aborts. Uses `setTimeout` so tests
 * can fake the clock. `cancel` must run when the attempt finishes, so the timer does not linger.
 */
export function linkAbort(ms: number, parent?: AbortSignal | null): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  // `null` keeps a metadata read off the request signal. `undefined` still follows the request.
  const upstream = parent === null ? undefined : (parent ?? currentDeadline()?.signal);
  if (upstream?.aborted || ms <= 0) {
    controller.abort();
    return { signal: controller.signal, cancel: () => {} };
  }
  const cancelTimer = armTimer(ms, () => controller.abort());
  const onAbort = () => controller.abort();
  upstream?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cancel: () => {
      cancelTimer();
      upstream?.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Leaves the request deadline store. Compat handlers must not use this to keep scanning,
 * writing snapshots, or fetching metadata after the response has been returned.
 */
export function runOutsideRequestDeadline<T>(fn: () => T): T {
  return deadlines.exit(fn);
}

export function runWithRequestDeadline<T>(fn: () => Promise<T>, ms = API_REQUEST_DEADLINE_MS): Promise<T> {
  const controller = new AbortController();
  const at = Date.now() + ms;
  const cancelTimer = armTimer(Math.max(0, ms), () => controller.abort());
  return deadlines.run({ at, signal: controller.signal }, async () => {
    try {
      return await fn();
    } finally {
      cancelTimer();
      if (!controller.signal.aborted) controller.abort();
    }
  });
}
