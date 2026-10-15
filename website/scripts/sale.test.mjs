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
    assert.ok(Array.isArray(doc.saleCurveBullets) && doc.saleCurveBullets.length === 4, file);
    assert.match(doc.curveLead ?? "", /0[,.]005/, file);
    assert.match(doc.curveLead ?? "", /4\s?M|4[,.]000[,.]000|\$?400\s*万/, file);
  }
});

test("tokenomics surfaces list all sale networks without Cosmos", () => {
  const required = ["BNB Chain", "Base", "Ethereum", "Polygon", "Tron", "TON", "Solana"];
  for (const file of readdirSync(surfaces).filter((f) => f.startsWith("tokenomics-") && f.endsWith(".json"))) {
    const doc = JSON.parse(readFileSync(join(surfaces, file), "utf8"));
    const name = doc.contractRows?.[0]?.name ?? "";
    for (const net of required) {
      assert.match(name, new RegExp(net.replace(".", "\\.")), `${file} missing ${net}`);
    }
    assert.doesNotMatch(name, /Cosmos/i, file);
    assert.doesNotMatch(doc.salePayBody ?? "", /Cosmos/i, file);
  }
});

test("sale surfaces list all networks in 12 languages", () => {
  const langs = ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"];
  for (const lang of langs) {
    const doc = JSON.parse(readFileSync(join(surfaces, `sale-${lang}.json`), "utf8"));
    assert.match(doc.networksList, /Polygon/);
    assert.match(doc.networksList, /Solana/);
    assert.doesNotMatch(doc.networksList, /Cosmos/i);
    assert.match(doc.contractsRow, /Tron/);
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

// Round 2b: every explorer URL on /buy must point at the People network
// explorer this site ships, never at a third-party block explorer.
test("/buy explorer links are built from PEOPLE_EXPLORER, with no third-party explorer", () => {
  const config = readFileSync(join(root, "src/lib/sale/config.ts"), "utf8");
  assert.match(config, /PEOPLE_EXPLORER = \{\s*(?:\/\*\*[\s\S]*?\*\/\s*)?base: "\/explorer"/);
  for (const fn of ["explorerAddressUrl", "explorerContractUrl", "explorerTxUrl"]) {
    assert.match(config, new RegExp(`export function ${fn}\\([\\s\\S]*?PEOPLE_EXPLORER\\.base`), fn);
  }
  for (const file of ["src/lib/sale/config.ts", "src/lib/sale/adapter.ts", "src/components/buy/SaleTransparency.tsx", "src/components/buy/TradeFeed.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /basescan|etherscan|bscscan|solscan|tronscan/i, file);
  }
});

test("/buy page sets dir=rtl for Arabic", () => {
  const page = readFileSync(join(root, "src/components/buy/BuyPage.tsx"), "utf8");
  assert.match(page, /data-testid="buy-page"/);
  assert.match(page, /dir=\{isRtl \? "rtl" : "ltr"\}/);
});

test("/buy audit copy names exactly the three models in AI_AUDITS", () => {
  const config = readFileSync(join(root, "src/lib/sale/config.ts"), "utf8");
  const models = [...config.matchAll(/\{ id: "\w+", model: "([^"]+)" \}/g)].map(([, model]) => model);
  assert.deepEqual(models, ["Claude Opus 5.5", "GPT Astra", "Fable 5.1"]);

  const expected = {
    en: "Audited by: Claude Opus 5.5, GPT Astra, Fable 5.1",
    ru: "Аудит: Claude Opus 5.5, GPT Astra, Fable 5.1",
  };
  for (const lang of ["en", "ru"]) {
    const copy = JSON.parse(readFileSync(join(surfaces, `buy-${lang}.json`), "utf8")).transparency;
    assert.equal(copy.auditLine, expected[lang], `buy-${lang}`);
    assert.ok(copy.auditBounty, `buy-${lang}: bug bounty mention`);
    assert.doesNotMatch(JSON.stringify(copy), /Sonnet|Opus 5[^.]|independent AI audit|независимых AI-аудита/i, `buy-${lang}`);
  }
});
