/**
 * Timeout helpers for explorer pages: a request must always settle so a loader can never hang.
 * Pure (no React, no network) so they can be unit-tested with fake timers and fake promises.
 */

export const EXPLORER_FETCH_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor(message = "timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Signal that aborts after `ms` or as soon as `parent` aborts, whichever happens first. */
export function timeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError()), ms);
  const finish = () => clearTimeout(timer);
  controller.signal.addEventListener("abort", finish, { once: true });
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
  }
  return controller.signal;
}

/** Rejects with `TimeoutError` when `work` does not settle within `ms`. */
export function withTimeout<T>(work: Promise<T> | (() => Promise<T>), ms: number): Promise<T> {
  const promise = typeof work === "function" ? work() : work;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** GET JSON with a hard deadline that also covers reading the body. Throws on non-2xx or bad JSON. */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal; fetchImpl?: FetchLike } = {},
): Promise<T> {
  const { timeoutMs = EXPLORER_FETCH_TIMEOUT_MS, signal, fetchImpl = fetch as FetchLike } = options;
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onParentAbort();
  else signal?.addEventListener("abort", onParentAbort, { once: true });
  const run = (async () => {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return (await res.json()) as T;
  })();
  try {
    return await withTimeout(run, timeoutMs);
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
    controller.abort();
  }
}
