"use client";

import { useState } from "react";
import { resolveAssetImageUrl } from "@/lib/asset-image-src";
import { tokenIconByAddress } from "@/lib/token-icons";

/** Stable 32-bit FNV-1a hash of a ticker, used for the fallback gradient. */
export function tickerHash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text.toUpperCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function tickerGradient(text: string): string {
  const h = tickerHash(text || "?");
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >>> 9) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 70% 50%), hsl(${hue2} 75% 38%))`;
}

type Known = "ppl" | "usdt" | "usdc" | null;

function knownAsset(assetId: string | undefined, name: string, tokenAddress: string | undefined): { known: Known; url: string | null } {
  const byAddress = tokenIconByAddress(tokenAddress);
  if (byAddress) return { known: byAddress.kind, url: byAddress.url };
  const id = (assetId ?? "").trim().toLowerCase();
  const n = name.trim().toLowerCase();
  if (id === "ppl" || (!id && (n === "ppl" || n === "people" || n === "people (ppl)"))) return { known: "ppl", url: "/tokens/ppl.png" };
  if (id === "usdt" || (!id && (n === "usdt" || n === "test usdt"))) return { known: "usdt", url: "/tokens/usdt.svg" };
  return { known: null, url: null };
}

/** True for a brand mark that belongs to a known testnet mock, not the real asset. */
function isTestBadge(known: Known): boolean {
  return known === "usdt" || known === "usdc";
}

/**
 * Token / NFT image. PPL shows the People mark; USDT/USDC show their brand mark (resolved by
 * contract address first, then by legacy assetId) with a testnet badge, since these are mock
 * tokens, not the real asset; tokens with on-chain images show them; everything else gets a
 * colour gradient plus the ticker's first letter.
 */
export function AssetImage({ src, name, nft = false, className = "h-10 w-10", assetId, tokenAddress, testBadgeLabel }: {
  src?: unknown; name: string; nft?: boolean; className?: string; assetId?: string; tokenAddress?: string; testBadgeLabel?: string;
}) {
  const { known, url: knownUrl } = nft ? { known: null, url: null } : knownAsset(assetId, name, tokenAddress);
  const url = knownUrl ?? resolveAssetImageUrl(src);
  return <AssetImageView key={url ?? "missing"} url={url} name={name} nft={nft} className={className} known={known} testBadgeLabel={testBadgeLabel} />;
}

function AssetImageView({ url, name, nft, className, known, testBadgeLabel }: {
  url: string | null; name: string; nft: boolean; className: string; known: Known; testBadgeLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = url && !failed;
  const letter = (name.trim().replace(/^t(?=[A-Z])/, "").charAt(0) || "?").toUpperCase();
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} aria-hidden={testBadgeLabel ? undefined : true} title={isTestBadge(known) ? testBadgeLabel : undefined}>
      <span
        className={`inline-flex h-full w-full items-center justify-center overflow-hidden ${nft ? "rounded-xl border border-line bg-canvas" : "rounded-full"}  ${!nft && !showImage ? "" : !nft && known !== "ppl" ? "border border-line bg-canvas" : ""}`}
        style={!nft && !showImage ? { backgroundImage: tickerGradient(name) } : undefined}
      >
        {showImage ? (
          // ipfs:// is already a same-origin /api/ipfs URL; other URLs stay as given.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`h-full w-full object-cover`} />
        ) : nft ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-1/2 w-1/2 text-ink-3">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="9" cy="9" r="2" />
            <path d="m3 17 5-5 4 4 4-6 5 7" />
          </svg>
        ) : (
          <span className="select-none font-bold leading-none text-white" style={{ fontSize: "clamp(0.6rem, 45%, 1.25rem)" }}>{letter}</span>
        )}
      </span>
      {isTestBadge(known) ? (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-[42%] min-h-3 w-[42%] min-w-3 items-center justify-center rounded-full border-2 border-canvas bg-warm text-canvas" aria-hidden="true">
          {/* flask = testnet */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-[70%] w-[70%]"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /></svg>
        </span>
      ) : null}
      {isTestBadge(known) && testBadgeLabel ? <span className="sr-only">{testBadgeLabel}</span> : null}
    </span>
  );
}
