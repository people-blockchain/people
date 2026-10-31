import { networkFetch } from "@/lib/network-client";

/** Client timeout for one owner NFT page. The server budget is shorter than this. */
export const NFT_CLIENT_TIMEOUT_MS = 12_000;

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

export function initialNftLoadState(): NftLoadState {
  return { phase: "loading", items: [], partial: false, historyLoading: false };
}

export function nftLoadFailed(state: NftLoadState): NftLoadState {
  return { ...state, phase: "error", partial: false, historyLoading: false, next: undefined };
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

function pageFromResponse(body: unknown, headers: Headers): NftPage {
  if (!Array.isArray(body)) throw new Error("nft_list_invalid");
  const items = body.filter((row): row is WalletNftItem => {
    if (!row || typeof row !== "object") return false;
    const candidate = row as WalletNftItem;
    return typeof candidate.nftId === "string" && typeof candidate.name === "string";
  });
  const partial = headers.get("x-nfts-partial") === "1";
  const next = headers.get("x-nfts-next")?.trim() || undefined;
  if (partial && !next) throw new Error("nft_partial_without_cursor");
  return { items, partial, ...(partial ? { next } : {}) };
}

export async function loadOwnerNfts(
  owner: string,
  options?: {
    timeoutMs?: number;
    signal?: AbortSignal;
    fetchImpl?: (path: string, init: RequestInit) => Promise<Response>;
    onState?: (state: NftLoadState) => void;
  },
): Promise<NftLoadState> {
  const timeoutMs = options?.timeoutMs ?? NFT_CLIENT_TIMEOUT_MS;
  const fetchImpl = options?.fetchImpl ?? ((path, init) => networkFetch(path, init));
  let state = initialNftLoadState();
  let cursor: string | undefined;
  const seen = new Set<string>();
  try {
    for (;;) {
      if (options?.signal?.aborted) throw new Error("aborted");
      const params = new URLSearchParams({ owner });
      if (cursor) {
        if (seen.has(cursor)) throw new Error("nft_cursor_loop");
        seen.add(cursor);
        params.set("cursor", cursor);
      }
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      // AbortSignal.timeout does not ref its timer, so a quiet test process would
      // exit before the abort. This timer only keeps the loop alive until the fetch settles.
      const keepAlive = setTimeout(() => {}, timeoutMs + 1_000);
      let res: Response;
      try {
        res = await fetchImpl(`nfts?${params.toString()}`, { signal, cache: "no-store" });
      } finally {
        clearTimeout(keepAlive);
      }
      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) throw new Error("nft_list_failed");
      state = applyNftPage(state, pageFromResponse(body, res.headers));
      options?.onState?.(state);
      if (!state.historyLoading || !state.next) return state;
      cursor = state.next;
    }
  } catch {
    const failed = nftLoadFailed(state);
    options?.onState?.(failed);
    return failed;
  }
}
