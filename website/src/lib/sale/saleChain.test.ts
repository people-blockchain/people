import assert from "node:assert/strict";
import test from "node:test";

import { BASE_USDC_ADDRESS, BASE_USDT_ADDRESS, hubPaymentToken } from "./bridge.ts";
import { saleContractAddress, saleContractConfigured } from "./config.ts";
import {
  assertProductionSaleMode,
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

const TEST_HUB = "0x5555555555555555555555555555555555555555";
const TEST_USDC = "0x6666666666666666666666666666666666666666";
const TEST_USDT = "0x7777777777777777777777777777777777777777";

const BASE_TEST_ENV = {
  NEXT_PUBLIC_SALE_CHAIN: "base-test",
  NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB,
  NEXT_PUBLIC_SEPOLIA_HUB_ADDRESS: SEP_HUB,
  NEXT_PUBLIC_SEPOLIA_USDC_ADDRESS: SEP_USDC,
  NEXT_PUBLIC_BASE_TEST_HUB_ADDRESS: TEST_HUB,
  NEXT_PUBLIC_BASE_TEST_USDC_ADDRESS: TEST_USDC,
  NEXT_PUBLIC_BASE_TEST_USDT_ADDRESS: TEST_USDT,
};

test("base-test resolves to Base mainnet chain 8453 with the normal Base RPC", () => {
  const chain = resolveSaleChain(BASE_TEST_ENV);
  assert.equal(resolveSaleChainKey(BASE_TEST_ENV), "base-test");
  assert.equal(chain.key, "base-test");
  assert.equal(chain.id, 8453);
  assert.equal(chain.viemChain.id, 8453);
  assert.equal(chain.rpcUrl, "https://mainnet.base.org");
  assert.equal(chain.explorer, "https://basescan.org");
  assert.equal(chain.testnet, false);
  assert.equal(
    resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_BASE_RPC_URL: " https://rpc.example/base " }).rpcUrl,
    "https://rpc.example/base",
  );
});

test("base-test takes hub and tokens from NEXT_PUBLIC_BASE_TEST_*, never from mainnet or Sepolia", () => {
  const chain = resolveSaleChain(BASE_TEST_ENV);
  assert.equal(chain.hubAddress, TEST_HUB);
  assert.equal(saleTokenAddress("USDC", chain), TEST_USDC);
  assert.equal(saleTokenAddress("USDT", chain), TEST_USDT);
  assert.equal(saleContractAddress(BASE_TEST_ENV), TEST_HUB);
  assert.equal(saleContractConfigured(BASE_TEST_ENV), true);

  const bare = resolveSaleChain({ NEXT_PUBLIC_SALE_CHAIN: "base-test", NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB });
  assert.equal(bare.hubAddress, null);
  assert.equal(bare.tokens.USDC, null);
  assert.equal(bare.tokens.USDT, null);
  assert.equal(saleContractConfigured({ NEXT_PUBLIC_SALE_CHAIN: "base-test", NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB }), false);
});

test("base-test flag is case-insensitive and trimmed", () => {
  assert.equal(resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_SALE_CHAIN: "  Base-Test " }).key, "base-test");
  for (const value of ["basetest", "base_test", "test", "base-test-2"]) {
    assert.equal(resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_SALE_CHAIN: value }).key, "base", value);
  }
});

test("base-test addresses are validated as 0x + 40 hex", () => {
  const chain = resolveSaleChain({
    NEXT_PUBLIC_SALE_CHAIN: "base-test",
    NEXT_PUBLIC_BASE_TEST_HUB_ADDRESS: "0x123",
    NEXT_PUBLIC_BASE_TEST_USDC_ADDRESS: "not-an-address",
    NEXT_PUBLIC_BASE_TEST_USDT_ADDRESS: `0x${"g".repeat(40)}`,
  });
  assert.equal(chain.hubAddress, null);
  assert.equal(chain.tokens.USDC, null);
  assert.equal(chain.tokens.USDT, null);
  const padded = resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_BASE_TEST_USDC_ADDRESS: ` ${TEST_USDC} ` });
  assert.equal(padded.tokens.USDC, TEST_USDC);
});

test("hubPaymentToken uses the base-test tokens", () => {
  const chain = resolveSaleChain(BASE_TEST_ENV);
  assert.equal(hubPaymentToken("USDC", false, chain), TEST_USDC);
  assert.equal(hubPaymentToken("USDT", false, chain), TEST_USDC);
  assert.equal(hubPaymentToken("USDT", true, chain), TEST_USDT);
});

test("faucet is on only in base-test; test-token flag covers both test modes", () => {
  const main = resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_SALE_CHAIN: undefined });
  const sepolia = resolveSaleChain(SEPOLIA_ENV);
  const test_ = resolveSaleChain(BASE_TEST_ENV);
  assert.deepEqual([main.faucet, sepolia.faucet, test_.faucet], [false, false, true]);
  assert.deepEqual([main.testTokens, sepolia.testTokens, test_.testTokens], [false, true, true]);
  for (const value of [undefined, "", "base", "mainnet", "base-sepolia"]) {
    assert.equal(resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_SALE_CHAIN: value }).faucet, false, String(value));
  }
});

test("production build (VERCEL_ENV=production) fails for any non-base sale mode", () => {
  for (const mode of ["base-test", "base-sepolia", "  Base-Test "]) {
    assert.throws(
      () => resolveSaleChain({ ...BASE_TEST_ENV, NEXT_PUBLIC_SALE_CHAIN: mode, VERCEL_ENV: "production" }),
      /production build[\s\S]*sale mode "base"/,
      mode,
    );
  }
  assert.throws(() => assertProductionSaleMode({ VERCEL_ENV: "production" }, "base-test"), /base-test/);
});

test("production build with base mode (or no flag) resolves normally", () => {
  for (const value of [undefined, "", "base", "mainnet"]) {
    const chain = resolveSaleChain({ NEXT_PUBLIC_SALE_CHAIN: value, NEXT_PUBLIC_SALE_HUB_ADDRESS: HUB, VERCEL_ENV: "production" });
    assert.equal(chain.key, "base", String(value));
    assert.equal(chain.hubAddress, HUB);
  }
});

test("production build, base mode, no hub address: does not throw, hubAddress is null", () => {
  // The state of production before the hub is deployed: no NEXT_PUBLIC_SALE_CHAIN, no hub address,
  // no SEPOLIA_* / BASE_TEST_* variables. The guard rejects only a non-base mode, never a missing address.
  for (const value of [undefined, "", "base", "mainnet"]) {
    const env = { VERCEL_ENV: "production", NEXT_PUBLIC_SALE_CHAIN: value };
    assert.doesNotThrow(() => resolveSaleChain(env), String(value));
    const chain = resolveSaleChain(env);
    assert.equal(chain.key, "base", String(value));
    assert.equal(chain.hubAddress, null, String(value));
    assert.equal(chain.faucet, false);
    assert.equal(chain.testTokens, false);
    assert.equal(saleContractAddress(env), null);
    assert.equal(saleContractConfigured(env), false);
  }
  assert.doesNotThrow(() => resolveSaleChain({ VERCEL_ENV: "production" }));
  assert.doesNotThrow(() => resolveSaleChain({ VERCEL_ENV: "production", NEXT_PUBLIC_SALE_HUB_ADDRESS: "" }));
  assert.doesNotThrow(() => assertProductionSaleMode({ VERCEL_ENV: "production" }, "base"));
});

test("production build: an empty or malformed hub address is not an error, only a non-base mode is", () => {
  for (const hub of ["", "   ", "0xabc", "not-an-address"]) {
    const chain = resolveSaleChain({ VERCEL_ENV: "production", NEXT_PUBLIC_SALE_HUB_ADDRESS: hub });
    assert.equal(chain.key, "base", hub);
    assert.equal(chain.hubAddress, null, hub);
  }
  // The same missing hub address with a test mode still fails: the guard looks at the mode alone.
  assert.throws(() => resolveSaleChain({ VERCEL_ENV: "production", NEXT_PUBLIC_SALE_CHAIN: "base-test" }), /base-test/);
  assert.throws(() => resolveSaleChain({ VERCEL_ENV: "production", NEXT_PUBLIC_SALE_CHAIN: "base-sepolia" }), /base-sepolia/);
});

test("preview, development and unset VERCEL_ENV keep the test modes available", () => {
  for (const vercelEnv of ["preview", "development", "", undefined]) {
    assert.equal(resolveSaleChain({ ...BASE_TEST_ENV, VERCEL_ENV: vercelEnv }).key, "base-test", String(vercelEnv));
    assert.equal(resolveSaleChain({ ...SEPOLIA_ENV, VERCEL_ENV: vercelEnv }).key, "base-sepolia", String(vercelEnv));
  }
});
