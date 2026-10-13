import { NextResponse } from "next/server";
import { getNodeRpcUrl } from "@/lib/factory-config";
import { archivedBlockTime } from "@/lib/archive-block-time";

export const runtime = "nodejs";
const cache = new Map<string, number>();

export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  const base = getNodeRpcUrl();
  try {
    const response = await fetch(`${base}/assets/${encodeURIComponent(assetId)}`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ timestamp: null }, { status: response.status });
    const asset = await response.json();
    if (!Number.isSafeInteger(asset.createdAt) || asset.createdAt < 0) return NextResponse.json({ timestamp: null });
    const manifestResponse = await fetch(`${base}/network`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!manifestResponse.ok) return NextResponse.json({ timestamp: null });
    const manifest = await manifestResponse.json();
    // Only contact this configured node's own advertised archive, never arbitrary peers.
    const origin = new URL(base);
    const peer = manifest.archive && Array.isArray(manifest.bootstrapPeers) ? manifest.bootstrapPeers.find((value: unknown) => {
      if (typeof value !== "string") return false;
      try { const url = new URL(value); return url.hostname === origin.hostname && url.protocol === (origin.protocol === "https:" ? "wss:" : "ws:") && !url.username && !url.password; } catch { return false; }
    }) : null;
    if (!peer || typeof manifest.chainId !== "string") return NextResponse.json({ timestamp: null });
    const key = `${base}:${manifest.genesisHash}:${asset.createdAt}`;
    let timestamp = cache.get(key) ?? null;
    if (timestamp === null) timestamp = await archivedBlockTime(peer, manifest.chainId, asset.createdAt);
    if (timestamp !== null) { if (cache.size >= 500) cache.delete(cache.keys().next().value!); cache.set(key, timestamp); }
    return NextResponse.json({ timestamp }, { headers: { "Cache-Control": timestamp === null ? "no-store" : "public, max-age=3600" } });
  } catch { return NextResponse.json({ timestamp: null }); }
}
