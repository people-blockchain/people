import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { V2_PHASES } from "../src/lib/sale/v2/constants.ts";
import { fillCopy, usdcAmount } from "../src/lib/sale/format.ts";
import {
  estimatePplOut,
  heroPhase,
  isV2BuyEnabled,
  isV2PreviewEnabled,
  minPplOutFromEstimate,
  panelVisibility,
  partialTopUpAmount,
  phaseView,
  previewSnapshot,
  resolveV2Chain,
  sellBackUnlockMs,
  shouldRenderV2Buy,
  statsCopyKeys,
  validateV2BuyAmount,
} from "../src/lib/sale/v2/logic.ts";
import {
  V2_OPEN_DATE_DEFAULT,
  formatV2OpenDate,
  parseV2OpenDate,
  saleWindowCaptionKey,
  v2SaleWindowValue,
} from "../src/lib/sale/v2/stats-copy.ts";

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

test("USDC amounts use one formatter with exactly two decimals in text and button", () => {
  assert.equal(usdcAmount(123.45, "en"), "123.45");
  assert.equal(usdcAmount(123.4, "en"), "123.40");
  assert.equal(usdcAmount(123.456, "en"), "123.46");

  const amount = usdcAmount(
    partialTopUpAmount({ swapSucceeded: true, buyFailed: true, receivedUsdc: 123.456 }),
    "en",
  );
  const copy = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8")).v2.partial;
  const body = fillCopy(copy.body, { amount });
  const button = fillCopy(copy.topUp, { amount });
  assert.match(body, /123\.45 USDC/);
  assert.match(button, /123\.45 USDC/);
  assert.ok(body.includes(`${amount} USDC`));
  assert.ok(button.includes(`${amount} USDC`));
});

test("the partial state is a single top-up card with no form or main CTA", () => {
  const partial = panelVisibility({ hasPurchase: true, hasPartial: true });
  assert.deepEqual(partial, {
    showForm: false,
    showVerification: false,
    showSuccess: false,
    showTopUp: true,
  });
  const normal = panelVisibility({ hasPurchase: false, hasPartial: false });
  assert.equal(normal.showForm, true);
  assert.equal(normal.showTopUp, false);
  const success = panelVisibility({ hasPurchase: true, hasPartial: false });
  assert.equal(success.showForm, false);
  assert.equal(success.showSuccess, true);
  assert.equal(success.showTopUp, false);
});

test("the hero follows the V2 whitelist phase, and legacy pages keep their old phase", () => {
  assert.equal(
    heroPhase({ v2Enabled: true, phase: V2_PHASES.Whitelist, legacyOpen: false }),
    "whitelist",
  );
  assert.equal(heroPhase({ v2Enabled: true, phase: V2_PHASES.Open, legacyOpen: false }), "open");
  assert.equal(heroPhase({ v2Enabled: true, phase: V2_PHASES.NotOpen, legacyOpen: true }), "closed");
  assert.equal(heroPhase({ v2Enabled: false, phase: V2_PHASES.Whitelist, legacyOpen: false }), "closed");
  assert.equal(heroPhase({ v2Enabled: false, phase: V2_PHASES.Whitelist, legacyOpen: true }), "open");
});

test("stats copy keys follow the V2 phase and fall back to legacy keys when the flag is off", () => {
  assert.deepEqual(
    statsCopyKeys({ v2Enabled: false, phase: V2_PHASES.Whitelist, legacyOpen: false }),
    {
      eyebrow: "statsTitleClosed",
      statusLabel: "saleStatus",
      statusValue: "notOpenYet",
      statusHint: "startPriceOnOpen",
      window: "closed",
    },
  );
  assert.deepEqual(
    statsCopyKeys({ v2Enabled: false, phase: V2_PHASES.Whitelist, legacyOpen: true }),
    {
      eyebrow: "statsTitle",
      statusLabel: "price",
      statusValue: "spotPrice",
      statusHint: "priceStartHint",
      window: "open",
    },
  );
  assert.deepEqual(
    statsCopyKeys({ v2Enabled: true, phase: V2_PHASES.Whitelist, legacyOpen: false }),
    {
      eyebrow: "statsTitleWhitelist",
      statusLabel: "price",
      statusValue: "spotPrice",
      statusHint: "whitelistStatus",
      window: "open",
    },
  );
  assert.deepEqual(
    statsCopyKeys({ v2Enabled: true, phase: V2_PHASES.Open, legacyOpen: false }),
    {
      eyebrow: "statsTitleOpen",
      statusLabel: "price",
      statusValue: "spotPrice",
      statusHint: "openStatus",
      window: "open",
    },
  );
  assert.equal(
    statsCopyKeys({ v2Enabled: true, phase: V2_PHASES.NotOpen, legacyOpen: true }).eyebrow,
    "statsTitleClosed",
  );
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

test("all 12 locales carry a translated hero with one sentence per sale phase", () => {
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8")).hero;
  assert.equal(en.headline, "Blockchain for everyone. Finally.");
  const phaseKeys = ["subUpcoming", "subWhitelist", "subOpen", "subEnded"];
  for (const lang of LANGS) {
    const hero = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8")).hero;
    for (const key of ["headline", "lead", "ctaVerify", "ctaBuy", ...phaseKeys]) {
      assert.ok(hero[key], `${lang} is missing hero.${key}`);
      if (lang !== "en") assert.notEqual(hero[key], en[key], `${lang} needs a translation for hero.${key}`);
    }
    assert.equal(new Set(phaseKeys.map((key) => hero[key])).size, phaseKeys.length, `${lang}: one sentence per phase`);
    assert.ok(hero.subUpcoming.includes("{date}"), `${lang}: opening date placeholder`);
    assert.ok(hero.subWhitelist.includes("{days}"), `${lang}: whitelist days placeholder`);
  }
});

test("all 12 locales carry real whitelist/open stats copy", () => {
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8"));
  assert.equal(en.stats.whitelistStatus, "Whitelist: verified only");
  assert.equal(en.stats.openStatus, "Open");
  for (const lang of LANGS) {
    const copy = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8"));
    for (const key of ["whitelistStatus", "openStatus"]) {
      assert.ok(copy.stats[key], `${lang} is missing stats.${key}`);
      if (lang !== "en") {
        assert.notEqual(copy.stats[key], en.stats[key], `${lang} needs a translation for stats.${key}`);
      }
    }
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

test("the v2 open date defaults, rejects invalid values and accepts a custom ISO date", () => {
  assert.equal(V2_OPEN_DATE_DEFAULT, "2026-12-01");
  assert.equal(parseV2OpenDate(undefined).toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(parseV2OpenDate("").toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(parseV2OpenDate("not-a-date").toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(parseV2OpenDate("2026-02-30").toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(parseV2OpenDate("2027-02-15").toISOString(), "2027-02-15T00:00:00.000Z");
});

test("the v2 sale window contains the locale-formatted opening date", () => {
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8"));
  const custom = "2027-02-15";
  const formatted = formatV2OpenDate(custom, "en");
  assert.match(formatted, /2027/);
  const value = v2SaleWindowValue({ copy: en, lang: "en", openDate: custom });
  assert.ok(value.includes(formatted), value);
  assert.match(value, /whitelist/i);
  assert.match(value, /24 months/);
  assert.equal(
    v2SaleWindowValue({ copy: en, lang: "en", openDate: "bogus" }),
    "7-day whitelist from 1 Dec 2026, then open sale up to 24 months",
  );
});

test("the v2 sale-window caption is dropped and the legacy caption key is kept", () => {
  assert.equal(saleWindowCaptionKey({ v2Enabled: true }), null);
  assert.equal(saleWindowCaptionKey({ v2Enabled: false }), "saleWindowHint");
});

test("all 12 locales have the v2 sale-window key with a {date} placeholder", () => {
  for (const lang of LANGS) {
    const stats = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8")).stats;
    assert.equal(typeof stats.saleWindowV2, "string", `${lang} stats.saleWindowV2`);
    assert.ok(stats.saleWindowV2.includes("{date}"), `${lang} needs {date}`);
  }
});
