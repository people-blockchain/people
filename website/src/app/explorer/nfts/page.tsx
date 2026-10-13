import { SiteChrome } from "@/components/SiteChrome";
import { NftList, type NftRow } from "@/components/explorer/ExplorerLists";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/ovn-compat";
import { SSR_PREFETCH_BUDGET_MS, withTimeout } from "@/lib/ssr-prefetch";

/**
 * The list is served by the same compat endpoint the `/api/evm/compat` route hands the browser
 * (`nfts`): reading it here too lets the first paint show real collections instead of a skeleton
 * that lasts until hydration finishes. The client still refetches on mount, so a stale prefetch
 * corrects itself.
 */
async function loadInitialNfts(): Promise<NftRow[]> {
  const empty = new URLSearchParams();
  const fallback = { status: 502, body: [] as unknown[] };
  const result = await withTimeout(
    handleEvmCompatGet("nfts", empty).catch(() => fallback),
    SSR_PREFETCH_BUDGET_MS,
    fallback
  );
  return Array.isArray(result.body) ? (result.body as NftRow[]) : [];
}

export default async function NftsPage() {
  const nfts = isCosmosEvmChain() ? await loadInitialNfts() : [];
  return (
    <SiteChrome>
      <NftList initialNfts={nfts} />
    </SiteChrome>
  );
}
