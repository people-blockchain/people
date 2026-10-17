import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { BlocksList, type BlockRow } from "@/components/explorer/BlocksList";
import { SITE_NAME } from "@/lib/site";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/ovn-compat";
import { SSR_PREFETCH_BUDGET_MS, withTimeout } from "@/lib/ssr-prefetch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blocks | PEOPLE Blockchain",
  description: "The latest blocks produced by the PEOPLE Blockchain testnet, with height, hash and time.",
  alternates: { canonical: "/explorer/blocks" },
  openGraph: {
    title: "Blocks",
    description: "The latest blocks produced by the PEOPLE Blockchain testnet.",
    type: "website",
    siteName: SITE_NAME,
    url: "/explorer/blocks",
  },
};

/**
 * The list is served by the same cached, batched on-chain read the `/api/evm/compat` route hands
 * the browser (`blocks?limit=50`): reading it here too lets the first paint show real blocks
 * instead of a skeleton that lasts until hydration finishes. The client still refreshes every
 * 12 s, so a stale prefetch corrects itself.
 */
async function loadInitialBlocks(): Promise<BlockRow[]> {
  const params = new URLSearchParams("limit=50");
  const fallback = { status: 502, body: [] as unknown[] };
  const result = await withTimeout(
    handleEvmCompatGet("blocks", params).catch(() => fallback),
    SSR_PREFETCH_BUDGET_MS,
    fallback
  );
  return Array.isArray(result.body) ? (result.body as BlockRow[]) : [];
}

export default async function BlocksPage() {
  const blocks = isCosmosEvmChain() ? await loadInitialBlocks() : [];
  return (
    <SiteChrome>
      <BlocksList initialBlocks={blocks} />
    </SiteChrome>
  );
}
