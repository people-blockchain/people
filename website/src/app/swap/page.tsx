import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SwapApp } from "@/components/swap/SwapApp";
import { SITE_NAME } from "@/lib/site";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/ovn-compat";
import { SSR_PREFETCH_BUDGET_MS, withTimeout } from "@/lib/ssr-prefetch";
import type { PoolRow } from "@/components/swap/EvmSwapApp";
import type { AssetInfo } from "@/lib/asset-amounts";

export const metadata: Metadata = {
  title: "Swap | People's Blockchain",
  description:
    "Swap tokens for PPL, or PPL for tokens, and add liquidity to earn from trades. Each swap pays a 0.30% fee that stays with liquidity providers.",
  alternates: { canonical: "/swap" },
  openGraph: {
    title: "Swap tokens",
    description: "Swap tokens for PPL and add liquidity to token/PPL pools.",
    type: "website",
    siteName: SITE_NAME,
    url: "/swap",
  },
};

/**
 * Pools and the asset registry come from the same cached, batched on-chain scan the
 * `/api/evm/compat` route serves to the client (see `chain-catalog.ts`): reading it here too lets
 * the first paint already show real pools/tokens instead of waiting for the browser to mount,
 * fetch, and re-render.
 */
async function loadInitialSwapData(): Promise<{ pools: PoolRow[]; assets: AssetInfo[] }> {
  const empty = new URLSearchParams();
  const fallback = { status: 502, body: [] as unknown[] };
  const [poolsResult, assetsResult] = await Promise.all([
    withTimeout(handleEvmCompatGet("liquidity-pools", empty).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
    withTimeout(handleEvmCompatGet("assets", empty).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
  ]);
  return {
    pools: Array.isArray(poolsResult.body) ? (poolsResult.body as PoolRow[]) : [],
    assets: Array.isArray(assetsResult.body) ? (assetsResult.body as AssetInfo[]) : [],
  };
}

export default async function SwapPage() {
  const { pools, assets } = isCosmosEvmChain() ? await loadInitialSwapData() : { pools: [], assets: [] };
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Navbar />
      <main id="main" className="warm-page flex-1">
        <SwapApp initialPools={pools} initialAssets={assets} />
      </main>
      <Footer />
    </div>
  );
}
