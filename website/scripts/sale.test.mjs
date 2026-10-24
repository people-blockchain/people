#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");

test("litepaper markdown does not hide public sale (all locales)", () => {
  const banned = [
    /no public PPL sale/i,
    /payment widget is switched off/i,
    /not open yet; it will only open once an operating legal entity/i,
    /юрлица-оператора/i,
    /entidad jurídica operadora/i,
    /entité juridique opératrice/i,
    /badan hukum yang beroperasi/i,
    /entità giuridica operativa/i,
    /tüzel kişilik/i,
    /thực thể pháp lý/i,
    /运营法人实体/i,
    /كيان قانوني مشغّل/i,
  ];
  const mdDir = join(root, "src/content/litepaper");
  for (const file of readdirSync(mdDir).filter((f) => f.endsWith(".md"))) {
    const raw = readFileSync(join(mdDir, file), "utf8");
    for (const re of banned) {
      assert.doesNotMatch(raw, re, file);
    }
    assert.match(raw, /0\.005|0,005/, `${file} should mention $0.005 start`);
  }
});

test("tokenomics surfaces publish public sale copy (no P0-10 saleClosed gate)", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("tokenomics-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    assert.equal(doc.saleClosedTitle, undefined, file);
    assert.equal(doc.saleClosedBody, undefined, file);
    assert.ok(doc.salePublicTitle, file);
    assert.ok(Array.isArray(doc.saleCurveBullets) && doc.saleCurveBullets.length === 5, file);
    assert.match(doc.curveLead ?? "", /0[,.]005/, file);
    assert.match(doc.curveLead ?? "", /4\s?M|4[,.]000[,.]000|\$?400\s*万/, file);
  }
});

test("tokenomics surfaces: sale is on Base only; pay-from list has Tron and Solana, TON only as unsupported", () => {
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("tokenomics-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    const name = doc.contractRows?.[0]?.name ?? "";
    assert.match(name, /PplCurveHub/, file);
    assert.match(name, /Base/, file);
    assert.doesNotMatch(name, /BNB|Polygon|Tron|Cosmos/i, file);
    for (const word of ["Tron", "Solana", "TON", "EVM"]) assert.match(doc.salePayBody ?? "", new RegExp(word), `${file} ${word}`);
    assert.doesNotMatch(doc.unsoldBody ?? "", /180/, file);
    assert.match(doc.unsoldBody ?? "", /Community Pool/, file);
  }
});

test("buy surfaces say EVM, Tron and Solana work and TON does not (12 languages)", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  for (const lang of langs) {
    const doc = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8"));
    assert.match(doc.form.payFromNetworks, /Solana/, lang);
    assert.match(doc.form.payFromNetworks, /Tron/, lang);
    assert.match(doc.form.payFromNetworks, /\bTON\b/, `${lang}: TON stated as unsupported`);
    assert.match(doc.form.payOnBase, /Base/);
  }
});

test("polygon deployment template leaves saleContract empty", () => {
  const json = JSON.parse(readFileSync(join(root, "../contracts/deployments/ppl-sale-mainnet.json"), "utf8"));
  assert.equal(json.chains["137"].saleContract, "");
  assert.match(json.chains["137"].usdt.address, /^0x/);
  assert.equal(json.chains["137"].usdt.decimals, 6);
});

test("ppl-sale-evm.json includes Polygon with stable addresses", () => {
  const json = JSON.parse(readFileSync(join(root, "src/data/ppl-sale-evm.json"), "utf8"));
  assert.equal(json.chains["137"].saleContract, "");
  assert.ok(json.chains["137"].usdt.address);
  assert.ok(json.chains["137"].usdc.address);
});

test("Base sale hub accepts USDC only; Base USDT address is LI.FI verified", () => {
  const hubSrc = readFileSync(join(root, "src/lib/sale/sale-hub.ts"), "utf8");
  assert.match(hubSrc, /stables:\s*\["usdc"\]/);
  const json = JSON.parse(readFileSync(join(root, "src/data/ppl-sale-evm.json"), "utf8"));
  assert.equal(json.chains["8453"].usdt.address, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
  assert.equal(json.chains["8453"].usdt.decimals, 6);
});

// M05-6: BSC stablecoins (BSC-USD, USDC) report 18 decimals, not 6 like Ethereum/Polygon.
test("ppl-sale-evm.json records 18 decimals for BNB Chain stablecoins", () => {
  const json = JSON.parse(readFileSync(join(root, "src/data/ppl-sale-evm.json"), "utf8"));
  assert.equal(json.chains["56"].usdt.decimals, 18);
  assert.equal(json.chains["56"].usdc.decimals, 18);
  assert.equal(json.chains["1"].usdt.decimals, 6);
});

test("PeopleCommunitySale.sol is present", () => {
  const sol = readFileSync(join(root, "../contracts/src/sale/PeopleCommunitySale.sol"), "utf8");
  assert.match(sol, /contract PeopleCommunitySale/);
  assert.match(sol, /SUPPLY_PPL = 100_000_000/);
});

// M05-4: the unique index on paymentTxId must be case-insensitive, or the same on-chain
// tx submitted with a different hex letter case confirms a second order.
test("sale order tx index compares paymentTxId case-insensitively", () => {
  const sql = readFileSync(join(root, "drizzle/0012_sale_tx_idx_lower.sql"), "utf8");
  assert.match(sql, /DROP INDEX IF EXISTS "ppl_sale_payment_tx_idx"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "ppl_sale_payment_tx_lower_idx".*lower\("paymentTxId"\)/);
});

// Contract and transaction links on /buy go to Basescan (external, new tab).
test("/buy explorer links point at Basescan", () => {
  const config = readFileSync(join(root, "src/lib/sale/config.ts"), "utf8");
  assert.match(config, /BASESCAN = "https:\/\/basescan\.org"/);
  for (const fn of ["basescanAddressUrl", "basescanTxUrl"]) assert.match(config, new RegExp(fn));
  const transparency = readFileSync(join(root, "src/components/buy/SaleTransparency.tsx"), "utf8");
  assert.match(transparency, /target="_blank"/);
  assert.match(transparency, /rel="noopener noreferrer"/);
  assert.doesNotMatch(transparency, /next\/link/);
  for (const file of ["src/lib/sale/config.ts", "src/lib/sale/adapter.ts", "src/components/buy/TradeFeed.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /etherscan|bscscan|solscan|tronscan/i, file);
  }
});

test("/buy page sets dir=rtl for Arabic", () => {
  const page = readFileSync(join(root, "src/components/buy/BuyPage.tsx"), "utf8");
  assert.match(page, /data-testid="buy-page"/);
  assert.match(page, /dir=\{isRtl \? "rtl" : "ltr"\}/);
});

test("/buy stats panel shows only status/price and the sale window", () => {
  const panel = readFileSync(join(root, "src/components/buy/SaleStatsPanel.tsx"), "utf8");
  assert.doesNotMatch(panel, /key: "raised"/);
  assert.doesNotMatch(panel, /role="progressbar"/);
  assert.doesNotMatch(panel, /graduationProgress/);
  assert.match(panel, /key: "price"/);
  assert.match(panel, /key: "window"/);
  assert.doesNotMatch(panel, /key: "sold"/);
  assert.doesNotMatch(panel, /key: "buyers"/);
});

test("/buy why-price block leads with no manual pricing (12 languages)", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  for (const lang of langs) {
    const doc = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8"));
    assert.ok(doc.whyPriceRises?.noManualLead, lang);
    assert.match(doc.whyPriceRises.noManualLead, /PEOPLE/, `${lang}: brand caps`);
    assert.doesNotMatch(doc.whyPriceRises.mechanism, /Uniswap|Bancor|pump\.fun|Virtuals/i, `${lang}: no third-party brands`);
    assert.ok(doc.whyPriceRises.plain.length >= 7, `${lang}: plain-words list`);
    assert.ok(doc.whyPriceRises.chartAxisSold, lang);
    assert.match(doc.form.sellBackTerms, /30/, `${lang}: sell-back hold`);
    assert.doesNotMatch(doc.form.sellBackTerms, /any time|в любой момент|à tout moment|jederzeit|en cualquier momento/i, `${lang}: no anytime sell-back`);
  }
  const page = readFileSync(join(root, "src/components/buy/BuyPage.tsx"), "utf8");
  assert.match(page, /BuyWhyPriceRises/);
});

test("/buy non-EN locales use plain language (no raw sale jargon)", () => {
  const nonEn = ["ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  for (const lang of nonEn) {
    const doc = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8"));
    const blob = JSON.stringify(doc);
    assert.doesNotMatch(doc.whyPriceRises.mechanism, /price = f\(tokens/i, lang);
    assert.doesNotMatch(blob, /sell-back/i, lang);
    assert.match(doc.whyPriceRises.plain[0], /bonding curve/i, `${lang}: bonding curve gloss`);
  }
  const ru = JSON.parse(readFileSync(join(surfaces, "buy-ru.json"), "utf8"));
  assert.match(ru.form.sellBackTerms, /Продажа обратно в резерв/);
  assert.doesNotMatch(JSON.stringify(ru), /холд/i);
});

test("/buy UI omits dev-facing stats and form disclaimers", () => {
  const stats = readFileSync(join(root, "src/components/buy/SaleStatsPanel.tsx"), "utf8");
  assert.doesNotMatch(stats, /statsNote/);
  const form = readFileSync(join(root, "src/components/buy/BuyForm.tsx"), "utf8");
  assert.doesNotMatch(form, /disabledNote/);
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8"));
  assert.equal(en.hero.statsNote, "");
  assert.equal(en.form.disabledNote, undefined);
});

test("/buy AI review copy names exactly the three models and never says audit", () => {
  const expected = ["Claude Opus 5.5", "GPT Astra", "Fable 5.1"];
  const en = JSON.parse(readFileSync(join(surfaces, "buy-en.json"), "utf8")).transparency;
  for (const model of expected) assert.match(en.auditLine, new RegExp(model.replace(".", "\\.")));
  assert.match(en.auditLine, /not a security audit/);
  for (const lang of ["en", "ru"]) {
    const copy = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8")).transparency;
    assert.ok(copy.auditBounty, `buy-${lang}: bug bounty mention`);
    assert.doesNotMatch(JSON.stringify(copy), /Sonnet|independent AI audit|независимых AI-аудита/i, `buy-${lang}`);
  }
});
