import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buyCopyVars,
  buyPagePhase,
  countdownTo,
  curvePosition,
  demoTrades,
  formatOpenDate,
  soldPplForSpotPrice,
  tradeDemoAllowed,
} from "../src/lib/sale/buy-page.ts";
import { CURVE, SALE, SELL_BACK } from "../src/lib/sale/config.ts";
import { spotPriceUsd } from "../src/lib/sale/curve.ts";
import { fillCopy, usdCents } from "../src/lib/sale/format.ts";
import { V2_PHASES, V2_SALE } from "../src/lib/sale/v2/constants.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");
const LANGS = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
const read = (rel) => readFileSync(join(root, rel), "utf8");
const buy = Object.fromEntries(
  LANGS.map((lang) => [lang, JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8"))]),
);

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/* ── Page phase, countdown, curve position ─────────────────────────────── */

test("page phase: legacy follows the hub gate, V2 follows the contract phase", () => {
  assert.equal(buyPagePhase({ v2Enabled: false, v2Phase: null, legacyOpen: false }), "upcoming");
  assert.equal(buyPagePhase({ v2Enabled: false, v2Phase: V2_PHASES.Open, legacyOpen: true }), "open");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: null, legacyOpen: true }), "upcoming");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: V2_PHASES.NotOpen, legacyOpen: false }), "upcoming");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: V2_PHASES.Whitelist, legacyOpen: false }), "open");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: V2_PHASES.Open, legacyOpen: false }), "open");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: V2_PHASES.Expired, legacyOpen: false }), "ended");
  assert.equal(buyPagePhase({ v2Enabled: true, v2Phase: V2_PHASES.Graduated, legacyOpen: false }), "ended");
});

test("countdown counts whole days, hours and minutes and stops at the target", () => {
  const target = Date.UTC(2026, 11, 1);
  assert.deepEqual(countdownTo(target, Date.UTC(2026, 9, 28, 12, 0, 0)), { days: 33, hours: 12, minutes: 0, done: false });
  assert.deepEqual(countdownTo(target, target - 90_000), { days: 0, hours: 0, minutes: 2, done: false });
  assert.deepEqual(countdownTo(target, target - 1), { days: 0, hours: 0, minutes: 1, done: false });
  assert.equal(countdownTo(target, target).done, true);
  assert.equal(countdownTo(target, target + 1).done, true);
  assert.equal(countdownTo(Number.NaN, 0).done, true);
});

test("'you are here' sits at the start before opening and only on live readings afterwards", () => {
  assert.equal(curvePosition({ phase: "upcoming", liveSoldPpl: null }), 0);
  assert.equal(curvePosition({ phase: "open", liveSoldPpl: null }), null);
  assert.equal(curvePosition({ phase: "whitelist", liveSoldPpl: 1_234_567 }), 1_234_567);
  assert.equal(curvePosition({ phase: "open", liveSoldPpl: -5 }), 0);
  assert.equal(curvePosition({ phase: "open", liveSoldPpl: 1e12 }), CURVE.supplyPpl);
});

test("the live position is recovered from the contract spot price", () => {
  for (const sold of [0, 1_000_000, 40_000_000, 88_000_000]) {
    const back = soldPplForSpotPrice(spotPriceUsd(sold));
    assert.ok(Math.abs(back - sold) < 1, `${sold} → ${back}`);
  }
  assert.equal(soldPplForSpotPrice(0), null);
  assert.equal(soldPplForSpotPrice(Number.NaN), null);
});

test("the opening date reads naturally inside the hero sentence in every language", () => {
  const date = new Date(Date.UTC(2026, 11, 1));
  assert.equal(formatOpenDate(date, "en"), "December 1, 2026");
  assert.equal(fillCopy(buy.ru.hero.subUpcoming, { date: formatOpenDate(date, "ru") }), "Продажа PPL открывается 1 декабря 2026 г.");
  for (const lang of LANGS) {
    const sentence = fillCopy(buy[lang].hero.subUpcoming, { date: formatOpenDate(date, lang) });
    assert.doesNotMatch(sentence, /\.\./, `${lang}: ${sentence}`);
    assert.match(sentence, /2026/, lang);
  }
});

test("the fee line shows cents, not a rounded $0", () => {
  assert.equal(usdCents(0.01, "en"), "$0.01");
  assert.equal(usdCents(0.01, "ru"), "$0,01");
  assert.match(read("src/components/buy/v2/BuyV2Panel.tsx"), /fees: usdCents\(0\.01, lang\)/);
});

/* ── Preview-only example trades ───────────────────────────────────────── */

test("example trades: only with ?demo=1 on a non-production deployment, fail closed otherwise", () => {
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "preview" }, "1"), true);
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "development" }, "1"), true);
  assert.equal(tradeDemoAllowed({ NEXT_PUBLIC_VERCEL_ENV: "preview" }, "1"), true);
  assert.equal(tradeDemoAllowed({ NODE_ENV: "development" }, "1"), true);
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "preview" }, ["1", "0"]), true);

  // Production is refused whichever variable says so.
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "production" }, "1"), false);
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "Production " }, "1"), false);
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "preview", NEXT_PUBLIC_VERCEL_ENV: "production" }, "1"), false);
  assert.equal(tradeDemoAllowed({ VERCEL_ENV: "production", NODE_ENV: "development" }, "1"), false);
  // An unknown environment (e.g. `next start` off Vercel) is not assumed to be a preview.
  assert.equal(tradeDemoAllowed({}, "1"), false);
  assert.equal(tradeDemoAllowed({ NODE_ENV: "production" }, "1"), false);
  // The parameter must be exactly 1.
  for (const param of [undefined, null, "", "0", "true", "yes", "11"]) {
    assert.equal(tradeDemoAllowed({ VERCEL_ENV: "preview" }, param), false, String(param));
  }
});

test("example trades are deterministic, priced on the real curve and carry no transaction link", () => {
  const a = demoTrades();
  assert.deepEqual(a, demoTrades());
  assert.equal(a.length, 6);
  assert.ok(a.some((trade) => trade.kind === "buy") && a.some((trade) => trade.kind === "sell"));
  for (const trade of a) {
    assert.equal(trade.explorerUrl, "", "no explorer link for a trade that never happened");
    assert.match(trade.id, /^demo-/);
    assert.ok(trade.usd >= V2_SALE.minPerBuyUsd && trade.usd <= V2_SALE.maxPerBuyUsd, `${trade.usd}`);
    assert.ok(trade.ppl > 0);
    // Early on the curve the average price is close to the start price.
    const avg = trade.usd / trade.ppl;
    assert.ok(avg >= CURVE.startPriceUsd * 0.99 && avg < CURVE.startPriceUsd * 1.05, `${avg}`);
  }
  const times = a.map((trade) => Date.parse(trade.at));
  assert.deepEqual(times, [...times].sort((x, y) => y - x), "newest first");
});

test("example trades are built on the server only, behind the gate, and labelled in the feed", () => {
  const page = read("src/app/buy/page.tsx");
  assert.match(page, /tradeDemoAllowed\(process\.env, params\.demo\) \? demoTrades\(\) : null/);
  for (const file of ["src/components/buy/BuyPage.tsx", "src/components/buy/TradeFeed.tsx"]) {
    assert.doesNotMatch(read(file), /demoTrades\(/, `${file} must not build example data`);
  }
  const feed = read("src/components/buy/TradeFeed.tsx");
  assert.match(feed, /trades\.length === 0 && examples !== null/, "examples never mix with real trades");
  assert.match(feed, /data-testid="trade-example-badge"/);
  assert.match(feed, /t\.exampleNote/);
  for (const lang of LANGS) {
    assert.ok(buy[lang].feed.example && buy[lang].feed.exampleNote, lang);
  }
  assert.equal(buy.ru.feed.example, "Пример");
  assert.equal(buy.ru.feed.empty, "Сделок пока нет.");
});

/* ── Numbers: the site constants match PplCurveHubV2 one-to-one ───────── */

function contractConstants() {
  const sol = readFileSync(join(root, "../contracts/src/sale/PplCurveHubV2.sol"), "utf8");
  const out = {};
  for (const m of sol.matchAll(/uint256 public constant (\w+) = ([^;]+);/g)) {
    const raw = m[2].replace(/_/g, "").trim();
    const days = /^(\d+) days$/.exec(raw);
    const sci = /^(\d+)e(\d+)$/.exec(raw);
    out[m[1]] = days ? Number(days[1]) * 86_400 : sci ? Number(sci[1]) * 10 ** Number(sci[2]) : Number(raw);
  }
  return out;
}

test("every number /buy states matches the V2 contract constants", () => {
  const c = contractConstants();
  assert.equal(c.SUPPLY_PPL / 1e18, CURVE.supplyPpl);
  assert.equal(c.RAISE_CAP_USD6 / 1e6, CURVE.graduationRaiseUsd);
  assert.equal(c.MIN_BUY_USD6 / 1e6, V2_SALE.minPerBuyUsd);
  assert.equal(c.MAX_BUY_USD6 / 1e6, V2_SALE.maxPerBuyUsd);
  assert.equal(c.BUY_CAP_DAY_USD6 / 1e6, V2_SALE.maxPerDayUsd);
  assert.equal(c.BUY_COOLDOWN, V2_SALE.cooldownSeconds);
  assert.equal(c.BUY_COOLDOWN, SALE.cooldownSeconds);
  assert.equal(c.TERM / 86_400, 730, "24 months");
  assert.equal(SALE.saleTermMonths, 24);
  assert.equal(c.WHITELIST_PERIOD / 86_400, V2_SALE.whitelistDays);
  assert.equal(c.RESERVE_BPS / 100, V2_SALE.reserveSharePct);
  assert.equal(c.HOLD / 86_400, V2_SALE.holdDays);
  assert.equal(c.HOLD / 86_400, SELL_BACK.holdDays);
  assert.equal(c.SELL_GLOBAL_CAP_BPS / 100, SELL_BACK.dailyCapReservePct);
  assert.equal(c.SELL_CAP_DAY_USD6 / 1e6, SELL_BACK.perPersonPerDayUsd);
  assert.equal(c.FEE_LOW_BPS / 100, SELL_BACK.feePct);
  assert.equal(c.FEE_HIGH_BPS / 100, SELL_BACK.feeHighPct);
  assert.equal(c.FEE_HIGH_THRESHOLD_BPS / 100, SELL_BACK.feeHighThresholdReservePct);
  assert.equal(c.LIQUIDITY_RELEASE_DELAY / 86_400, V2_SALE.releaseNoticeDays);
  assert.equal(CURVE.startPriceUsd, 0.005);

  const vars = buyCopyVars("en");
  assert.equal(vars.reservePct, "50%");
  assert.equal(vars.treasuryPct, "50%");
  assert.equal(vars.whitelistDays, 7);
  assert.equal(vars.holdDays, 30);
  assert.equal(vars.min, "$10");
  assert.equal(vars.max, "$500");
  assert.equal(vars.perDay, "$2,000");
  assert.equal(vars.sellPerAddress, "$2,000");
  assert.equal(vars.feeLow, "1.5%");
  assert.equal(vars.feeHigh, "3%");
  assert.equal(vars.graduation, "$4M");
  assert.equal(vars.term, "24 months");
  assert.equal(`${vars.signersM} of ${vars.signersN}`, "2 of 3", "SPEC D1: Safe 2-of-3");
});

test("every placeholder the new blocks use is resolved", () => {
  const vars = buyCopyVars("en");
  const known = new Set([...Object.keys(vars), "date", "price", "amount", "links", "start", "end"]);
  for (const lang of LANGS) {
    for (const section of ["hero", "before", "ppl", "how", "rules", "faq", "finalCta"]) {
      for (const text of strings(buy[lang][section])) {
        for (const [, key] of text.matchAll(/\{(\w+)\}/g)) {
          assert.ok(known.has(key), `${lang}.${section}: unknown {${key}}`);
        }
      }
    }
  }
});

/* ── Copy rules from the brief ─────────────────────────────────────────── */

test("brief strings are exact in Russian", () => {
  const ru = buy.ru;
  assert.equal(ru.hero.headline, "Блокчейн для всех. Наконец.");
  assert.equal(ru.hero.lead, "Раньше нужно было быть технарём. Теперь достаточно быть человеком.");
  assert.equal(ru.hero.subUpcoming, "Продажа PPL открывается {date}.");
  assert.equal(ru.hero.ctaVerify, "Пройти верификацию, чтобы купить PPL");
  assert.equal(ru.hero.ctaBuy, "Купить PPL");
  assert.equal(ru.finalCta.bounty, "или заработайте PPL заданиями");
  assert.match(ru.ppl.lines[2], /^PEOPLE не назначает и не поднимает цену/);
});

test("PEOPLE is the community: no 'the PEOPLE team' wording in any language", () => {
  const team = [
    /PEOPLE team/i,
    /team PEOPLE/i,
    /Команда PEOPLE/i,
    /équipe PEOPLE/i,
    /equipo de PEOPLE/i,
    /equipe (da |do )?PEOPLE/i,
    /PEOPLE-Team/i,
    /team di PEOPLE/i,
    /PEOPLE ekibi/i,
    /Đội ngũ PEOPLE/i,
    /Tim PEOPLE/i,
    /PEOPLE ?团队/,
    /فريق PEOPLE/,
  ];
  for (const lang of LANGS) {
    const blob = JSON.stringify(buy[lang]);
    for (const pattern of team) assert.doesNotMatch(blob, pattern, `${lang}: ${pattern}`);
  }
});

test("non-Russian locales carry no Russian, and no locale names Georgia", () => {
  const georgia = /Georgia|Грузи|Géorgie|Georgien|Gürcistan|Gruzia|格鲁吉亚|جورجيا/i;
  for (const lang of LANGS) {
    const blob = JSON.stringify(buy[lang]);
    if (lang !== "ru") assert.doesNotMatch(blob, /[А-Яа-яЁё]/, `${lang}: Cyrillic`);
    assert.doesNotMatch(blob, georgia, `${lang}: Georgia`);
  }
});

test("outdated claims are gone: 180 days, sell back any time, the $0.25 cap, all money in reserve", () => {
  for (const lang of LANGS) {
    const blob = JSON.stringify(buy[lang]);
    assert.doesNotMatch(blob, /180/, lang);
    assert.doesNotMatch(blob, /0[.,]25\b/, `${lang}: $0.25 cap`);
    assert.doesNotMatch(blob, /any time|anytime|в любой момент/i, lang);
  }
  assert.doesNotMatch(JSON.stringify(buy.en), /purchase money stays in the sale reserve|all (the )?money/i);
  assert.doesNotMatch(JSON.stringify(buy.en), /any 24 hours/i, "Q5: per UTC day");
});

test("red lines: no profit promises, no 'x' multiples, no early-BTC comparisons, no urgency", () => {
  const banned = [
    /passive income/i,
    /guaranteed (profit|return|yield|income)/i,
    /\b\d+\s?x\b/i,
    /to the moon/i,
    /get rich/i,
    /early (bitcoin|ethereum|BTC|ETH)/i,
    /don['’]t miss|last chance|hurry|only \d+ left/i,
    /пассивн\w* доход/i,
    /гарантированн\w* (доход|прибыл)/i,
    /иксы/i,
    /успей|последний шанс/i,
  ];
  for (const lang of ["en", "ru"]) {
    for (const text of strings(buy[lang])) {
      for (const pattern of banned) assert.doesNotMatch(text, pattern, `${lang}: ${text}`);
    }
  }
  // "Investment" only ever appears in the small print, as a denial.
  for (const [lang, word] of [["en", /invest/i], ["ru", /инвест/i]]) {
    const { footnote, ...rest } = buy[lang];
    assert.doesNotMatch(JSON.stringify(rest), word, `${lang}: investment wording outside the small print`);
    assert.match(JSON.stringify(footnote), word, `${lang}: the small print says PPL is not an investment`);
  }
  // PPL is never called a share in a company.
  assert.doesNotMatch(JSON.stringify({ ...buy.en, footnote: null }), /share in (a|the) company/i);
  assert.match(buy.en.faq.riskBody, /lose value/);
  assert.match(buy.en.faq.riskBody, /afford to risk/);
  assert.match(buy.en.faq.riskBody, /laws of your country/);
});

test("jargon stays off the main lines: curve formula, TWAP and treasury only inside details", () => {
  const surface = (b) => [
    b.hero.headline,
    b.hero.lead,
    ...b.before.rows.flatMap((row) => [row.before, row.after]),
    ...b.ppl.lines,
    ...b.how.steps.flatMap((step) => [step.title, step.body]),
    ...b.rules.items.flatMap((item) => [item.title, item.body]),
  ];
  const visible = (text) => text.replace(/\{\w+\}/g, "");
  for (const text of surface(buy.en)) {
    assert.doesNotMatch(visible(text), /bonding curve|TWAP|treasury|multisig|graduat/i, text);
  }
  for (const text of surface(buy.ru)) {
    assert.doesNotMatch(visible(text), /bonding curve|TWAP|казн|мультисиг|graduation/i, text);
  }
  assert.match(buy.en.ppl.details, /bonding curve/);
  assert.ok(buy.en.rules.details.some((line) => /Treasury/.test(line)));
});

test("the page has one main button per screen: hero and final call to action only", () => {
  const page = read("src/components/buy/BuyPage.tsx");
  assert.equal(page.match(/<BuyCta /g)?.length, 1, "final CTA (the hero renders its own)");
  assert.doesNotMatch(page, /StickyBuyBar/);
  const hero = read("src/components/buy/BuyHero.tsx");
  assert.equal(hero.match(/<BuyCta /g)?.length, 1);
  assert.match(hero, /href="\/founders#verify"/);
  assert.doesNotMatch(page, /href="\/bounty"/);
});
