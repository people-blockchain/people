/**
 * Pure load orchestration for the token page. The asset row decides when the page is shown; the
 * holder distribution and the creation timestamp load independently and can only ever degrade
 * their own block (loading -> ready | failed), never keep the whole page on a spinner.
 */

export const TOKEN_ASSET_TIMEOUT_MS = 20_000;
export const TOKEN_ACCOUNTS_TIMEOUT_MS = 30_000;
export const TOKEN_TIMESTAMP_TIMEOUT_MS = 8_000;

export class LoadTimeoutError extends Error {
  constructor() {
    super("load_timeout");
    this.name = "LoadTimeoutError";
  }
}

/**
 * Runs `run` with an abort signal that fires after `timeoutMs` or when `parent` aborts. The result
 * rejects with `LoadTimeoutError` on timeout even if `run` ignores the signal and never settles.
 */
export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    };
    const timer = setTimeout(() => {
      cleanup();
      controller.abort();
      reject(new LoadTimeoutError());
    }, timeoutMs);
    function onParentAbort() {
      cleanup();
      controller.abort();
      reject(new Error("aborted"));
    }
    if (parent?.aborted) return onParentAbort();
    parent?.addEventListener("abort", onParentAbort);
    run(controller.signal).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export type AccountsResult<A> = { ok: true; value: A } | { ok: false };

/** Loads the distribution; any failure (HTTP error, timeout, malformed body) is `{ ok: false }`. */
export async function loadAccounts<A>(
  fetchAccounts: (signal: AbortSignal) => Promise<A | null>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AccountsResult<A>> {
  try {
    const value = await withTimeout(fetchAccounts, timeoutMs, signal);
    return value === null || value === undefined ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export type TokenLoadOptions<Asset, Accounts> = {
  fetchAsset: (signal: AbortSignal) => Promise<Asset>;
  fetchAccounts: (signal: AbortSignal) => Promise<Accounts | null>;
  /** Called only when `needsTimestamp(asset)` is true; null/undefined/throw = unavailable. */
  fetchTimestamp?: (asset: Asset, signal: AbortSignal) => Promise<number | null | undefined>;
  needsTimestamp?: (asset: Asset) => boolean;
  /** Per-request budgets in ms; omitted ones use the defaults above. */
  timeoutMs?: { asset?: number; accounts?: number; timestamp?: number };
  signal?: AbortSignal;
  onAsset: (asset: Asset) => void;
  onAssetFailed: (error: unknown) => void;
  onAccounts: (result: AccountsResult<Accounts>) => void;
  onTimestamp: (timestamp: number | null) => void;
};

/**
 * Starts the asset and distribution requests in parallel. `onAsset`/`onAssetFailed` fire as soon as
 * the asset request settles, whatever the distribution is doing. Resolves when everything has
 * settled; callbacks are never invoked after `signal` aborts.
 */
export async function loadTokenPage<Asset, Accounts>(options: TokenLoadOptions<Asset, Accounts>): Promise<void> {
  const { signal } = options;
  const live = () => !signal?.aborted;
  const budget = {
    asset: options.timeoutMs?.asset ?? TOKEN_ASSET_TIMEOUT_MS,
    accounts: options.timeoutMs?.accounts ?? TOKEN_ACCOUNTS_TIMEOUT_MS,
    timestamp: options.timeoutMs?.timestamp ?? TOKEN_TIMESTAMP_TIMEOUT_MS,
  };
  const accounts = loadAccounts(options.fetchAccounts, budget.accounts, signal).then((result) => {
    if (live()) options.onAccounts(result);
  });
  const assetFlow = (async () => {
    let asset: Asset;
    try {
      asset = await withTimeout(options.fetchAsset, budget.asset, signal);
    } catch (error) {
      if (live()) options.onAssetFailed(error);
      return;
    }
    if (!live()) return;
    options.onAsset(asset);
    if (!options.fetchTimestamp || (options.needsTimestamp && !options.needsTimestamp(asset))) return;
    let timestamp: number | null = null;
    try {
      // The fetcher makes up to two sequential requests (block header, then the archive).
      const value = await withTimeout((s) => options.fetchTimestamp!(asset, s), budget.timestamp * 2, signal);
      timestamp = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
    } catch {
      timestamp = null;
    }
    if (live()) options.onTimestamp(timestamp);
  })();
  await Promise.all([accounts, assetFlow]);
}
