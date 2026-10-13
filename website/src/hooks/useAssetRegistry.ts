"use client";

import { useEffect, useState } from "react";
import { networkJson } from "@/lib/network-client";
import type { AssetInfo } from "@/lib/asset-amounts";

let cache: Record<string, AssetInfo> | null = null;
let inflight: Promise<Record<string, AssetInfo>> | null = null;

function seedCache(initialAssets: AssetInfo[]): Record<string, AssetInfo> {
  cache = Object.fromEntries(initialAssets.map((a) => [a.assetId.toLowerCase(), a]));
  return cache;
}

function load(): Promise<Record<string, AssetInfo>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = networkJson<AssetInfo[]>("assets")
      .then((list) => {
        cache = Object.fromEntries((Array.isArray(list) ? list : []).map((a) => [a.assetId.toLowerCase(), a]));
        return cache;
      })
      .catch(() => {
        inflight = null;
        return {} as Record<string, AssetInfo>;
      });
  }
  return inflight;
}

/**
 * Shared asset registry (symbols, decimals, images) fetched once per page load. `initialAssets`
 * (from an SSR prefetch) seeds the module cache before the first network fetch, so a page that
 * already has the data server-side never shows an empty registry while the client re-fetches it.
 */
export function useAssetRegistry(initialAssets?: AssetInfo[]): Record<string, AssetInfo> {
  const [assets, setAssets] = useState<Record<string, AssetInfo>>(() =>
    cache ?? (initialAssets?.length ? seedCache(initialAssets) : {}),
  );
  useEffect(() => {
    let alive = true;
    void load().then((value) => {
      if (alive) setAssets(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return assets;
}
