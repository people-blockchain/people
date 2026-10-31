import seedCatalog from "@/data/evm-seed-assets.json" with { type: "json" };
import { readEvmDeployments } from "@/lib/evm/config";

export type SeedAssetMeta = {
  name?: string;
  symbol?: string;
  decimals?: number;
  creationMetadata?: {
    description?: string;
    image?: string;
    website?: string;
    testnet?: boolean;
  };
};

export type SeedNftMeta = {
  name: string;
  description?: string;
  imageUri?: string;
};

type SeedCatalogFile = {
  version?: number;
  assets: Record<string, SeedAssetMeta>;
  nfts: Record<string, SeedNftMeta>;
};

const catalog = seedCatalog as SeedCatalogFile;

export function resolveLogicalAssetId(tokenAddress: string): string {
  const lower = tokenAddress.toLowerCase();
  const dep = readEvmDeployments();
  for (const [assetId, addr] of Object.entries(dep.assetMap ?? {})) {
    if (addr?.toLowerCase() === lower) return assetId.toLowerCase();
  }
  return lower;
}

export function seedAssetMeta(assetId: string): SeedAssetMeta | null {
  const id = assetId.toLowerCase();
  return catalog.assets[id] ?? null;
}

let curatedKeysCache: Map<string, string> | null = null;

/**
 * Lowercased curated names/symbols -> the curated assetId that owns them. A permissionless
 * token can set any name and symbol, so the catalog uses this to flag entries that claim a
 * curated identity instead of presenting the claim as that asset.
 */
export function curatedAssetKeys(): Map<string, string> {
  if (curatedKeysCache) return curatedKeysCache;
  const keys = new Map<string, string>();
  for (const [assetId, meta] of Object.entries(catalog.assets)) {
    const id = assetId.toLowerCase();
    for (const value of [meta.symbol, meta.name]) {
      const key = value?.trim().toLowerCase();
      if (key && !keys.has(key)) keys.set(key, id);
    }
  }
  curatedKeysCache = keys;
  return keys;
}

export function enrichAssetRow<T extends { assetId: string; name?: string; symbol?: string; decimals?: number; imageUri?: string; creationMetadata?: { image?: string } }>(
  row: T,
): T & { creationMetadata?: SeedAssetMeta["creationMetadata"]; imageUri?: string } {
  const meta = seedAssetMeta(row.assetId);
  if (!meta) return row;
  const seedImage = meta.creationMetadata?.image;
  const image = seedImage || row.imageUri;
  return {
    ...row,
    name: meta.name ?? row.name,
    symbol: meta.symbol ?? row.symbol,
    decimals: meta.decimals ?? row.decimals,
    creationMetadata: seedImage ? meta.creationMetadata : { ...meta.creationMetadata, ...(image ? { image } : {}) },
    imageUri: image,
  };
}
