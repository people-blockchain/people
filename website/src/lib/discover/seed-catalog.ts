/** Static routing and icons for curated demo cards (DB rows use these ids). */
export const DISCOVER_SEED_MARKER = "discover-seed-v1";

export type DiscoverSeedCatalogEntry = {
  tokenAssetId: string;
  tokenLink: string;
  productUrl: string | null;
  iconPath: string | null;
};

export const DISCOVER_SEED_CATALOG: Record<string, DiscoverSeedCatalogEntry> = {
  [`${DISCOVER_SEED_MARKER}-roscash`]: {
    tokenAssetId: "trosc2",
    tokenLink: "/swap",
    productUrl: "https://roscash.org",
    iconPath: "/seed/tROSC.svg",
  },
  [`${DISCOVER_SEED_MARKER}-tpitp`]: {
    tokenAssetId: "tpitp2",
    tokenLink: "/swap",
    productUrl: "/wallet",
    iconPath: "/seed/tPITP.svg",
  },
  [`${DISCOVER_SEED_MARKER}-tmark`]: {
    tokenAssetId: "tmark2",
    tokenLink: "/explorer/tokens",
    productUrl: "/explorer/tokens",
    iconPath: "/seed/tMARK.svg",
  },
  [`${DISCOVER_SEED_MARKER}-swap`]: {
    tokenAssetId: "ppl",
    tokenLink: "/swap",
    productUrl: "/swap",
    iconPath: null,
  },
  [`${DISCOVER_SEED_MARKER}-factory`]: {
    tokenAssetId: "ppl",
    tokenLink: "/create/token",
    productUrl: "/create/token",
    iconPath: null,
  },
  [`${DISCOVER_SEED_MARKER}-nft`]: {
    tokenAssetId: "ppl",
    tokenLink: "/create/nft",
    productUrl: "/create/nft",
    iconPath: null,
  },
};

export function isDiscoverSeedId(id: string): boolean {
  return id.startsWith(`${DISCOVER_SEED_MARKER}-`);
}

export function resolveDiscoverSeedIcon(
  projectId: string,
  tokenAssetId: string,
  tokenIconUri: string | null | undefined,
): string | null {
  const catalog = DISCOVER_SEED_CATALOG[projectId];
  if (catalog?.iconPath) return catalog.iconPath;
  if (tokenIconUri?.trim()) return tokenIconUri.trim();
  const byAsset: Record<string, string> = {
    trosc2: "/seed/tROSC.svg",
    tpitp2: "/seed/tPITP.svg",
    tmark2: "/seed/tMARK.svg",
    tkrda: "/seed/tKRDA.svg",
    tmem: "/seed/tMEM.svg",
    tgood: "/seed/tGOOD.svg",
  };
  return byAsset[tokenAssetId] ?? null;
}
