import assert from "node:assert/strict";
import test from "node:test";

import { parseUsdAmount } from "../src/lib/sale/amount.ts";

test("comma and dot are decimal separators", () => {
  assert.deepEqual(parseUsdAmount("10,5"), { ok: true, value: 10.5 });
  assert.deepEqual(parseUsdAmount("10.5"), { ok: true, value: 10.5 });
  assert.deepEqual(parseUsdAmount(" 25 "), { ok: true, value: 25 });
});

test("thousands separators, negatives and junk are invalid", () => {
  for (const raw of ["1,000", "-5", "abc", "1e3", "10.555", "1 000,5x"]) {
    assert.deepEqual(parseUsdAmount(raw), { ok: false, reason: "invalid" }, raw);
  }
  assert.deepEqual(parseUsdAmount(""), { ok: false, reason: "empty" });
});

test("small and large values parse; limits are the form's job", () => {
  assert.deepEqual(parseUsdAmount("0.5"), { ok: true, value: 0.5 });
  assert.deepEqual(parseUsdAmount("500,01"), { ok: true, value: 500.01 });
});
