import { timeoutSignal } from "./fetch-timeout.ts";

/** A missing index (`404` / `not_found`) is an empty list, not a network outage. */
export function isExplorerNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message === "not_found" || message === "http_404";
}

export type ExplorerRead<T> = { ok: true; value: T } | { ok: false; missing?: boolean };

/**
 * One read with a deadline and a single retry. `not_found` is not retried: the route is answering,
 * there is just nothing to list. Other failures (timeout, 502, `rpc_backoff`) try once more.
 */
export async function loadExplorerRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  opts: { attempts?: number; timeoutMs?: number } = {},
): Promise<ExplorerRead<T>> {
  const attempts = opts.attempts ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { ok: true, value: await load(timeoutSignal(timeoutMs)) };
    } catch (error) {
      if (isExplorerNotFound(error)) return { ok: false, missing: true };
      if (attempt + 1 === attempts) return { ok: false };
    }
  }
  return { ok: false };
}

/** The unavailable notice is only for a view that received no rows and whose read failed. */
export function showNetworkUnavailable(failed: boolean, rowCount: number): boolean {
  return failed && rowCount === 0;
}
