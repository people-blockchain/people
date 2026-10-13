import assert from "node:assert/strict";
import { test } from "node:test";
import { bindErrorMessage, shortWalletAddress } from "./bind-errors.ts";

const t = {
  bindErrorGeneric: "generic",
  bindErrorExpired: "expired",
  bindErrorTaken: "taken",
  bindErrorWrongPassword: "wrong",
} as const;

test("bindErrorMessage maps API codes", () => {
  assert.equal(bindErrorMessage("challenge_expired", t), "expired");
  assert.equal(bindErrorMessage("wallet_taken", t), "taken");
  assert.equal(bindErrorMessage("bad_signature", t), "generic");
  assert.equal(bindErrorMessage(undefined, t), "generic");
});

test("shortWalletAddress abbreviates long addresses", () => {
  const addr = "0xabcdef1234567890abcdef1234567890abcdef12";
  assert.equal(shortWalletAddress(addr), "0xabcd…ef12");
});
