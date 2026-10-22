// AUDIT M7: public founders aggregates must be CDN-cacheable so every visitor does not run the
// COUNT/GROUP BY queries again. Route modules import `next/server`, which plain Node cannot
// load, so (like sale-evm-confirm.test.mjs) this checks the route source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("transparency counters are served with a shared CDN cache", () => {
  const src = read("src/app/api/founders/transparency/route.ts");
  assert.match(src, /"Cache-Control": "public, s-maxage=30, stale-while-revalidate=300"/);
  assert.match(src, /maxAmbassadors: MAX_AMBASSADORS \},\s*\{ headers: CACHE_HEADERS \}/);
});

test("founder lookup hits and misses carry a shared CDN cache", () => {
  const src = read("src/app/api/founders/lookup/route.ts");
  assert.match(src, /"Cache-Control": "public, s-maxage=30, stale-while-revalidate=300"/);
  assert.match(src, /NextResponse\.json\(\{ founder \}, \{ headers: FOUND_CACHE_HEADERS \}\)/);
  assert.match(src, /status: 404, headers: NOT_FOUND_CACHE_HEADERS/);
});

test("rate-limit and error responses are never marked cacheable", () => {
  for (const rel of ["src/app/api/founders/transparency/route.ts", "src/app/api/founders/lookup/route.ts"]) {
    const src = read(rel);
    for (const line of src.split("\n").filter((l) => /rate_limited|server_error|unavailable/.test(l))) {
      assert.doesNotMatch(line, /CACHE_HEADERS/, `${rel}: ${line.trim()}`);
    }
  }
});
