"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { explorerCopy } from "@/lib/explorer-copy";

/**
 * Shared sub-navigation for every explorer page.
 *
 * The list pages are the five entry points of the explorer; the current one is rendered as a
 * non-clickable `aria-current="page"` marker so it is announced by screen readers and cannot be
 * re-navigated to. Detail pages (`/explorer/block/*`, `/explorer/token/*`, …) keep the section of
 * the list they belong to highlighted.
 */

type ItemKey = "testnet" | "explorer" | "blocks" | "tokens" | "nfts";

const ITEMS: readonly { key: ItemKey; href: string }[] = [
  // Back to the network's public home; everything else stays inside the explorer.
  { key: "testnet", href: "/" },
  { key: "explorer", href: "/explorer" },
  { key: "blocks", href: "/explorer/blocks" },
  { key: "tokens", href: "/explorer/tokens" },
  { key: "nfts", href: "/explorer/nfts" },
];

/** Longest-prefix match so `/explorer/block/7` highlights Blocks, not Explorer. */
function activeKey(pathname: string | null): ItemKey | null {
  const path = (pathname ?? "").replace(/\/+$/, "") || "/";
  if (path === "/") return "testnet";
  if (path === "/explorer" || path === "/explorer/contracts") {
    // Contracts is a sibling list with no subnav entry of its own — Explorer stands in for it.
    return path === "/explorer" ? "explorer" : null;
  }
  if (path === "/explorer/blocks" || path.startsWith("/explorer/block/")) return "blocks";
  if (path === "/explorer/tokens" || path.startsWith("/explorer/token/")) return "tokens";
  if (path.startsWith("/explorer/nfts")) return "nfts";
  if (path.startsWith("/explorer/tx/") || path.startsWith("/explorer/address/")) return "explorer";
  return null;
}

export function ExplorerSubnav({ className = "" }: { className?: string }) {
  const { lang } = useLanguage();
  const t = explorerCopy[lang];
  const pathname = usePathname();
  const active = activeKey(pathname);

  const label: Record<ItemKey, string> = {
    testnet: t.testnet,
    explorer: t.title,
    blocks: t.blocks,
    tokens: t.tokens,
    nfts: t.nfts,
  };

  return (
    <nav aria-label={t.title} data-testid="explorer-subnav" className={`mt-6 flex flex-wrap items-center gap-2 text-sm font-semibold ${className}`}>
      {ITEMS.map((item) => {
        const isActive = item.key === active;
        if (isActive) {
          return (
            <span
              key={item.key}
              aria-current="page"
              data-subnav-active={item.key}
              className="inline-flex min-h-9 items-center rounded-lg border border-brand/40 bg-brand/10 px-3 text-ink"
            >
              {label[item.key]}
            </span>
          );
        }
        return (
          <Link
            key={item.key}
            href={item.href}
            data-subnav-link={item.key}
            className="inline-flex min-h-9 items-center rounded-lg border border-transparent px-3 text-brand hover:border-line hover:bg-surface-2 hover:text-ink"
          >
            {label[item.key]}
          </Link>
        );
      })}
    </nav>
  );
}
