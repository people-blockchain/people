import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import {
  formatPplDisplay,
  formatPplExact,
  formatUsd6,
  maxSendWei,
  parsePplInput,
  pplWeiToUsd6,
} from "../src/lib/asset-amounts.ts";
import { maxTransferAmount } from "../src/lib/wallet-activity.ts";

const fee = parseUnits("0.004875", 18);

test("100 PPL minus 99.995125 PPL is exactly 0.004875 PPL", () => {
  const diff = parseUnits("100", 18) - parseUnits("99.995125", 18);
  assert.equal(diff, parseUnits("0.004875", 18));
  assert.equal(formatPplExact(diff), "0.004875");
});

test("exact formatter strips trailing zeros", () => {
  assert.equal(formatPplExact(parseUnits("100", 18)), "100");
  assert.equal(formatPplExact(parseUnits("1.500", 18)), "1.5");
  assert.equal(formatPplExact(parseUnits("1.2300", 18)), "1.23");
  assert.equal(formatPplDisplay(parseUnits("100", 18)), "100");
  assert.equal(formatPplDisplay(parseUnits("1.50", 18)), "1.5");
  assert.equal(formatPplDisplay(parseUnits("0.004875", 18)), "0.0049");
});

test("tiny amounts render below 0.0001 PPL", () => {
  assert.equal(formatPplDisplay(1n), "< 0.0001 PPL");
  assert.equal(formatPplDisplay(parseUnits("0.0000999", 18)), "< 0.0001 PPL");
  assert.equal(formatPplDisplay(parseUnits("0.0001", 18)), "0.0001");
});

test("Max is balance minus fee, exact in wei", () => {
  const balance = parseUnits("100", 18);
  assert.equal(maxSendWei(balance, fee), parseUnits("99.995125", 18));
  assert.equal(maxTransferAmount(balance, fee), "99.995125");
  assert.equal(maxSendWei(fee, fee), 0n);
  assert.equal(maxTransferAmount(parseUnits("0.004875", 18), fee), "0");
});

test("user input accepts a comma decimal separator and rejects junk", () => {
  assert.equal(parsePplInput("0,004875"), parseUnits("0.004875", 18));
  assert.equal(parsePplInput(" 99.995125 "), parseUnits("99.995125", 18));
  assert.equal(parsePplInput(""), null);
  assert.equal(parsePplInput("1e3"), null);
  assert.equal(parsePplInput("-1"), null);
  assert.equal(parsePplInput("0.0000000000000000001"), null);
});

test("USD conversion stays in fixed-point until the final string", () => {
  const usd6 = pplWeiToUsd6(parseUnits("100", 18), parseUnits("0.005", 18));
  assert.equal(usd6, 500_000n);
  assert.equal(formatUsd6(usd6), "0.50");
  assert.equal(formatUsd6(1n), "0.00");
  assert.equal(formatUsd6(10_000n), "0.01");
});
