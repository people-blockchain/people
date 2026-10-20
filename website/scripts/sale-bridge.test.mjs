#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ChainId } from "@lifi/types";
import { isAddress } from "viem";

import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  BASE_USDT_ADDRESS,
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
  LIFI_BRIDGE_DOCS_URL,
  LIFI_FEATURED_SOURCE_TOKENS,
  hubPaymentToken,
} from "../src/lib/sale/bridge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUY_LIFI_BRIDGE_SRC = readFileSync(
  join(root, "src/components/buy/BuyLifiBridge.tsx"),
  "utf8",
);
const BUY_FORM_SRC = readFileSync(join(root, "src/components/buy/BuyForm.tsx"), "utf8");

test("bridge destination is Base USDC", () => {
  assert.equal(BASE_CHAIN_ID, ChainId.BAS);
  assert.equal(BASE_USDC_ADDRESS, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
});

test("Base USDT address matches LI.FI verified token", () => {
  assert.equal(BASE_USDT_ADDRESS, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
});

test("hubPaymentToken always returns Base USDC", () => {
  assert.equal(hubPaymentToken("USDT"), BASE_USDC_ADDRESS);
  assert.equal(hubPaymentToken("USDC"), BASE_USDC_ADDRESS);
});

test("featured EVM token addresses are strict checksummed", () => {
  for (const token of LIFI_FEATURED_SOURCE_TOKENS) {
    if (token.chainId === ChainId.SOL) continue;
    assert.ok(isAddress(token.address, { strict: true }), `${token.symbol} on ${token.chainId}`);
  }
  assert.ok(isAddress(BASE_USDC_ADDRESS, { strict: true }));
  assert.ok(isAddress(BASE_USDT_ADDRESS, { strict: true }));
});

test("BuyLifiBridge locks toChain, toToken and toAddress from config", () => {
  assert.match(BUY_LIFI_BRIDGE_SRC, /toChain: BASE_CHAIN_ID/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toToken: BASE_USDC_ADDRESS/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toAddress:\s*\{/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /address: recipient/);
});

test("bridge source chains include Solana, exclude Tron, Avalanche and Base-only list", () => {
  assert.ok(LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.SOL));
  assert.ok(!LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.TRN));
  assert.ok(!LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.AVA));
  assert.ok(!LIFI_BRIDGE_SOURCE_CHAIN_IDS.some((id) => id === 8453));
});

test("BuyLifiBridge does not bundle Tron provider", () => {
  assert.doesNotMatch(BUY_LIFI_BRIDGE_SRC, /widget-provider-tron/);
  assert.doesNotMatch(BUY_LIFI_BRIDGE_SRC, /TronProvider/);
});

test("BuyForm uses network selector and single buy CTA", () => {
  assert.match(BUY_FORM_SRC, /buy-network-select/);
  assert.match(BUY_FORM_SRC, /data-testid="buy-cta"/);
  assert.match(BUY_FORM_SRC, /closedTitle/);
  assert.doesNotMatch(BUY_FORM_SRC, /pay-mode-bridge/);
});

test("locale-prefixed /buy redirects to /buy", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /\$\{locale\}\/buy/);
  assert.match(config, /destination: "\/buy"/);
});

test("bridge docs URL is documented for operators", () => {
  assert.match(LIFI_BRIDGE_DOCS_URL, /docs\.li\.fi/);
});
