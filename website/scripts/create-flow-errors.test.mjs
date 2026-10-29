import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toFunctionSelector } from "viem";
import {
  INSUFFICIENT_FLOAT_SELECTOR,
  checkBalanceForCost,
  classifyCreateFlowError,
  requiredFeeValue,
} from "../src/lib/evm/create-flow-errors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("InsufficientFloat selector matches the StableFeeGateway custom error", () => {
  assert.equal(toFunctionSelector("InsufficientFloat(uint256,uint256)"), INSUFFICIENT_FLOAT_SELECTOR);
});

test("InsufficientFloat is detected from revert data", () => {
  const err = Object.assign(new Error("execution reverted"), {
    data: `${INSUFFICIENT_FLOAT_SELECTOR}${"00".repeat(64)}`,
  });
  assert.equal(classifyCreateFlowError(err).code, "stable_fee_unavailable");
});

test("InsufficientFloat is detected by errorName on a nested cause", () => {
  const inner = Object.assign(new Error("reverted"), {
    data: { errorName: "InsufficientFloat", args: [1n, 0n] },
  });
  const err = new Error("outer", { cause: inner });
  assert.equal(classifyCreateFlowError(err).code, "stable_fee_unavailable");
});

test("insufficient funds is detected and have/want amounts are parsed", () => {
  const err = new Error(
    "insufficient funds for gas * price + value: address 0x1 have 1295000000000000000 want 2925000000000000000",
  );
  const result = classifyCreateFlowError(err);
  assert.equal(result.code, "insufficient_funds");
  assert.equal(result.balanceWei, 1_295_000_000_000_000_000n);
  assert.equal(result.neededWei, 2_925_000_000_000_000_000n);
});

test("InsufficientFee from the factories is treated as insufficient funds", () => {
  assert.equal(classifyCreateFlowError(new Error("reverted with custom error 'InsufficientFee()'")).code, "insufficient_funds");
});

test("wallet rejection code 4001 is detected", () => {
  const err = Object.assign(new Error("User rejected the request."), { code: 4001 });
  assert.equal(classifyCreateFlowError(err).code, "wallet_rejected");
});

test("fetch failures are network errors", () => {
  assert.equal(classifyCreateFlowError(new Error("fetch failed")).code, "network");
  assert.equal(classifyCreateFlowError(new Error("HTTP request failed")).code, "network");
});

test("an unclassified error stays unknown", () => {
  assert.equal(classifyCreateFlowError(new Error("boom")).code, "unknown");
});

test("a wrong network error stays unknown for the legacy mapping", () => {
  assert.equal(classifyCreateFlowError(new Error("wrong network")).code, "unknown");
});

test("checkBalanceForCost compares balance with fee plus gas", () => {
  const enough = checkBalanceForCost(10n, 7n);
  assert.deepEqual(enough, { ok: true, neededWei: 7n, balanceWei: 10n });
  const short = checkBalanceForCost(1_295n, 2_925n);
  assert.deepEqual(short, { ok: false, neededWei: 2_925n, balanceWei: 1_295n });
});

test("requiredFeeValue subtracts the prepaid credit, capped at the fee", () => {
  const fee = 2_925_000_000_000_000_000n;
  assert.equal(requiredFeeValue(fee, 0n), fee);
  assert.equal(requiredFeeValue(fee, fee), 0n);
  assert.equal(requiredFeeValue(fee, fee + 1n), 0n);
  assert.equal(requiredFeeValue(fee, 1_000_000_000_000_000_000n), fee - 1_000_000_000_000_000_000n);
});

test("all 12 nft-media locales carry the create-flow error keys", () => {
  const keys = [
    "errStableFeeUnavailable",
    "errInsufficientPpl",
    "errInsufficientPplGeneric",
    "errNetworkRpc",
  ];
  for (const lang of ["ar", "de", "en", "es", "fr", "id", "it", "pt", "ru", "tr", "vi", "zh"]) {
    const copy = JSON.parse(
      readFileSync(join(root, "src/lib/locales/surfaces", `nft-media-${lang}.json`), "utf8"),
    );
    for (const key of keys) {
      assert.equal(typeof copy[key], "string", `${lang} ${key}`);
      assert.ok(copy[key].trim().length > 0, `${lang} ${key} is empty`);
    }
    assert.match(copy.errInsufficientPpl, /\{needed\}/, `${lang} needed placeholder`);
    assert.match(copy.errInsufficientPpl, /\{balance\}/, `${lang} balance placeholder`);
  }
});
