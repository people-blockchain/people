import assert from "node:assert/strict";
import test from "node:test";

import { BASE_USDC_ADDRESS, BASE_USDT_ADDRESS, hubPaymentToken } from "./bridge.ts";
import { saleContractAddress, saleContractConfigured } from "./config.ts";
import {
  BASE_MAINNET_USDC,
  BASE_MAINNET_USDT,
  resolveSaleChain,
  resolveSaleChainKey,
  saleTokenAddress,
} from "./saleChain.ts";

const HUB = "0x1111111111111111111111111111111111111111";
const SEP_HUB = "0x2222222222222222222222222222222222222222";
const SEP_USDC = "0x3333333333333333333333333333333333333333";
const SEP_USDT = "0x4444444444444444444444444444444444444444";

const SEPOLIA_ENV = {
  NEXT_PUBLIC_SALE_CHAIN: "base-sepolia",
  NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB,
  NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: SEP_HUB,
  NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS: SEP_USDC,
  NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS: SEP_USDT,
};

test("no flag resolves to Base mainnet with production addresses", () => {
  const chain = resolveSaleChain({ NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB });
  assert.equal(chain.key, "base");
  assert.equal(chain.id, 8453);
  assert.equal(chain.viemChain.id, 8453);
  assert.equal(chain.rpcUrl, "https://mainnet.base.org");
  assert.equal(chain.explorer, "https://basescan.org");
  assert.equal(chain.testnet, false);
  assert.equal(chain.hubAddress, HUB);
  assert.equal(chain.tokens.USDC, BASE_MAINNET_USDC);
  assert.equal(chain.tokens.USDT, BASE_MAINNET_USDT);
  assert.equal(BASE_USDC_ADDRESS, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(BASE_USDT_ADDRESS, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
});

test("unknown or empty flag values stay on mainnet and ignore Sepolia variables", () => {
  for (const value of [undefined, "", "base", "mainnet", "sepolia", "base-sepolia-2"]) {
    const chain = resolveSaleChain({ ...SEPOLIA_ENV, NEXT_PUBLIC_SALE_CHAIN: value });
    assert.equal(chain.key, "base", String(value));
    assert.equal(chain.id, 8453);
    assert.equal(chain.hubAddress, HUB);
    assert.equal(chain.tokens.USDC, BASE_MAINNET_USDC);
  }
});

test("mainnet RPC is overridable via NEXT_PUBLIC_BASE_RPC_URL", () => {
  assert.equal(resolveSaleChain({ NEXT_PUBLIC_BASE_RPC_URL: " https://rpc.example/base " }).rpcUrl, "https://rpc.example/base");
});

test("base-sepolia resolves to chain 84532 with Sepolia hub and tokens", () => {
  const chain = resolveSaleChain(SEPOLIA_ENV);
  assert.equal(resolveSaleChainKey(SEPOLIA_ENV), "base-sepolia");
  assert.equal(chain.key, "base-sepolia");
  assert.equal(chain.id, 84532);
  assert.equal(chain.viemChain.id, 84532);
  assert.equal(chain.rpcUrl, "https://sepolia.base.org");
  assert.equal(chain.explorer, "https://sepolia.basescan.org");
  assert.equal(chain.testnet, true);
  assert.equal(chain.hubAddress, SEP_HUB);
  assert.equal(saleTokenAddress("USDC", chain), SEP_USDC);
  assert.equal(saleTokenAddress("USDT", chain), SEP_USDT);
});

test("the flag is case-insensitive and trimmed; Sepolia RPC is overridable", () => {
  const chain = resolveSaleChain({
    NEXT_PUBLIC_SALE_CHAIN: "  Base-Sepolia ",
    NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: "https://rpc.example/sepolia",
  });
  assert.equal(chain.id, 84532);
  assert.equal(chain.rpcUrl, "https://rpc.example/sepolia");
});

test("Sepolia addresses are validated as 0x + 40 hex and never fall back to mainnet", () => {
  const chain = resolveSaleChain({
    NEXT_PUBLIC_SALE_CHAIN: "base-sepolia",
    NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB,
    NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: "0x123",
    NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS: "not-an-address",
    NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS: `0x${"g".repeat(40)}`,
  });
  assert.equal(chain.hubAddress, null);
  assert.equal(chain.tokens.USDC, null);
  assert.equal(chain.tokens.USDT, null);
});

test("mainnet hub address is validated too", () => {
  assert.equal(resolveSaleChain({ NEXT_PUBLIC_SALE_HUB_ADDRESS: "0xabc" }).hubAddress, null);
  assert.equal(resolveSaleChain({}).hubAddress, null);
});

test("saleContractAddress / saleContractConfigured follow the resolved chain", () => {
  assert.equal(saleContractAddress(SEPOLIA_ENV), SEP_HUB);
  assert.equal(saleContractConfigured(SEPOLIA_ENV), true);
  assert.equal(saleContractAddress({ ...SEPOLIA_ENV, NEXT_PUBLIC_SALE_CHAIN: undefined }), HUB);
  assert.equal(saleContractConfigured({ NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: SEP_HUB }), false);
});

test("hubPaymentToken picks the configured token of the resolved chain", () => {
  const main = resolveSaleChain({});
  assert.equal(hubPaymentToken("USDC", false, main), BASE_MAINNET_USDC);
  assert.equal(hubPaymentToken("USDT", false, main), BASE_MAINNET_USDC);
  assert.equal(hubPaymentToken("USDT", true, main), BASE_MAINNET_USDT);

  const sepolia = resolveSaleChain(SEPOLIA_ENV);
  assert.equal(hubPaymentToken("USDC", false, sepolia), SEP_USDC);
  assert.equal(hubPaymentToken("USDT", false, sepolia), SEP_USDC);
  assert.equal(hubPaymentToken("USDT", true, sepolia), SEP_USDT);

  const noUsdt = resolveSaleChain({ ...SEPOLIA_ENV, NEXT_PUBLIC_SEPOLIA_USDT_ADDRESS: undefined });
  assert.equal(hubPaymentToken("USDT", true, noUsdt), SEP_USDC);
  const noTokens = resolveSaleChain({ NEXT_PUBLIC_SALE_CHAIN: "base-sepolia" });
  assert.equal(hubPaymentToken("USDC", false, noTokens), null);
});
