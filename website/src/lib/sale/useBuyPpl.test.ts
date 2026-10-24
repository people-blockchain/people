import assert from "node:assert/strict";
import test from "node:test";

import { assertReceiptSuccess, buyWithArgs, classifyBuyError, minOutWithSlippage } from "./useBuyPpl.ts";

test("minPplOut is 99% of the quoted amount", () => {
  assert.equal(minOutWithSlippage(BigInt(1_000_000)), BigInt(990_000));
});

test("a rejected signature maps to txRejected without throwing", () => {
  assert.equal(classifyBuyError({ code: 4001 }).reason, "txRejected");
  assert.equal(classifyBuyError({ name: "UserRejectedRequestError" }).reason, "txRejected");
});

test("slippage and limit reverts get their own messages", () => {
  assert.equal(classifyBuyError({ message: "execution reverted: minOut" }).reason, "priceMoved");
  assert.equal(classifyBuyError({ message: "reverted: cooldown active" }).reason, "limit");
  const other = classifyBuyError({ message: "x".repeat(300) });
  assert.equal(other.reason, "txFailed");
  assert.equal(other.detail?.length, 120);
});

test("a reverted receipt is an error, a successful one passes", () => {
  assert.throws(() => assertReceiptSuccess({ status: "reverted" }));
  assert.doesNotThrow(() => assertReceiptSuccess({ status: "success" }));
});

test("buyWith gets the connected wallet as recipient", () => {
  const account = "0x00000000000000000000000000000000000000a1";
  const token = "0x00000000000000000000000000000000000000b2";
  assert.deepEqual(buyWithArgs({ account, token }, BigInt(100), BigInt(99)), [token, BigInt(100), BigInt(99), account]);
});
