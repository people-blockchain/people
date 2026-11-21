// Public API CDN cache headers and relaxed client poll intervals (pre-mainnet edge savings).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("sale config is CDN-cacheable for anonymous monitors and buy pages", () => {
  const src = read("src/app/api/sale/config/route.ts");
  assert.match(src, /PUBLIC_CACHE_45S/);
  assert.match(src, /\{ headers: PUBLIC_CACHE_45S \}/);
});

test("factory config, auth features, and node setup expose short public CDN cache", () => {
  assert.match(read("src/app/api/factory/config/route.ts"), /\{ headers: PUBLIC_CACHE_60S \}/);
  assert.match(read("src/app/api/auth/features/route.ts"), /\{ headers: PUBLIC_CACHE_60S \}/);
  assert.match(read("src/app/api/node-setup/route.ts"), /PUBLIC_CACHE_60S/);
});

test("referral resolve caches successful wallet lookups per code URL", () => {
  const src = read("src/app/api/referral/resolve/route.ts");
  assert.match(src, /\{ headers: PUBLIC_CACHE_30S \}/);
  for (const line of src.split("\n").filter((l) => /rate_limited|invalid_code|unavailable/.test(l))) {
    assert.doesNotMatch(line, /PUBLIC_CACHE/, `must not cache errors: ${line.trim()}`);
  }
});

test("support chat widget polls every 30s only while open", () => {
  const src = read("src/components/SupportChatWidget.tsx");
  assert.match(src, /POLL_INTERVAL_MS = 30_000/);
  assert.match(src, /if \(!open\) return;/);
  assert.match(src, /document\.visibilityState === "visible"/);
});

test("relaxed UI poll intervals use visibility-aware timers", () => {
  const cases = [
    ["src/components/market/TokenMarketPanel.tsx", /POLL_MS = 30_000/, /visibilitychange/],
    ["src/components/staking/StakingApp.tsx", /30_000/, /useVisibleInterval/],
    ["src/components/swap/EvmSwapApp.tsx", /30_000/, /useVisibleInterval/],
    ["src/components/governance/GovernanceApp.tsx", /45_000/, /useVisibleInterval/],
    ["src/components/explorer/BlocksList.tsx", /BLOCKS_POLL_MS = 30_000/, /useVisibleInterval/],
    ["src/components/home/HomeWarmSections.tsx", /NETWORK_POLL_MS = 60_000/, /useVisibleInterval/],
    ["src/components/home/HomeWarmFoundersTeaser.tsx", /STATS_POLL_MS = 60_000/, /useVisibleInterval/],
    ["src/components/founders/FoundersApp.tsx", /60_000/, /useVisibleInterval/],
  ];
  for (const [file, interval, vis] of cases) {
    const src = read(file);
    assert.match(src, interval, file);
    assert.match(src, vis, file);
  }
});

test("buy checkout delivery polling is unchanged", () => {
  const src = read("src/lib/sale/useUsdcDelivery.ts");
  assert.match(src, /DELIVERY_POLL_MS = 6000/);
});