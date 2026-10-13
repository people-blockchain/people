#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surfaces = join(root, "src/lib/locales/surfaces");

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
