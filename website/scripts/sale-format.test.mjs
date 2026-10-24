import assert from "node:assert/strict";
import test from "node:test";

import { formatMonths, pct, pplCompact, usd } from "../src/lib/sale/format.ts";

test("percent follows the language's style", () => {
  assert.match(pct(1.5, "fr"), /1,5/);
  assert.match(pct(1.5, "fr"), /%/);
  assert.ok(pct(1.5, "tr").startsWith("%"));
});

test("dollar sign placement per language", () => {
  assert.equal(usd(2000, "es"), "US$ 2.000");
  assert.equal(usd(2000, "en"), "$2,000");
  assert.ok(usd(4000000, "de").endsWith(" $"));
});

test("compact numbers keep two decimals and the local suffix", () => {
  assert.match(pplCompact(55_660_000, "ru"), /млн/);
  assert.match(pplCompact(55_660_000, "en"), /55\.66M/);
});

test("months take the right plural", () => {
  assert.equal(formatMonths(24, "ru"), "24 месяца");
  assert.match(formatMonths(6, "ar"), /أشهر/);
  assert.equal(formatMonths(24, "en"), "24 months");
});
