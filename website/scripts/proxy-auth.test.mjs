import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("proxy NextAuth must not spread email providers without adapter", () => {
  const src = readFileSync(join(root, "src/proxy.ts"), "utf8");
  assert.match(src, /providers:\s*\[\]/);
  assert.match(src, /adapter:\s*undefined/);
});
