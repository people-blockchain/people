import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

const ICON_PATHS = [
  "public/favicon.ico",
  "public/site.webmanifest",
  "public/people-wallet.webmanifest",
  "public/people-wallet-sw.js",
  "public/brand/icon-16.png",
  "public/brand/icon-32.png",
  "public/brand/apple-touch-icon.png",
  "src/app/favicon.ico",
  "src/app/icon.png",
  "src/app/apple-icon.png",
];

test("brand favicon and manifest assets exist on disk", () => {
  for (const rel of ICON_PATHS) {
    const path = join(root, rel);
    const st = statSync(path);
    assert.ok(st.size > 0, `${rel} should not be empty`);
  }
  const manifest = JSON.parse(readFileSync(join(root, "public/site.webmanifest"), "utf8"));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});
