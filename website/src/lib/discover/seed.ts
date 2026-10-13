import { count } from "drizzle-orm";
import { getDbReady } from "@/db";
import { discoverProjects } from "@/db/schema";
import { DISCOVER_SEED_CATALOG, resolveDiscoverSeedIcon } from "@/lib/discover/seed-catalog";
import { DISCOVER_SEED_PROJECTS } from "@/lib/discover/seed-data";

export { DISCOVER_SEED_PROJECTS } from "@/lib/discover/seed-data";

export async function seedDiscoverProjectsIfEmpty(): Promise<{ seeded: boolean; count: number }> {
  const db = await getDbReady();
  const existing = await db.select({ c: count() }).from(discoverProjects);
  if (Number(existing[0]?.c ?? 0) > 0) {
    return { seeded: false, count: Number(existing[0]?.c ?? 0) };
  }
  for (const seed of DISCOVER_SEED_PROJECTS) {
    const tokens = await listDiscoverTokensFromNode();
    const catalog = DISCOVER_SEED_CATALOG[seed.id];
    const token = tokens.find((t) => t.assetId === (catalog?.tokenAssetId ?? seed.tokenAssetId));
    await db.insert(discoverProjects).values({
      id: seed.id,
      authorUserId: null,
      title: seed.title,
      videoUri: null,
      screenshotUris: "[]",
      tokenIconUri: resolveDiscoverSeedIcon(seed.id, seed.tokenAssetId, token?.imageUri ?? null),
      idea: seed.idea,
      audience: seed.audience,
      whyToken: seed.whyToken,
      tokenAssetId: catalog?.tokenAssetId ?? seed.tokenAssetId,
      tokenLink: catalog?.tokenLink ?? seed.tokenLink,
      productUrl: catalog?.productUrl ?? seed.productUrl,
      stageIndex: 3,
      revision: 1,
      status: "promoted",
      weightedScore: 0,
      isSeed: true,
    });
  }
  return { seeded: true, count: DISCOVER_SEED_PROJECTS.length };
}

export async function listDiscoverTokensFromNode(): Promise<
  { assetId: string; name: string; symbol: string; imageUri?: string | null }[]
> {
  const base =
    process.env.OVN_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_OVN_RPC_URL?.trim() ||
    "https://node.peopleblockchain.network";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/assets`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const raw = (await res.json()) as
      | { assets?: { assetId: string; name?: string; symbol?: string; imageUri?: string; creationMetadata?: { image?: string } }[] }
      | { assetId: string; name?: string; symbol?: string; imageUri?: string; creationMetadata?: { image?: string } }[];
    const assets = Array.isArray(raw) ? raw : raw.assets ?? [];
    return assets
      .filter((a) => a.assetId && a.assetId !== "ppl")
      .slice(0, 40)
      .map((a) => ({
        assetId: a.assetId,
        name: a.name ?? a.assetId,
        symbol: a.symbol ?? a.assetId.toUpperCase(),
        imageUri: a.imageUri ?? a.creationMetadata?.image ?? null,
      }));
  } catch {
    return [
      { assetId: "trosc2", name: "ROSCASH (Testnet demo)", symbol: "TROSC" },
      { assetId: "tpitp2", name: "People Tips (Testnet demo)", symbol: "TPITP" },
      { assetId: "tmark2", name: "TMARK (Testnet demo)", symbol: "TMARK" },
    ];
  }
}
