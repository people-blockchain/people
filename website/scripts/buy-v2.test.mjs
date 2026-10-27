import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { V2_PHASES } from "../src/lib/sale/v2/constants.ts";
import {
  estimatePplOut,
  isV2BuyEnabled,
  isV2PreviewEnabled,
  minPplOutFromEstimate,
  partialTopUpAmount,
  phaseView,
  previewSnapshot,
  resolveV2Chain,
  sellBackUnlockMs,
  shouldRenderV2Buy,
  validateV2BuyAmount,
} from "../src/lib/sale/v2/logic.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];

test("v2 gate is off by default and needs the explicit flag", () => {
  assert.equal(isV2BuyEnabled({}), false);
  assert.equal(shouldRenderV2Buy({}), false);
  assert.equal(isV2BuyEnabled({ NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "0" }), false);
  assert.equal(isV2BuyEnabled({ NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "1" }), true);
  assert.equal(shouldRenderV2Buy({ NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "1" }), true);
});

test("preview mode requires both flags and is refused in production", () => {
  assert.equal(isV2PreviewEnabled({ NEXT_PUBLIC_PPL_V2_BUY_PREVIEW: "1" }), false);
  assert.equal(
    isV2PreviewEnabled({
      NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "1",
      NEXT_PUBLIC_PPL_V2_BUY_PREVIEW: "1",
    }),
    true,
  );
  assert.equal(
    isV2PreviewEnabled({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_PPL_V2_BUY_ENABLED: "1",
      NEXT_PUBLIC_PPL_V2_BUY_PREVIEW: "1",
    }),
    false,
  );
});

test("per-buy limits are $10 and $500, inclusive", () => {
  assert.equal(validateV2BuyAmount({ amountUsd: 9.99 }).ok, false);
  assert.equal(validateV2BuyAmount({ amountUsd: 10 }).ok, true);
  assert.equal(validateV2BuyAmount({ amountUsd: 500 }).ok, true);
  assert.equal(validateV2BuyAmount({ amountUsd: 500.01 }).ok, false);
  assert.equal(validateV2BuyAmount({ amountUsd: 0 }).ok, false);
  assert.equal(validateV2BuyAmount({ amountUsd: Number.NaN }).ok, false);
});

test("the per-address daily limit is $2,000 in UTC-day spending", () => {
  assert.equal(validateV2BuyAmount({ amountUsd: 500, spentTodayUsd: 1_500 }).ok, true);
  assert.equal(validateV2BuyAmount({ amountUsd: 500, spentTodayUsd: 1_500.01 }).ok, false);
  const over = validateV2BuyAmount({ amountUsd: 400, spentTodayUsd: 1_700 });
  assert.deepEqual(over, { ok: false, reason: "over_day", limit: 2_000 });
});

test("minPplOut is 99% of the estimate (1% slippage, rounded down)", () => {
  assert.equal(minPplOutFromEstimate(BigInt(1_000_000)), BigInt(990_000));
  assert.equal(minPplOutFromEstimate(BigInt(10_001)), BigInt(9_900));
});

test("PPL estimate follows the 18-decimal spot price", () => {
  // $100 at $0.005/PPL = 20,000 PPL.
  const estimate = estimatePplOut(BigInt(100_000_000), BigInt("5000000000000000"));
  assert.equal(estimate, BigInt(20_000) * BigInt(10) ** BigInt(18));
  assert.equal(estimatePplOut(BigInt(0), BigInt("5000000000000000")), BigInt(0));
  assert.equal(estimatePplOut(BigInt(100_000_000), BigInt(0)), BigInt(0));
});

test("sell-back unlock is boughtAt + 30 days", () => {
  const boughtAt = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(sellBackUnlockMs(boughtAt), Date.UTC(2026, 0, 31, 12, 0, 0));
});

test("a swap that succeeded while buy() failed yields the received USDC top-up", () => {
  assert.equal(
    partialTopUpAmount({ swapSucceeded: true, buyFailed: true, receivedUsdc: 123.456 }),
    123.45,
  );
  assert.equal(partialTopUpAmount({ swapSucceeded: false, buyFailed: true, receivedUsdc: 100 }), null);
  assert.equal(partialTopUpAmount({ swapSucceeded: true, buyFailed: false, receivedUsdc: 100 }), null);
  assert.equal(partialTopUpAmount({ swapSucceeded: true, buyFailed: true, receivedUsdc: 0 }), null);
});

test("phase view allows buying only in whitelist/open and counts the 7-day window", () => {
  const opened = Date.UTC(2026, 9, 18, 12, 0, 0) / 1000;
  const now = Date.UTC(2026, 9, 20, 12, 0, 0);
  const whitelist = phaseView(V2_PHASES.Whitelist, opened, now);
  assert.equal(whitelist.buyable, true);
  assert.equal(whitelist.whitelist, true);
  assert.equal(whitelist.whitelistDaysLeft, 5);
  assert.equal(phaseView(V2_PHASES.Open, opened, now).buyable, true);
  assert.equal(phaseView(V2_PHASES.Expired, opened, now).buyable, false);
  assert.equal(phaseView(V2_PHASES.Graduated, opened, now).buyable, false);
  assert.equal(phaseView(V2_PHASES.NotOpen, opened, now).buyable, false);
});

test("preview snapshots are deterministic and contain all four states", () => {
  const a = previewSnapshot("success");
  const b = previewSnapshot("success");
  assert.deepEqual(a, b);
  assert.equal(previewSnapshot("unverified").siteVerified, false);
  assert.equal(previewSnapshot("verified").siteVerified, true);
  assert.equal(previewSnapshot("verified").personId, null);
  assert.ok(previewSnapshot("success").personId);
  assert.ok(previewSnapshot("success").purchase);
  assert.equal(previewSnapshot("partial").partial?.receivedUsdc, 123.45);
});

test("v2 chain defaults to Base and accepts an explicit hub address", () => {
  const hub = "0x00000000000000000000000000000000000000a1";
  const chain = resolveV2Chain({ NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: hub });
  assert.equal(chain.id, 8453);
  assert.equal(chain.hubAddress, hub);
  assert.equal(resolveV2Chain({ NEXT_PUBLIC_PPL_V2_HUB_ADDRESS: "0xabc" }).hubAddress, null);
  assert.equal(resolveV2Chain({ NEXT_PUBLIC_PPL_V2_CHAIN_ID: "84532" }).id, 84532);
});

function v2Keys(value, prefix = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) =>
      v2Keys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

test("all 12 locales carry every v2 key", () => {
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8")).v2;
  const expected = v2Keys(en).sort();
  for (const lang of LANGS) {
    const copy = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8")).v2;
    assert.ok(copy, `${lang} is missing v2`);
    assert.deepEqual(v2Keys(copy).sort(), expected, `${lang} v2 keys`);
  }
});

test("owner-approved RU strings are exact", () => {
  const ru = JSON.parse(readFileSync(join(surfaces, "buy-ru.json"), "utf8")).v2;
  assert.equal(ru.form.lifiLine, "Обмен через LI.FI, покупка в USDC на Base");
  assert.equal(
    ru.form.sellbackLine,
    "Продать обратно можно через 30 дней, лимиты выкупа — подробнее",
  );
  assert.equal(ru.partial.topUp, "Докупить PPL на {amount} USDC");
});

test("v2 copy never uses banned explorer or Safe wording", () => {
  for (const lang of LANGS) {
    const raw = readFileSync(join(surfaces, `buy-${lang}.json`), "utf8");
    const v2 = JSON.parse(raw).v2;
    const blob = JSON.stringify(v2);
    assert.doesNotMatch(blob, /basescan|\bRPC\b|\bGnosis\b|\bSafe\b/, `${lang} v2`);
  }
});
