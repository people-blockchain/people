import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = join(root, "public", "seed");
const bases = ["tROSC", "tPITP", "tMARK", "tKRDA", "tMEM", "tGOOD"];

test("demo token coin assets exist as PNG 256 and SVG", () => {
  for (const base of bases) {
    const png = join(seed, `${base}.png`);
    const svg = join(seed, `${base}.svg`);
    assert.ok(existsSync(png), png);
    assert.ok(existsSync(svg), svg);
    const text = readFileSync(svg, "utf8");
    assert.match(text, /<svg[\s\S]*viewBox="0 0 128 128"/);
    assert.match(text, /clip-path="url\(#coin\)"/);
  }
});

test("evm-seed-assets references svg icons", () => {
  const json = JSON.parse(readFileSync(join(root, "src", "data", "evm-seed-assets.json"), "utf8"));
  for (const base of bases) {
    const hit = Object.values(json.assets).find((a) => a.creationMetadata?.image === `/seed/${base}.svg`);
    assert.ok(hit, base);
  }
});
