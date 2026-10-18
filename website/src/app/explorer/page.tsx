import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { ExplorerHome, type BlockRow, type TxRow } from "@/components/explorer/ExplorerHome";
import { SITE_NAME } from "@/lib/site";
import { isCosmosEvmChain } from "@/lib/chain-mode";
import { handleEvmCompatGet } from "@/lib/evm/people-compat";
import { SSR_PREFETCH_BUDGET_MS, withTimeout } from "@/lib/ssr-prefetch";
import { resolveNodeWebSocketUrl, resolvePublicChainId } from "@/lib/node-rpc";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explorer | PEOPLE Blockchain",
  description: "Blocks, transactions, addresses, tokens, and NFTs.",
  alternates: { canonical: "/explorer" },
  openGraph: {
    title: "Explorer",
    description: "Search the PEOPLE Blockchain node for blocks, transactions, and addresses.",
    type: "website",
    siteName: SITE_NAME,
    url: "/explorer",
  },
};

/**
 * On EVM chains the home feed arrives over the explorer websocket (~3-4.5 s on prod), so the page
 * used to render a skeleton until then. Reading the same compat endpoints the browser hits lets
 * the first paint carry real blocks and transactions; the socket still replaces them when it
 * publishes, and any failure here just falls back to the skeleton path we had before.
 */
async function loadInitialFeed(): Promise<{ blocks: BlockRow[]; txs: TxRow[] }> {
  const params = new URLSearchParams("limit=20");
  const fallback = { status: 502, body: [] as unknown[] };
  const [blocksResult, txsResult] = await Promise.all([
    withTimeout(handleEvmCompatGet("blocks", params).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
    withTimeout(handleEvmCompatGet("transactions", params).catch(() => fallback), SSR_PREFETCH_BUDGET_MS, fallback),
  ]);
  return {
    blocks: Array.isArray(blocksResult.body) ? (blocksResult.body as BlockRow[]) : [],
    txs: Array.isArray(txsResult.body) ? (txsResult.body as TxRow[]) : [],
  };
}

export default async function ExplorerPage() {
  const { blocks, txs } = isCosmosEvmChain() ? await loadInitialFeed() : { blocks: [], txs: [] };
  return (
    <SiteChrome>
      <ExplorerHome
        wsUrl={resolveNodeWebSocketUrl()}
        chainId={resolvePublicChainId()}
        initialBlocks={blocks}
        initialTxs={txs}
      />
    </SiteChrome>
  );
}
