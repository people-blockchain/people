import { networkFetch } from "@/lib/network-client";

/** Client timeout for one owner NFT page. The server budget is shorter than this. There is no timeout for the whole history. */
export const NFT_CLIENT_TIMEOUT_MS = 12_000;

/** Tries per page, including the first. Later failures wait with exponential backoff. */
export const NFT_PAGE_ATTEMPTS = 4;

export type WalletNftItem = {
  nftId: string;
  name: string;
  imageUri?: string;
  collection?: string;
  onChainTokenId?: string;
};

export type NftPage = {
  items: WalletNftItem[];
  partial: boolean;
  next?: string;
};

export type NftLoadState = {
  phase: "loading" | "ready" | "error";
  items: WalletNftItem[];
  partial: boolean;
  next?: string;
  historyLoading: boolean;
};

export type NftLoadResume = {
  items: WalletNftItem[];
  next?: string;
};

export function initialNftLoadState(): NftLoadState {
  return { phase: "loading", items: [], partial: false, historyLoading: false };
}

/** Keeps items and the cursor so a retry continues the same page instead of starting over. */
export function nftLoadFailed(state: NftLoadState): NftLoadState {
  return {
    phase: "error",
    items: state.items,
    partial: Boolean(state.next),
    historyLoading: false,
    ...(state.next ? { next: state.next } : {}),
  };
}

/** Delay before retry `failedAttempts` (1 after the first miss): 400ms, 800ms, 1600ms, … */
export function nftPageRetryDelayMs(failedAttempts: number): number {
  const step = Math.max(0, Math.floor(failedAttempts) - 1);
  return 400 * 2 ** Math.min(step, 4);
}

export function applyNftPage(state: NftLoadState, page: NftPage): NftLoadState {
  const merged = new Map<string, WalletNftItem>();
  for (const item of state.items) merged.set(item.nftId, item);
  for (const item of page.items) {
    if (!item?.nftId) continue;
    merged.set(item.nftId, item);
  }
  const partial = page.partial === true && typeof page.next === "string" && page.next.length > 0;
  return {
    phase: "ready",
    items: [...merged.values()],
    partial,
    historyLoading: partial,
    ...(partial ? { next: page.next } : {}),
  };
}

function isNftItem(row: unknown): row is WalletNftItem {
  if (!row || typeof row !== "object") return false;
  const candidate = row as WalletNftItem;
  return typeof candidate.nftId === "string" && typeof candidate.name === "string";
}

function pageFromResponse(body: unknown, headers: Headers): NftPage {
  const wrapped = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { items?: unknown; partial?: unknown; next?: unknown })
    : null;
  const rows = wrapped ? wrapped.items : body;
  if (!Array.isArray(rows)) throw new Error("nft_list_invalid");
  const items = rows.filter(isNftItem);
  let partial: boolean;
  let next: string | undefined;
  if (wrapped) {
    partial = wrapped.partial === true;
    next = typeof wrapped.next === "string" && wrapped.next.trim() ? wrapped.next.trim() : undefined;
  } else {
    partial = headers.get("x-nfts-partial") === "1";
    next = headers.get("x-nfts-next")?.trim() || undefined;
  }
  if (partial && !next) throw new Error("nft_partial_without_cursor");
  return { items, partial, ...(partial ? { next } : {}) };
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function loadOwnerNfts(
  owner: string,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    fetchImpl?: (path: string, init: RequestInit) => Promise<Response>;
    onState?: (state: NftLoadState) => void;
    resume?: NftLoadResume;
    maxAttempts?: number;
    retryDelayMs?: (failedAttempts: number) => number;
  },
): Promise<NftLoadState> {
  const timeoutMs = options?.timeoutMs ?? NFT_CLIENT_TIMEOUT_MS;
  const maxAttempts = options?.maxAttempts ?? NFT_PAGE_ATTEMPTS;
  const retryDelayMs = options?.retryDelayMs ?? nftPageRetryDelayMs;
  const fetchImpl = options?.fetchImpl ?? ((path, init) => networkFetch(path, init));
  const resumeNext = options?.resume?.next;
  let state: NftLoadState = resumeNext
    ? {
        phase: "ready",
        items: options?.resume?.items ?? [],
        partial: true,
        historyLoading: true,
        next: resumeNext,
      }
    : initialNftLoadState();
  let cursor = resumeNext;
  const completed = new Set<string>();
  try {
    for (;;) {
      if (options?.signal?.aborted) throw new Error("aborted");
      let page: NftPage | undefined;
      let attempt = 0;
      for (;;) {
        attempt += 1;
        try {
          page = await fetchOwnerNftPage(owner, cursor, timeoutMs, options?.signal, fetchImpl);
          if (cursor && page.next === cursor) throw new Error("nft_cursor_stuck");
          break;
        } catch (error) {
          if (options?.signal?.aborted) throw new Error("aborted");
          if (attempt >= maxAttempts) throw error;
          await waitForRetry(retryDelayMs(attempt), options?.signal);
        }
      }
      if (!page) throw new Error("nft_list_failed");
      if (page.next && completed.has(page.next)) throw new Error("nft_cursor_loop");
      state = applyNftPage(state, page);
      options?.onState?.(state);
      if (!state.historyLoading || !state.next) return state;
      if (cursor) completed.add(cursor);
      cursor = state.next;
    }
  } catch {
    const failed = nftLoadFailed(state);
    options?.onState?.(failed);
    return failed;
  }
}

async function fetchOwnerNftPage(
  owner: string,
  cursor: string | undefined,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fetchImpl: (path: string, init: RequestInit) => Promise<Response>,
): Promise<NftPage> {
  const params = new URLSearchParams({ owner, v: "2" });
  if (cursor) params.set("cursor", cursor);
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // AbortSignal.timeout does not ref its timer, so a quiet test process would
  // exit before the abort. This timer only keeps the attempt alive until the fetch settles.
  const keepAlive = setTimeout(() => {}, timeoutMs + 1_000);
  let res: Response;
  try {
    res = await fetchImpl(`nfts?${params.toString()}`, { signal: requestSignal, cache: "no-store" });
  } finally {
    clearTimeout(keepAlive);
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new Error("nft_list_failed");
  return pageFromResponse(body, res.headers);
}
