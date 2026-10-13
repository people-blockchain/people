import type { Language } from "@/lib/preferences";
import { discoverCopy, type DiscoverCopy } from "@/lib/discover-content";
import {
  DISCOVER_SEED_CATALOG,
  isDiscoverSeedId,
  resolveDiscoverSeedIcon,
} from "@/lib/discover/seed-catalog";
import { DISCOVER_SEED_PROJECTS } from "@/lib/discover/seed-data";

export type DiscoverPresentableProject = {
  id: string;
  title: string;
  idea: string;
  audience: string;
  whyToken: string;
  tokenAssetId: string;
  tokenLink: string;
  productUrl: string | null;
  tokenIconUri: string | null;
  tags?: string[];
  isSeed?: boolean;
  videoUri?: string | null;
  screenshotUris?: string;
  stageIndex?: number;
  status?: string;
  revision?: number;
};

type SeedCardCopy = DiscoverCopy["seedCards"][keyof DiscoverCopy["seedCards"]];

function seedCardCopy(lang: Language, projectId: string): SeedCardCopy | null {
  const cards = discoverCopy[lang].seedCards as Record<string, SeedCardCopy>;
  const enCards = discoverCopy.en.seedCards as Record<string, SeedCardCopy>;
  return cards[projectId] ?? enCards[projectId] ?? null;
}

export function discoverSeedSummary(lang: Language, projectId: string): string | undefined {
  return seedCardCopy(lang, projectId)?.summary;
}

export function presentDiscoverProject<T extends DiscoverPresentableProject>(
  lang: Language,
  project: T,
): T & { tags: string[] } {
  const catalog = isDiscoverSeedId(project.id) ? DISCOVER_SEED_CATALOG[project.id] : undefined;
  const localized = seedCardCopy(lang, project.id);
  const icon = resolveDiscoverSeedIcon(project.id, project.tokenAssetId, project.tokenIconUri);

  if (!localized && !catalog) {
    return { ...project, tags: project.tags ?? [], tokenIconUri: icon };
  }

  return {
    ...project,
    title: localized?.title ?? project.title,
    idea: localized?.idea ?? project.idea,
    audience: localized?.audience ?? project.audience,
    whyToken: localized?.whyToken ?? project.whyToken,
    tokenAssetId: catalog?.tokenAssetId ?? project.tokenAssetId,
    tokenLink: catalog?.tokenLink ?? project.tokenLink,
    productUrl: catalog?.productUrl ?? project.productUrl,
    tokenIconUri: icon,
    tags: localized?.tags ?? project.tags ?? [],
    isSeed: project.isSeed || Boolean(catalog),
  };
}

/** Feed/detail fallback when Postgres is unavailable. */
export function getStaticSeedProjectById(id: string): DiscoverPresentableProject | null {
  const row = staticSeedProjectsForFeed().find((p) => p.id === id);
  return row ?? null;
}

export function staticSeedProjectsForFeed(): DiscoverPresentableProject[] {
  return DISCOVER_SEED_PROJECTS.map((seed) => {
    const catalog = DISCOVER_SEED_CATALOG[seed.id];
    return {
      id: seed.id,
      title: seed.title,
      idea: seed.idea,
      audience: seed.audience,
      whyToken: seed.whyToken,
      tokenAssetId: catalog?.tokenAssetId ?? seed.tokenAssetId,
      tokenLink: catalog?.tokenLink ?? seed.tokenLink,
      productUrl: catalog?.productUrl ?? seed.productUrl,
      tokenIconUri: resolveDiscoverSeedIcon(seed.id, seed.tokenAssetId, null),
      tags: [],
      isSeed: true,
      videoUri: null,
      screenshotUris: "[]",
      stageIndex: 3,
      status: "promoted",
      revision: 1,
    };
  });
}
