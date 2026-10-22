import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hexToString, parseEther } from "viem";
import { MEMO_MAX_CHARS, memoFromInput, memoLength, memoToData, validateMemo } from "../src/lib/evm/memo.ts";
import { classifyInput } from "../src/lib/evm/explorer-blocks.ts";
import { buildNativeTransferRequest } from "../src/lib/evm/wallet-send.ts";

const TO = "0x1111111111111111111111111111111111111111";

test("empty and whitespace-only memo means no memo", () => {
  assert.deepEqual(validateMemo(""), { ok: true, memo: "" });
  assert.deepEqual(validateMemo("   \n "), { ok: true, memo: "" });
  assert.equal(memoToData(""), undefined);
  assert.equal(memoToData(undefined), undefined);
});

test("limit is 256 characters counted as code points", () => {
  assert.equal(MEMO_MAX_CHARS, 256);
  assert.equal(validateMemo("a".repeat(256)).ok, true);
  assert.deepEqual(validateMemo("a".repeat(257)), { ok: false, error: "long" });
  assert.equal(validateMemo("😀".repeat(256)).ok, true);
  assert.equal(memoLength("😀😀"), 2);
  assert.deepEqual(validateMemo("😀".repeat(257)), { ok: false, error: "long" });
});

test("control, bidi and zero-width characters are rejected", () => {
  for (const bad of ["a\u0000b", "a\u0007b", "a\u202Eb", "a\u200Bb", "a\u007Fb", "a\uFEFFb", "a\uD800b"]) {
    assert.deepEqual(validateMemo(bad), { ok: false, error: "invalid" }, JSON.stringify(bad));
  }
  assert.equal(validateMemo("line1\nline2\tx").ok, true);
});

test("memo is trimmed and NFC-normalised", () => {
  assert.deepEqual(validateMemo("  é  "), { ok: true, memo: "é" });
});

test("memo is carried as UTF-8 transaction data in the built transfer", () => {
  const request = buildNativeTransferRequest({ to: TO, amountPpl: 1.5, memo: "Счёт № 42 ✓" });
  assert.equal(request.to, TO);
  assert.equal(request.value, parseEther("1.5"));
  assert.ok(request.data);
  assert.equal(hexToString(request.data), "Счёт № 42 ✓");
});

test("no memo means no data field at all (plain transfer is unchanged)", () => {
  const request = buildNativeTransferRequest({ to: TO, amountPpl: 2 });
  assert.equal("data" in request, false);
  assert.equal("data" in buildNativeTransferRequest({ to: TO, amountPpl: 2, memo: "  " }), false);
});

test("invalid memo never reaches the transaction", () => {
  assert.throws(() => buildNativeTransferRequest({ to: TO, amountPpl: 1, memo: "x".repeat(300) }), /memo_long/);
  assert.throws(() => buildNativeTransferRequest({ to: TO, amountPpl: 1, memo: "a\u0000" }), /memo_invalid/);
});

test("memo round-trips from transaction input", () => {
  const data = memoToData("Invoice 42 — thanks 🙏");
  assert.equal(memoFromInput(data), "Invoice 42 — thanks 🙏");
});

test("contract calls and empty input are not mistaken for memos", () => {
  assert.equal(memoFromInput("0x"), undefined);
  assert.equal(memoFromInput(undefined), undefined);
  assert.equal(memoFromInput("0xa9059cbb" + "00".repeat(12) + "11".repeat(20) + "00".repeat(31) + "01"), undefined);
  assert.equal(memoFromInput("0xff"), undefined); // invalid UTF-8
  assert.equal(memoFromInput("0x00"), undefined); // control byte
  assert.equal(memoFromInput("0xzz"), undefined);
});

test("markup in a memo stays plain text data (rendering escapes it in React)", () => {
  const data = memoToData("<img src=x onerror=alert(1)>");
  assert.equal(memoFromInput(data), "<img src=x onerror=alert(1)>");
});

test("memo form strings exist and are translated in all 12 locales", () => {
  const read = (lang) => JSON.parse(readFileSync(new URL(`../src/lib/locales/surfaces/wallet-ux-${lang}.json`, import.meta.url), "utf8"));
  const en = read("en");
  for (const lang of ["en", "ru", "es", "pt", "fr", "de", "it", "tr", "vi", "id", "zh", "ar"]) {
    const copy = read(lang);
    for (const key of ["memo", "memoLabel", "memoHint", "memoPlaceholder", "memoInvalid", "memoContract", "memoLong"]) {
      assert.ok(typeof copy[key] === "string" && copy[key].trim(), `${lang}.${key}`);
      if (lang !== "en") assert.notEqual(copy[key], en[key], `${lang}.${key} must not fall back to English`);
    }
  }
});

test("explorer classifies a memo transfer as transfer with memo, and real calldata as contract", () => {
  assert.deepEqual(classifyInput("0x"), { type: "transfer" });
  assert.deepEqual(classifyInput(memoToData("rent")), { type: "transfer", payload: { memo: "rent" } });
  assert.deepEqual(classifyInput("0xa9059cbb" + "00".repeat(32)), { type: "contract" });
  assert.deepEqual(classifyInput("0xa9059cbb" + "00".repeat(32), "contract_call"), { type: "contract_call" });
});
