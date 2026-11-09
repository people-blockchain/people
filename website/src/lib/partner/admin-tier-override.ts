import { loadKolTierConfig, resolveKolTier, type KolTierConfig } from "@/lib/partner/commission";

/** Preset USDC commission rates (bps): 7% / 9% / 12%. Custom admin overrides must stay at or above the volume tier. */
export const KOL_TIER_OVERRIDE_PRESET_USDC_BPS = [700, 900, 1200] as const;

export type KolTierOverrideValidation =
  | { ok: true; normalized: number | null }
  | { ok: false; error: "invalid_bps" | "below_volume_tier" };

export function volumeTierUsdcBps(
  volumeUsdMicro: bigint,
  config: KolTierConfig = loadKolTierConfig(),
): number {
  return resolveKolTier(volumeUsdMicro, null, config).usdcRateBps;
}

export function validateKolTierOverrideBps(
  volumeUsdMicro: bigint,
  overrideBps: number | null | undefined,
  config: KolTierConfig = loadKolTierConfig(),
): KolTierOverrideValidation {
  if (overrideBps === null || overrideBps === undefined) {
    return { ok: true, normalized: null };
  }
  if (!Number.isInteger(overrideBps) || overrideBps <= 0) {
    return { ok: false, error: "invalid_bps" };
  }
  const floorBps = volumeTierUsdcBps(volumeUsdMicro, config);
  if (overrideBps < floorBps) {
    return { ok: false, error: "below_volume_tier" };
  }
  return { ok: true, normalized: overrideBps };
}
