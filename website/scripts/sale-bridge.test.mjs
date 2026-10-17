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
  LIFI_BRIDGE_SOURCE_CHAIN_IDS,
  LIFI_BRIDGE_DOCS_URL,
} from "../src/lib/sale/bridge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUY_LIFI_BRIDGE_SRC = readFileSync(
  join(root, "src/components/buy/BuyLifiBridge.tsx"),
  "utf8",
);

test("bridge destination is Base USDC", () => {
  assert.equal(BASE_CHAIN_ID, ChainId.BAS);
  assert.equal(BASE_USDC_ADDRESS, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
});

test("BuyLifiBridge locks toChain, toToken and toAddress from config", () => {
  assert.match(BUY_LIFI_BRIDGE_SRC, /toChain: BASE_CHAIN_ID/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toToken: BASE_USDC_ADDRESS/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /toAddress:\s*\{/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /address: recipient/);
  assert.match(BUY_LIFI_BRIDGE_SRC, /hiddenUI:\s*\{[^}]*toAddress: true/);
});

test("bridge source chains include Solana and Tron but not TON", () => {
  assert.ok(LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.SOL));
  assert.ok(LIFI_BRIDGE_SOURCE_CHAIN_IDS.includes(ChainId.TRN));
  assert.ok(!LIFI_BRIDGE_SOURCE_CHAIN_IDS.some((id) => id === 8453));
});

test("BuyForm uses LI.FI widget and drops BUY_NETWORKS picker", () => {
  const form = readFileSync(join(root, "src/components/buy/BuyForm.tsx"), "utf8");
  assert.doesNotMatch(form, /BUY_NETWORKS/);
  assert.match(form, /BuyLifiBridge/);
  assert.match(form, /pay-mode-bridge/);
});

test("locale-prefixed /buy redirects to /buy", () => {
  const config = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(config, /\$\{locale\}\/buy/);
  assert.match(config, /destination: "\/buy"/);
});

test("bridge docs URL is documented for operators", () => {
  assert.match(LIFI_BRIDGE_DOCS_URL, /docs\.li\.fi/);
});
