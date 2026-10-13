import { test } from "node:test";
import assert from "node:assert/strict";
import { slugifyMerchantName, withSlugSuffix } from "../src/lib/lavka/slug.ts";

test("slugify merchant names", () => {
  assert.equal(slugifyMerchantName("Batumi Barbers"), "batumi-barbers");
  assert.equal(slugifyMerchantName("  "), "shop");
  assert.equal(withSlugSuffix("batumi", "abc123").length <= 56, true);
});
