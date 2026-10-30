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
  readBalanceWei,
  weiFromField,
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

test("account balance becomes wei from legacy numbers, hex, and decimal strings", () => {
  const ten = parseUnits("10", 18);
  assert.equal(readBalanceWei({ balance: 10, nonce: 0, balances: { demo: 1_230_000 } }), ten);
  assert.equal(readBalanceWei({ balance: 0.1 }), parseUnits("0.1", 18));
  assert.equal(readBalanceWei({ balance: 13.84472 }), parseUnits("13.84472", 18));
  assert.equal(readBalanceWei({ balance: "10" }), ten);
  assert.equal(readBalanceWei({ balance: "99.995125" }), parseUnits("99.995125", 18));
  assert.equal(readBalanceWei({ balance: "0x8ac7230489e80000" }), ten);
  assert.equal(readBalanceWei({ balanceWei: "10000000000000000000" }), ten);
  assert.equal(readBalanceWei({ balanceWei: "0x8ac7230489e80000", balance: 1 }), ten);
  assert.equal(readBalanceWei({ balanceWei: "10.5" }), parseUnits("10.5", 18));
  assert.equal(readBalanceWei({ balances: { ppl: 7 } }), parseUnits("7", 18));
  assert.equal(readBalanceWei({ balances: { pplWei: "1000", ppl: 7 } }), 1000n);
  assert.equal(weiFromField("0x10"), 16n);
  assert.equal(weiFromField("1000"), 1000n);
  assert.equal(readBalanceWei({ balance: -1 }), null);
  assert.equal(readBalanceWei({}), null);
});
