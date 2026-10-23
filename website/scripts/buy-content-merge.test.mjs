import assert from "node:assert/strict";
import test from "node:test";

import { __withEnFallbackForTests as merge, buyCopy } from "../src/lib/buy-content.ts";

test("a locale missing a nested key falls back to en for that key only", () => {
  const out = merge({ form: { cta: "X" } });
  assert.equal(out.form.cta, "X");
  assert.equal(out.form.riskBody, buyCopy.en.form.riskBody);
});

test("arrays of a different length fall back to en as a whole", () => {
  const out = merge({ faq: { items: [{ q: "only", a: "one" }] } });
  assert.equal(out.faq.items.length, buyCopy.en.faq.items.length);
});

test("a complete locale keeps its own values", () => {
  assert.equal(buyCopy.ru.form.riskTitle, JSON.parse(JSON.stringify(buyCopy.ru)).form.riskTitle);
  assert.notEqual(buyCopy.ru.form.riskBody, buyCopy.en.form.riskBody);
});
