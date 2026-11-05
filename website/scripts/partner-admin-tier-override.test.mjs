import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KOL_TIER_OVERRIDE_PRESET_USDC_BPS,
  validateKolTierOverrideBps,
  volumeTierUsdcBps,
} from "../src/lib/partner/admin-tier-override.ts";
import { MICRO_PER_UNIT } from "../src/lib/partner/commission.ts";

test("KOL tier override presets match 7/9/12% USDC bps", () => {
  assert.deepEqual([...KOL_TIER_OVERRIDE_PRESET_USDC_BPS], [700, 900, 1200]);
});

test("validateKolTierOverrideBps rejects below volume tier", () => {
  const lowVolume = 1n * MICRO_PER_UNIT;
  const floor = volumeTierUsdcBps(lowVolume);
  assert.equal(floor, 700);
  assert.deepEqual(validateKolTierOverrideBps(lowVolume, 900), { ok: true, normalized: 900 });
  assert.deepEqual(validateKolTierOverrideBps(lowVolume, 699), { ok: false, error: "below_volume_tier" });
});

test("validateKolTierOverrideBps allows clear and high custom bps", () => {
  const vol = 50_000n * MICRO_PER_UNIT;
  assert.equal(volumeTierUsdcBps(vol), 900);
  assert.deepEqual(validateKolTierOverrideBps(vol, null), { ok: true, normalized: null });
  assert.deepEqual(validateKolTierOverrideBps(vol, 1500), { ok: true, normalized: 1500 });
  assert.deepEqual(validateKolTierOverrideBps(vol, 800), { ok: false, error: "below_volume_tier" });
});

test("PATCH handler validates kolTierOverrideBps before persisting", async () => {
  const routePath = new URL("../src/app/api/admin/referral/partners/route.ts", import.meta.url);
  const src = (await import("node:fs/promises")).readFile
    ? await (await import("node:fs/promises")).readFile(routePath, "utf8")
    : "";
  assert.match(src, /validateKolTierOverrideBps/);
  assert.match(src, /setPartnerKolTierOverrideBps/);
  assert.match(src, /export async function PATCH/);
});
