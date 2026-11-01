#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ChainId } from "@lifi/types";

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

// Canonical USDT/USDC contracts per source chain (issuer / Uniswap default token list).
// A wrong or truncated address in the featured list shows a token the widget cannot route.
const CANONICAL_FEATURED = {
  [`${ChainId.ETH}:USDT`]: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  [`${ChainId.ETH}:USDC`]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [`${ChainId.BSC}:USDT`]: "0x55d398326f99059fF775485246999027B3197955",
  [`${ChainId.BSC}:USDC`]: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  [`${ChainId.POL}:USDT`]: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  [`${ChainId.POL}:USDC`]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [`${ChainId.ARB}:USDT0`]: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  [`${ChainId.ARB}:USDC`]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [`${ChainId.OPT}:USDT`]: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  [`${ChainId.OPT}:USDC`]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [`${ChainId.AVA}:USDT`]: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
  [`${ChainId.AVA}:USDC`]: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
};

test("featured EVM source tokens use the canonical contract addresses", () => {
  const evm = LIFI_FEATURED_SOURCE_TOKENS.filter((t) => t.address.startsWith("0x"));
  assert.equal(evm.length, Object.keys(CANONICAL_FEATURED).length);
  for (const token of evm) {
    assert.match(token.address, /^0x[0-9a-fA-F]{40}$/, `${token.chainId} ${token.symbol}`);
    assert.equal(token.address, CANONICAL_FEATURED[`${token.chainId}:${token.symbol}`], `${token.chainId} ${token.symbol}`);
  }
});

test("Base USDT address matches LI.FI verified token", () => {
  assert.equal(BASE_USDT_ADDRESS, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
});

test("hubPaymentToken always returns Base USDC", () => {
  assert.equal(hubPaymentToken("USDT"), BASE_USDC_ADDRESS);
  assert.equal(hubPaymentToken("USDC"), BASE_USDC_ADDRESS);
});

test("BuyLifiBridge locks toChain, toToken and toAddress from config", () => {
  assert.match(BUY_LIFI_BRIDGE_SRC, /toChain: BASE_CHAIN_ID/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toToken: BASE_USDC_ADDRESS/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toAddress:\s*\{/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /address: recipient/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /hiddenUI:\s*\{[^}]*toAddress: true/);
  assert.doesNotMatch(BUY_LIFI_BRIDGE_SRC, /toToken: BASE_USDT_ADDRESS/);
});

test("bridge source chains include Solana and Tron, exclude Base and TON", () => {
  assert.ok(LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.SOL));
  assert.ok(LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.TRN));
  assert.ok(!LIFI_BRIDGE_SOURCE_CHAIN_IDS.some((id) => id === 8453));
});

test("BuyLifiBridge bundles the Tron provider and never TON", () => {
  assert.match(BUY_LIFI_BRIDGE_SRC, /widget-provider-tron/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /TronProvider\(\)/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /ChainType\.TVM/);
  assert.doesNotMatch(BUY_LIFI_BRIDGE_SRC, /ton connect|tonkeeper|ChainId\.TON/i);
});

test("BuyForm uses LI.FI widget and USDT swap panel", () => {
  assert.doesNotMatch(BUY_FORM_SRC, /BUY_NETWORKS/);
  assert.match(BUY_FORM_SRC, /BuyLifiBridge/);
  assert.match(BUY_FORM_SRC, /pay-mode-\$\{mode\}/);
  assert.match(BUY_FORM_SRC, /buy-usdt-swap-panel/);
  assert.match(BUY_FORM_SRC, /hubPaymentToken/);
});

test("locale-prefixed /buy redirects to /buy in the proxy (it must set the language cookie)", () => {
  const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
  assert.match(proxy, /localeFromBuyPath\(pathname\)/);
  assert.match(proxy, /pathname = "\/buy"/);
  assert.match(proxy, /\/\(en\|ru\|es\|pt\|fr\|de\|it\|tr\|vi\|id\|zh\|ar\)\/buy/);
});

test("bridge docs URL is documented for operators", () => {
  assert.match(LIFI_BRIDGE_DOCS_URL, /docs\.li\.fi/);
});
