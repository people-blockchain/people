import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("million-counter route uses verified aggregates and CDN cache window", () => {
  const src = read("src/app/api/founders/million-counter/route.ts");
  assert.match(src, /getFounderMapStats/);
  assert.match(src, /emptyFounderMapStats/);
  assert.match(src, /max-age=60, s-maxage=120, stale-while-revalidate=300/);
  assert.match(src, /source: "verified"/);
  assert.match(src, /source: "stub"/);
  assert.doesNotMatch(src, /walletAddress|founderNumber|userId/);
});

test("million-counter stub and error responses stay uncached", () => {
  const src = read("src/app/api/founders/million-counter/route.ts");
  for (const line of src.split("\n").filter((l) => /source: "stub"|source: "error"/.test(l))) {
    assert.doesNotMatch(line, /CACHE_HEADERS/, line.trim());
  }
});

test("founders map route exposes read-only country aggregates", () => {
  const src = read("src/app/api/founders/map/route.ts");
  assert.match(src, /countries: stats\.countries/);
  assert.match(src, /byCountry: stats\.byCountry/);
  assert.match(src, /checkSharedRateLimit\("founders-map"/);
  assert.match(src, /emptyFounderMapStats\(FOUNDER_GOAL\)/);
  assert.doesNotMatch(src, /select\(\{[^}]*walletAddress/s);
});
