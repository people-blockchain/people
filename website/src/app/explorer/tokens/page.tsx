import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { TokenList, type PoolRow, type TokenRow } from "@/components/explorer/ExplorerLists";
import { SITE_NAME } from "@/lib/site";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/people-compat";
import { compatAssetRows } from "@/lib/explorer/token-catalog-list";
import { SSR_PREFETCH_BUDGET_MS, withTimeout } from "@/lib/ssr-prefetch";

export const metadata: Metadata = {
  title: "Tokens | PEOPLE Blockchain",
  description: "All tokens on PEOPLE Blockchain: supply, pools and where to swap them.",
  alternates: { canonical: "/explorer/tokens" },
  openGraph: {
    title: "Tokens",
    description: "All tokens on PEOPLE Blockchain: supply, pools and where to swap them.",
    type: "website",
    siteName: SITE_NAME,
    url: "/explorer/tokens",
  },
};

/**
 * The token list is served by the same cached, batched on-chain scan the `/api/evm/compat` route
 * hands the browser (see `chain-catalog.ts`): reading it here too lets the first paint show real
 * tokens and pool reserves instead of a skeleton that lasts until hydration finishes.
 */
async function loadInitialTokenData(): Promise<{ assets: TokenRow[]; pools: PoolRow[] }> {
  const empty = new URLSearchParams();
  const fallback = { status: 502, body: [] as unknown[] };
  const [assetsResult, poolsResult] = await Promise.all([
    withTimeout(handleEvmCompatGet("assets", empty).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
    withTimeout(handleEvmCompatGet("liquidity-pools", empty).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
  ]);
  return {
    assets: compatAssetRows<TokenRow>(assetsResult.body),
    pools: Array.isArray(poolsResult.body) ? (poolsResult.body as PoolRow[]) : [],
  };
}

export default async function TokensPage() {
  const { assets, pools } = isCosmosEvmChain() ? await loadInitialTokenData() : { assets: [], pools: [] };
  return (
    <SiteChrome>
      <TokenList initialAssets={assets} initialPools={pools} />
    </SiteChrome>
  );
}
